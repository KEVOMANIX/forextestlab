/**
 * Builds chart rollups in R2 from the monthly one-minute archive already there:
 *
 *   <prefix>_rollups/1h/<SYMBOL>/<YYYY>/<MM>.parquet   hourly candles, per month
 *   <prefix>_rollups/1d-ny/<SYMBOL>.parquet            daily candles closing at
 *                                                      17:00 New York (the app's
 *                                                      daily bar), whole history
 *
 * The app reads these for hourly-family and daily charts instead of decoding
 * every minute month in the range (a year of daily candles took 6.5 s that
 * way). Only complete hours and days are written, so a rollup can never hold a
 * bar the replay has not reached; the reader fills the unfinished tail from
 * minutes. The UTC daily rollup used by weekly/monthly charts is untouched.
 *
 * Usage (on the server, which has the R2 credentials):
 *   npm run data:build-r2-rollups                     # incremental: last 2 months
 *   npm run data:build-r2-rollups -- --full           # whole history
 *   npm run data:build-r2-rollups -- --symbols=EURUSD,GBPUSD --full
 */
import "dotenv/config";

import { GetObjectCommand, ListObjectsV2Command, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { decompress as decompressZstd } from "fzstd";

import { aggregateCandles } from "../src/lib/market-data/aggregation";
import { nextForexDailyBoundary } from "../src/lib/market-data/forex-day";
import { encodeParquet, mergeCandles, rowsToCandles } from "../src/lib/market-data/r2-sync";
import { SYMBOL_DEFINITIONS } from "../src/lib/market-data/symbols";
import type { Candle } from "../src/lib/market-data/types";

const HOUR = 60 * 60_000;
const COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"];
const CONCURRENCY = 6;

const argument = (name: string) => process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => process.argv.slice(2).includes(`--${name}`);

const endpoint = process.env.R2_ENDPOINT?.trim().replace(/\/$/, "");
const bucket = process.env.R2_BUCKET_NAME?.trim();
const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error("R2 credentials are incomplete.");
const client = new S3Client({ endpoint, region: "auto", credentials: { accessKeyId, secretAccessKey } });
const prefix = (process.env.R2_PREFIX?.trim() || "market_data").replace(/^\/+|\/+$/g, "");

interface Month { year: number; month: number; key: string }
const monthId = (m: Month) => m.year * 12 + (m.month - 1);
const pad = (value: number) => String(value).padStart(2, "0");

async function listMonths(symbol: string): Promise<Month[]> {
  const months: Month[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix}/${symbol}/`, ContinuationToken: token }));
    for (const object of page.Contents ?? []) {
      const match = object.Key?.match(/\/((?:19|20)\d{2})\/(0[1-9]|1[0-2])\.parquet$/);
      if (match && object.Key) months.push({ year: Number(match[1]), month: Number(match[2]), key: object.Key });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return months.sort((a, b) => monthId(a) - monthId(b));
}

async function readParquet(key: string): Promise<Candle[] | null> {
  const { parquetReadObjects } = await import("hyparquet");
  try {
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await object.Body!.transformToByteArray();
    const rows = await parquetReadObjects({
      file: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      compressors: { ZSTD: (input) => decompressZstd(input) },
      columns: COLUMNS,
    });
    return rowsToCandles(rows);
  } catch (error) {
    if (error instanceof NoSuchKey) return null;
    throw error;
  }
}

async function put(key: string, candles: Candle[], timeframe: string): Promise<void> {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: Buffer.from(await encodeParquet(candles, timeframe)),
    ContentType: "application/vnd.apache.parquet",
    Metadata: { timeframe, rows: String(candles.length), updated: new Date().toISOString() },
  }));
}

/** Runs `work` over `items` with a bounded number in flight, preserving order of results. */
async function mapLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]!);
    }
  }));
  return results;
}

async function buildSymbol(symbol: string, full: boolean): Promise<string> {
  const months = await listMonths(symbol);
  if (!months.length) return `${symbol}: no monthly data; skipped.`;
  const latest = months[months.length - 1]!;
  // Incremental runs rebuild the last two months: the current one grows every
  // day, and the forex day that opens a month starts in the previous one.
  const requestedFrom = argument("from-month");
  if (requestedFrom && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(requestedFrom)) throw new Error("Use --from-month=YYYY-MM");
  const fromId = full ? -Infinity : requestedFrom
    ? Number(requestedFrom.slice(0, 4)) * 12 + Number(requestedFrom.slice(5)) - 1
    : monthId(latest) - 1;
  const rebuild = months.filter((m) => monthId(m) >= fromId);
  if (!rebuild.length) return `${symbol}: no months in the requested rebuild window.`;

  let lastMinute = 0;
  const dailyFragments = await mapLimited(rebuild, CONCURRENCY, async (month) => {
    const minutes = await readParquet(month.key);
    if (!minutes?.length) return [];
    const monthLast = minutes[minutes.length - 1]!.timestamp;
    if (monthLast > lastMinute) lastMinute = monthLast;
    // Hourly: complete hours only. The last bar of the newest month may still
    // be filling; it is left to the reader, which builds it from minutes.
    const hourly = aggregateCandles(minutes, "1m", "1h").filter((bar) => bar.timestamp + HOUR <= monthLast + 60_000);
    if (hourly.length) await put(`${prefix}_rollups/1h/${symbol}/${month.year}/${pad(month.month)}.parquet`, hourly, "1h");
    return aggregateCandles(minutes, "1m", "1d");
  });

  // Join the forex days split across month boundaries, then keep complete days.
  const rebuilt = aggregateCandles(dailyFragments.flat(), "1d", "1d")
    .filter((day) => nextForexDailyBoundary(day.timestamp) <= lastMinute + 60_000);
  const dailyKey = `${prefix}_rollups/1d-ny/${symbol}.parquet`;
  let daily = rebuilt;
  if (!full) {
    // The forex day that opens the window began (17:00 New York) in the month
    // before it, which was not read, so only days from the window's first
    // instant are replaced; earlier days keep their complete stored copy.
    const windowStart = Date.UTC(rebuild[0]!.year, rebuild[0]!.month - 1, 1);
    const stored = (await readParquet(dailyKey)) ?? [];
    daily = mergeCandles(
      stored.filter((day) => day.timestamp < windowStart),
      rebuilt.filter((day) => day.timestamp >= windowStart),
    );
  }
  if (daily.length) await put(dailyKey, daily, "1d-ny");
  return `${symbol}: ${rebuild.length} month(s) of hourly rollups, ${daily.length.toLocaleString()} daily candles.`;
}

async function main() {
  const full = flag("full");
  const requested = argument("symbols")?.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  const symbols = requested?.length ? requested : SYMBOL_DEFINITIONS.map((definition) => definition.symbol);
  const started = Date.now();
  let failures = 0;
  for (const symbol of symbols) {
    try {
      console.log(await buildSymbol(symbol, full));
    } catch (error) {
      failures += 1;
      console.error(`${symbol}: failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)} s; ${failures} failure(s).`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
