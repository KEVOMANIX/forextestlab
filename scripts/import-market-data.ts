/**
 * CLI: import historical market data from a CSV file into the database.
 *
 * Usage:
 *   npm run data:import -- \
 *     --file ./data/EURUSD_5m.csv \
 *     --symbol EURUSD \
 *     --timeframe 5m \
 *     --timezone UTC \
 *     --source manual-import
 *
 * Optional: --delimiter "," and header overrides like --map.open=Open
 */

import "dotenv/config";

import { importMarketData } from "../src/lib/market-data/import";
import { isTimeframe } from "../src/lib/market-data/types";
import type { HeaderMapping } from "../src/lib/market-data/normalizer";

function parseArgs(argv: string[]): {
  flags: Record<string, string>;
  mapping: Partial<HeaderMapping>;
} {
  const flags: Record<string, string> = {};
  const mapping: Partial<HeaderMapping> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg || !arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    let key: string;
    let value: string;
    if (eq !== -1) {
      key = arg.slice(2, eq);
      value = arg.slice(eq + 1);
    } else {
      key = arg.slice(2);
      value = argv[i + 1] ?? "";
      i += 1;
    }
    if (key.startsWith("map.")) {
      const field = key.slice(4) as keyof HeaderMapping;
      mapping[field] = value;
    } else {
      flags[key] = value;
    }
  }
  return { flags, mapping };
}

async function main() {
  const { flags, mapping } = parseArgs(process.argv.slice(2));

  const file = flags.file;
  const symbol = flags.symbol;
  const timeframe = flags.timeframe;
  const timezone = flags.timezone ?? "UTC";
  const source = flags.source ?? "manual-import";

  if (!file || !symbol || !timeframe) {
    console.error(
      "Missing required flags. Example:\n  npm run data:import -- --file ./data/EURUSD_5m.csv --symbol EURUSD --timeframe 5m --timezone UTC --source manual-import",
    );
    process.exit(1);
  }
  if (!isTimeframe(timeframe)) {
    console.error(`Invalid --timeframe "${timeframe}".`);
    process.exit(1);
  }

  console.log(`Importing ${file} as ${symbol} ${timeframe} (${source})…`);
  const report = await importMarketData({
    filePath: file,
    symbol,
    timeframe,
    timezone,
    source,
    mapping: Object.keys(mapping).length > 0 ? mapping : undefined,
    fileName: file,
  });

  console.log("\nImport report");
  console.log("=============");
  console.log(`Rows read:      ${report.rowsRead}`);
  console.log(`Rows imported:  ${report.rowsImported}`);
  console.log(`Rows rejected:  ${report.rowsRejected}`);
  console.log(`Duplicates:     ${report.duplicates}`);
  console.log(`Gaps detected:  ${report.gapsDetected}`);
  if (report.minTimestamp && report.maxTimestamp) {
    console.log(
      `Range:          ${new Date(report.minTimestamp).toISOString()} → ${new Date(report.maxTimestamp).toISOString()}`,
    );
  }
  if (report.errors.length > 0) {
    console.log(`\nFirst ${report.errors.length} rejected rows:`);
    for (const e of report.errors.slice(0, 20)) {
      console.log(`  line ${e.line}: ${e.error}`);
    }
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
