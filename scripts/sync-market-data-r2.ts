import "dotenv/config";

import { syncMarketDataToR2 } from "../src/lib/market-data/r2-sync";

function flags(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith("--")) continue;
    const equal = arg.indexOf("=");
    if (equal >= 0) {
      parsed[arg.slice(2, equal)] = arg.slice(equal + 1);
    } else if (!argv[index + 1]?.startsWith("--")) {
      parsed[arg.slice(2)] = argv[++index]!;
    } else {
      parsed[arg.slice(2)] = "true";
    }
  }
  return parsed;
}

function date(value: string | undefined, name: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`Invalid --${name} date: ${value}`);
  return parsed;
}

async function main() {
  const input = flags(process.argv.slice(2));
  const report = await syncMarketDataToR2({
    symbols: input.symbols?.split(","),
    from: date(input.from, "from"),
    to: date(input.to, "to"),
    bootstrapDays: input["bootstrap-days"] ? Number(input["bootstrap-days"]) : undefined,
    overlapDays: input["overlap-days"] ? Number(input["overlap-days"]) : undefined,
    dryRun: input["dry-run"] === "true",
    log: console.log,
  });
  console.log("\nR2 market-data sync complete");
  console.log(`Symbols:            ${report.symbols}`);
  console.log(`Objects written:    ${report.objectsWritten}`);
  console.log(`Candles downloaded: ${report.candlesDownloaded}`);
  console.log(`Bytes written:      ${report.bytesWritten}`);
  console.log(`Empty months:       ${report.skippedMonths}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
