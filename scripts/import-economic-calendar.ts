/**
 * CLI: import an MT5 economic calendar export into the database.
 *
 * Export the CSV first with scripts/mt5/ExportEconomicCalendar.mq5, then:
 *
 *   npm run calendar:import -- \
 *     --file ./data/forextestlab-calendar.csv \
 *     --timezone Europe/Kyiv
 *
 * --timezone is your broker's server zone, because that is the zone MetaTrader
 * reports calendar times in. Name the IANA zone rather than a fixed offset so
 * events either side of a daylight-saving change convert with the rule that was
 * actually in force. Pass --dry-run to check a file before writing anything.
 */

import "dotenv/config";

import { importEconomicCalendar } from "../src/lib/economic-calendar/import";

function parseArgs(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg || !arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    // Boolean flags such as --dry-run take no value.
    if (next === undefined || next.startsWith("--")) {
      flags[key] = "true";
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return flags;
}

function stamp(value: number | null): string {
  return value == null ? "—" : new Date(value).toISOString().replace(".000Z", "Z");
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const file = flags.file;
  if (!file) {
    console.error(
      "Missing --file. Example:\n  npm run calendar:import -- --file ./data/forextestlab-calendar.csv --timezone Europe/Kyiv",
    );
    process.exit(1);
  }

  const dryRun = flags["dry-run"] === "true";

  console.log(
    `Importing ${file}${dryRun ? " — dry run" : ""}…\n` +
      (flags.timezone
        ? `Reading server times as ${flags.timezone}.`
        : "Working out the server's timezone from the release schedules in the file…"),
  );

  const report = await importEconomicCalendar({
    filePath: file,
    timezone: flags.timezone,
    source: flags.source ?? "mt5",
    dryRun,
  });

  const detection = report.detection;
  if (detection?.anchor && detection.best) {
    console.log(
      `\nAnchor: ${detection.anchor.currency} ${detection.anchor.name}, ` +
        `${detection.anchor.samples} releases.\n` +
        `Under ${report.timezone}, ${Math.round(detection.best.score * 100)}% of them land on ` +
        `${detection.best.localTime} in ${detection.anchor.issuingZone}.` +
        (detection.equivalent.length > 0
          ? `\nSame clock as: ${detection.equivalent.join(", ")}.`
          : ""),
    );
  }

  for (const warning of report.warnings) {
    console.warn(`\nWarning: ${warning}`);
  }

  console.log("\nCalendar import report");
  console.log("======================");
  console.log(
    `Server zone:     ${report.timezone} (${
      report.timezoneSource === "given"
        ? "as given"
        : report.timezoneSource === "detected"
          ? "detected from the file"
          : "fallback — see the warning above"
    })`,
  );
  console.log(`Rows read:       ${report.rowsRead}`);
  console.log(`Rows written:    ${report.rowsWritten}${dryRun ? " (nothing was written)" : ""}`);
  console.log(`Rows rejected:   ${report.rowsRejected}`);
  console.log(`Duplicates:      ${report.duplicates}`);
  console.log(`With an actual:  ${report.withActual}`);
  console.log(`Range:           ${stamp(report.minTimestamp)} → ${stamp(report.maxTimestamp)}`);
  console.log(`Currencies:      ${report.currencies.join(", ") || "—"}`);

  if (report.errors.length > 0) {
    console.log(`\nFirst ${Math.min(20, report.errors.length)} rejected rows:`);
    for (const error of report.errors.slice(0, 20)) {
      console.log(`  line ${error.line}: ${error.error}`);
    }
    if (report.rowsRejected > report.errors.length) {
      console.log(`  … and ${report.rowsRejected - report.errors.length} more.`);
    }
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
