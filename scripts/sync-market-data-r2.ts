import "dotenv/config";

import { parseCliFlags } from "../src/lib/cli-flags";
import { syncMarketDataToR2 } from "../src/lib/market-data/r2-sync";

function date(value: string | undefined, name: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`Invalid --${name} date: ${value}`);
  return parsed;
}

async function main() {
  const input = parseCliFlags(process.argv.slice(2));
  const report = await syncMarketDataToR2({
    symbols: input.symbols?.split(","),
    from: date(input.from, "from"),
    bootstrapFrom: date(input["bootstrap-from"], "bootstrap-from"),
    to: date(input.to, "to"),
    bootstrapDays: input["bootstrap-days"] ? Number(input["bootstrap-days"]) : undefined,
    overlapDays: input["overlap-days"] ? Number(input["overlap-days"]) : undefined,
    dryRun: input["dry-run"] === "true",
    log: console.log,
  });
  console.log("\nR2 market-data sync complete");
  console.log(`Symbols:            ${report.symbols}`);
  console.log(`Objects prepared:   ${report.objectsPrepared}`);
  console.log(`Candles downloaded: ${report.candlesDownloaded}`);
  console.log(`Bytes prepared:     ${report.bytesPrepared}`);
  console.log(`Empty months:       ${report.skippedMonths}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
