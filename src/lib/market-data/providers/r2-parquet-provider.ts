import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isEmptyForexWeekendCandle } from "../empty-weekend";

import {
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  S3Client,
} from "@aws-sdk/client-s3";
import { decompress as decompressZstd } from "fzstd";
import { parquetReadObjects, type Compressors } from "hyparquet";

import { forexDailyStart, nextForexDailyBoundary } from "@/lib/market-data/forex-day";
import { aggregateCandles } from "@/lib/market-data/aggregation";
import { getSymbolDefinition, SYMBOL_DEFINITIONS } from "@/lib/market-data/symbols";
import type {
  Candle,
  CandleRequest,
  DataRange,
  MarketDataProvider,
  MarketSymbol,
} from "@/lib/market-data/types";
import { nextTimeframeTimestamp, TIMEFRAME_MS } from "@/lib/market-data/types";

const MANIFEST_TTL_MS = 5 * 60_000;
const CANDLE_CACHE_TTL_MS = 15 * 60_000;
// A decoded month of one-minute candles is about 5 MB (measured 2026-10-23:
// ~175 bytes a candle once the duplicate bid fields were dropped). Holding one
// month made every pair switch and chart jump download again; 48 months is
// roughly 250 MB of the 4 GB instance. Least recently used months go first.
const MAX_CACHED_MONTHS = 48;
// Long-running one-minute sessions can span many years. Reading every monthly
// object serially adds one full R2 round trip per month, making a cold resume
// take tens of seconds. A small batch overlaps network/decode work while
// keeping peak memory bounded on the Lightsail instance.
const MONTH_READ_CONCURRENCY = 4;
const COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"];
// Our importer writes only ZSTD Parquet, so loading the other codecs would add
// startup work and dependencies that production never uses.
const PARQUET_COMPRESSORS: Compressors = {
  ZSTD: (input) => decompressZstd(input),
};

interface R2Config {
  prefix: string;
  bucket: R2BucketAdapter;
}

interface R2BucketAdapter {
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: Array<{ key: string }>;
    truncated: boolean;
    cursor?: string;
  }>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

interface StoredMonth {
  symbol: string;
  year: number;
  month: number;
  key: string;
}

interface ManifestCache {
  expiresAt: number;
  monthsBySymbol: Map<string, StoredMonth[]>;
}

let manifestCache: ManifestCache | undefined;
const candleCache = new Map<string, { expiresAt: number; candles: Promise<Candle[]> }>();
const rollupCache = new Map<string, { expiresAt: number; candles: Promise<Candle[]> }>();
let s3Bucket: R2BucketAdapter | undefined;

/**
 * Access the private R2 bucket through its S3-compatible API from Lightsail.
 */
function s3BucketFromEnvironment(): R2BucketAdapter | undefined {
  if (s3Bucket) return s3Bucket;

  const endpoint = process.env.R2_ENDPOINT?.trim().replace(/\/$/, "");
  const bucketName = process.env.R2_BUCKET_NAME?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucketName || !accessKeyId || !secretAccessKey) {
    return undefined;
  }

  const client = new S3Client({
    endpoint,
    region: "auto",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  s3Bucket = {
    async list({ prefix, cursor }) {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix,
          ContinuationToken: cursor,
        }),
      );
      return {
        objects: (page.Contents ?? []).flatMap((object) =>
          object.Key ? [{ key: object.Key }] : [],
        ),
        truncated: Boolean(page.IsTruncated),
        cursor: page.NextContinuationToken,
      };
    },
    async get(key) {
      try {
        const object = await client.send(
          new GetObjectCommand({ Bucket: bucketName, Key: key }),
        );
        if (!object.Body) return null;
        const bytes = await object.Body.transformToByteArray();
        return {
          arrayBuffer: async () =>
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer,
        };
      } catch (error) {
        if (error instanceof NoSuchKey) return null;
        throw error;
      }
    },
  };
  return s3Bucket;
}

function r2Config(): R2Config {
  const bucket = s3BucketFromEnvironment();
  if (bucket) {
    return {
      prefix: (process.env.R2_PREFIX?.trim() || "market_data").replace(
        /^\/+|\/+$/g,
        "",
      ),
      bucket,
    };
  }
  throw new Error(
    "R2 is not configured. Provide R2_ENDPOINT, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.",
  );
}

export function parseStoredMonth(key: string, prefix: string): StoredMonth | undefined {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = key.match(
    new RegExp(`^${escapedPrefix}/([A-Z0-9]+)/((?:19|20)\\d{2})/(0[1-9]|1[0-2])\\.parquet$`),
  );
  if (!match?.[1] || !match[2] || !match[3]) return undefined;
  return {
    symbol: match[1],
    year: Number(match[2]),
    month: Number(match[3]),
    key,
  };
}

/**
 * Convert the timestamp representations emitted by Parquet readers to the
 * application's canonical UTC epoch milliseconds.  Depending on the logical
 * Parquet type and reader, an instant can arrive as Date, seconds, millis,
 * microseconds, or nanoseconds.  Treating every numeric value as milliseconds
 * silently moves second-based data to 1970; treating microseconds as
 * nanoseconds shifts it by a factor of 1,000.  Magnitude-based conversion is
 * unambiguous for the market-data date range and keeps the conversion
 * independent of the host timezone.
 */
function timestampMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return Number.NaN;
    const magnitude = Math.abs(value);
    if (magnitude < 100_000_000_000) return value * 1000; // epoch seconds
    if (magnitude < 100_000_000_000_000) return value; // epoch milliseconds
    if (magnitude < 100_000_000_000_000_000) return value / 1000; // microseconds
    return value / 1_000_000; // nanoseconds
  }
  if (typeof value === "bigint") {
    const magnitude = value < 0n ? -value : value;
    if (magnitude < 100_000_000_000n) return Number(value) * 1000;
    if (magnitude < 100_000_000_000_000n) return Number(value);
    if (magnitude < 100_000_000_000_000_000n) return Number(value) / 1000;
    return Number(value) / 1_000_000;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
      const numeric = Number(trimmed);
      return Number.isFinite(numeric) ? timestampMs(numeric) : Number.NaN;
    }
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

function decimalString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && value.trim() !== "") return value;
  return undefined;
}

export function parquetRowsToCandles(rows: Record<string, unknown>[]): Candle[] {
  const byTimestamp = new Map<number, Candle>();
  for (const row of rows) {
    const timestamp = timestampMs(row.timestamp);
    const open = decimalString(row.open);
    const high = decimalString(row.high);
    const low = decimalString(row.low);
    const close = decimalString(row.close);
    if (!Number.isFinite(timestamp) || !open || !high || !low || !close) continue;

    // No bid copies: the archive holds one price series, and execution only
    // uses bid/ask fields when a candle carries both (it then derives the
    // spread from the session's settings either way). The copies doubled
    // every response and the decoded cache for nothing.
    const candle: Candle = {
      timestamp,
      open,
      high,
      low,
      close,
      source: "dukascopy-r2",
    };
    const volume = decimalString(row.volume);
    if (volume !== undefined) candle.volume = volume;
    byTimestamp.set(timestamp, candle);
  }
  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
}

const RANGE_CACHE_TTL_MS = 60 * 60_000;
const rangeCache = new Map<string, { key: string; ranges: DataRange[]; expiresAt: number }>();

/** Lists one symbol's monthly objects. */
async function listSymbolMonths(config: R2Config, symbol: string): Promise<StoredMonth[]> {
  const months: StoredMonth[] = [];
  let cursor: string | undefined;
  do {
    const page = await config.bucket.list({ prefix: `${config.prefix}/${symbol}/`, cursor });
    for (const object of page.objects) {
      const month = object.key ? parseStoredMonth(object.key, config.prefix) : undefined;
      if (month) months.push(month);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return months.sort((a, b) => a.year - b.year || a.month - b.month);
}

/**
 * Lists every symbol's months. Symbols are listed side by side: one sequential
 * listing of the whole prefix took about ten seconds (9,000 objects, 1,000 a
 * page, each page waiting on the last).
 */
async function fetchManifest(config: R2Config): Promise<Map<string, StoredMonth[]>> {
  const entries = await Promise.all(
    SYMBOL_DEFINITIONS.map(async ({ symbol }) => [symbol, await listSymbolMonths(config, symbol)] as const),
  );
  return new Map(entries.filter(([, months]) => months.length > 0));
}

/** The last manifest, kept on disk so a restart does not make a trader wait for a listing. */
const manifestFile = () => path.resolve(process.env.R2_MANIFEST_CACHE_FILE?.trim() || "data/.r2-manifest.json");
let manifestRefresh: Promise<Map<string, StoredMonth[]>> | undefined;

async function readManifestFile(): Promise<Map<string, StoredMonth[]> | undefined> {
  try {
    const stored = JSON.parse(await readFile(manifestFile(), "utf8")) as Record<string, StoredMonth[]>;
    return new Map(Object.entries(stored));
  } catch {
    return undefined;
  }
}

function refreshManifest(config: R2Config): Promise<Map<string, StoredMonth[]>> {
  manifestRefresh ??= fetchManifest(config)
    .then(async (monthsBySymbol) => {
      manifestCache = { expiresAt: Date.now() + MANIFEST_TTL_MS, monthsBySymbol };
      await mkdir(path.dirname(manifestFile()), { recursive: true }).catch(() => undefined);
      await writeFile(manifestFile(), JSON.stringify(Object.fromEntries(monthsBySymbol))).catch(() => undefined);
      return monthsBySymbol;
    })
    .finally(() => {
      manifestRefresh = undefined;
    });
  return manifestRefresh;
}

/**
 * Which months exist for each symbol. Served stale-while-revalidate: once a
 * manifest is known (in memory, or from disk after a restart) every caller gets
 * it at once, and an expired one is refreshed in the background. Only the very
 * first start with no saved copy waits for a listing.
 */
async function loadManifest(config: R2Config): Promise<Map<string, StoredMonth[]>> {
  if (!manifestCache) {
    const saved = await readManifestFile();
    // Saved copies start expired, so the first request also refreshes them.
    if (saved?.size) manifestCache = { expiresAt: 0, monthsBySymbol: saved };
  }
  if (manifestCache) {
    if (manifestCache.expiresAt <= Date.now()) void refreshManifest(config).catch(() => undefined);
    return manifestCache.monthsBySymbol;
  }
  return refreshManifest(config);
}

async function readMonth(config: R2Config, stored: StoredMonth): Promise<Candle[]> {
  const cached = candleCache.get(stored.key);
  if (cached && cached.expiresAt > Date.now()) {
    candleCache.delete(stored.key);
    candleCache.set(stored.key, cached);
    return cached.candles;
  }
  if (cached) candleCache.delete(stored.key);

  const pending = (async () => {
    const object = await config.bucket.get(stored.key);
    if (!object) {
      throw new Error(`Cloudflare R2 returned no object for ${stored.key}.`);
    }
    const file = await object.arrayBuffer();
    const rows = await parquetReadObjects({
      file,
      compressors: PARQUET_COMPRESSORS,
      columns: COLUMNS,
    });
    const candles = parquetRowsToCandles(rows).filter(candle => !isEmptyForexWeekendCandle(stored.symbol, candle));
    if (candles.length === 0) {
      throw new Error(`No valid candles were found in ${stored.key}.`);
    }
    return candles;
  })();

  candleCache.set(stored.key, {
    expiresAt: Date.now() + CANDLE_CACHE_TTL_MS,
    candles: pending,
  });
  while (candleCache.size > MAX_CACHED_MONTHS) {
    const oldestKey = candleCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    candleCache.delete(oldestKey);
  }
  try {
    return await pending;
  } catch (error) {
    candleCache.delete(stored.key);
    throw error;
  }
}

export function completedRollupCandles(
  candles: Candle[],
  timeframe: CandleRequest["timeframe"],
  endTime: number,
): Candle[] {
  // This helper serves the legacy UTC daily rollup used by calendar charts.
  // New York-close daily charts use replaySafeForexDailyFragments below.
  return candles.filter(
    (candle) => (timeframe === "1d"
      ? candle.timestamp + TIMEFRAME_MS["1d"]
      : nextTimeframeTimestamp(candle.timestamp, timeframe)) <= endTime + 1,
  );
}

/**
 * Build replay-safe candles from the stored daily rollup. Higher-timeframe
 * buckets may remain open, but contain only daily candles that have closed by
 * `endTime`; this preserves the safe part of the current week/month.
 */
export function replaySafeDailyRollup(
  daily: Candle[],
  timeframe: CandleRequest["timeframe"],
  endTime: number,
): Candle[] {
  const completedDays = completedRollupCandles(daily, "1d", endTime);
  if (timeframe === "1d") return completedDays;
  return aggregateCandles(completedDays, "1d", timeframe);
}

/**
 * A whole-history daily rollup: `1d` is the legacy UTC-day file used by
 * weekly and calendar charts; `1d-ny` closes each day at 17:00 New York, the
 * app's daily bar (built by scripts/build-rollups-from-r2.ts).
 */
async function readDailyRollup(config: R2Config, symbol: string, folder: "1d" | "1d-ny" = "1d"): Promise<Candle[] | null> {
  const key = `${config.prefix}_rollups/${folder}/${symbol}.parquet`;
  const cached = rollupCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.candles;
  const pending = (async () => {
    const object = await config.bucket.get(key);
    if (!object) return [];
    const file = await object.arrayBuffer();
    const rows = await parquetReadObjects({
      file,
      compressors: PARQUET_COMPRESSORS,
      columns: COLUMNS,
    });
    return parquetRowsToCandles(rows);
  })();
  rollupCache.set(key, { expiresAt: Date.now() + CANDLE_CACHE_TTL_MS, candles: pending });
  try {
    const candles = await pending;
    return candles.length ? candles : null;
  } catch {
    rollupCache.delete(key);
    return null;
  }
}

const HOUR_MS = 60 * 60_000;
/** Timeframes built from hourly candles: their buckets are whole UTC hours. */
const HOURLY_FAMILY = new Set<CandleRequest["timeframe"]>(["1h", "2h", "4h", "6h", "12h"]);
const hourlyRollupCache = new Map<string, { expiresAt: number; candles: Promise<Candle[]> }>();
const MAX_CACHED_HOURLY_MONTHS = 600;

/** One month of complete hourly candles, or null when no rollup exists for it. */
async function readHourlyRollup(config: R2Config, month: StoredMonth): Promise<Candle[] | null> {
  const key = `${config.prefix}_rollups/1h/${month.symbol}/${month.year}/${String(month.month).padStart(2, "0")}.parquet`;
  let cached = hourlyRollupCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    const candles = (async () => {
      const object = await config.bucket.get(key);
      if (!object) return [];
      const rows = await parquetReadObjects({ file: await object.arrayBuffer(), compressors: PARQUET_COMPRESSORS, columns: COLUMNS });
      return parquetRowsToCandles(rows);
    })();
    cached = { expiresAt: Date.now() + CANDLE_CACHE_TTL_MS, candles };
    hourlyRollupCache.delete(key);
    hourlyRollupCache.set(key, cached);
    while (hourlyRollupCache.size > MAX_CACHED_HOURLY_MONTHS) hourlyRollupCache.delete(hourlyRollupCache.keys().next().value!);
  }
  try {
    const candles = await cached.candles;
    return candles.length ? candles : null;
  } catch {
    hourlyRollupCache.delete(key);
    return null;
  }
}

/**
 * Hourly candles for one month's part of [startTime, endTime]: complete hours
 * from the rollup, and anything after the rollup's last complete hour (the
 * hour in progress at `endTime`, or hours since the rollup was last built)
 * from the minute archive, exactly as before. Hours are UTC-aligned and months
 * start at UTC midnight, so no hour straddles two months.
 */
async function hourlyForMonth(config: R2Config, month: StoredMonth, startTime: number, endTime: number): Promise<Candle[]> {
  const monthEnd = Date.UTC(month.year, month.month, 1) - 1;
  const from = Math.max(startTime, Date.UTC(month.year, month.month - 1, 1));
  const to = Math.min(endTime, monthEnd);
  if (from > to) return [];
  const rollup = await readHourlyRollup(config, month);
  const bars: Candle[] = [];
  let tailStart = from;
  if (rollup) {
    // From the hour containing `from` (earlier data is history, never the
    // future), up to the last hour that has fully closed by `to`.
    const firstHour = from - (from % HOUR_MS);
    for (const bar of rollup) {
      if (bar.timestamp >= firstHour && bar.timestamp + HOUR_MS <= to + 1) bars.push(bar);
    }
    const lastBar = bars[bars.length - 1];
    if (lastBar) tailStart = lastBar.timestamp + HOUR_MS;
  }
  if (tailStart <= to) {
    const minutes = (await readMonth(config, month)).filter((candle) => candle.timestamp >= tailStart && candle.timestamp <= to);
    bars.push(...aggregateCandles(minutes, "1m", "1h"));
  }
  return bars;
}

function overlaps(month: StoredMonth, startTime: number, endTime: number): boolean {
  const monthStart = Date.UTC(month.year, month.month - 1, 1);
  const monthEnd = Date.UTC(month.year, month.month, 1) - 1;
  return monthStart <= endTime && monthEnd >= startTime;
}

// Small daily summaries keep repeat daily-chart requests fast without retaining
// years of decoded minute data. Stored UTC rollups cannot supply these OHLCs.
const forexDailyCache = new Map<string, { expiresAt: number; candles: Candle[] }>();

export function replaySafeForexDailyFragments(daily: Candle[], minutes: Candle[], startTime: number, endTime: number): Candle[] {
  const completed = daily.filter(c => c.timestamp >= startTime && nextForexDailyBoundary(c.timestamp) <= endTime + 1);
  const currentStart = forexDailyStart(endTime);
  const partial = nextForexDailyBoundary(currentStart) <= endTime + 1 ? []
    : aggregateCandles(minutes.filter(c => c.timestamp >= Math.max(startTime, currentStart) && c.timestamp <= endTime), "1m", "1d");
  return [...completed, ...partial];
}

async function readForexDailyMonth(config: R2Config, month: StoredMonth, startTime: number, endTime: number): Promise<Candle[]> {
  let cached = forexDailyCache.get(month.key);
  if (!cached || cached.expiresAt <= Date.now()) {
    cached = { expiresAt: Date.now() + CANDLE_CACHE_TTL_MS, candles: aggregateCandles(await readMonth(config, month), "1m", "1d") };
    forexDailyCache.set(month.key, cached);
    if (forexDailyCache.size > 240) forexDailyCache.delete(forexDailyCache.keys().next().value!);
  }
  const currentStart = forexDailyStart(endTime);
  const needsPartial = currentStart >= startTime && nextForexDailyBoundary(currentStart) > endTime + 1 && cached.candles.some(c => c.timestamp === currentStart);
  return replaySafeForexDailyFragments(cached.candles, needsPartial ? await readMonth(config, month) : [], startTime, endTime);
}

export class R2ParquetProvider implements MarketDataProvider {
  async getAvailableSymbols(): Promise<MarketSymbol[]> {
    const config = r2Config();
    const manifest = await loadManifest(config);
    return SYMBOL_DEFINITIONS.map((definition) => {
      const months = manifest.get(definition.symbol) ?? [];
      return {
        symbol: definition.symbol,
        displayName: definition.displayName,
        baseCurrency: definition.baseCurrency,
        quoteCurrency: definition.quoteCurrency,
        pipSize: definition.pipSize,
        pricePrecision: definition.pricePrecision,
        enabled: months.length > 0,
        availableFromYear: months[0]?.year,
        availableThroughYear: months[months.length - 1]?.year,
      };
    });
  }

  async getAvailableRanges(symbol: string): Promise<DataRange[]> {
    if (!getSymbolDefinition(symbol)) return [];
    const config = r2Config();
    const months = (await loadManifest(config)).get(symbol) ?? [];
    const first = months[0];
    const last = months[months.length - 1];
    if (!first || !last) return [];

    // The exact first and last candle need the first and last months decoded.
    // Remembered per pair of objects, so picking a market in setup does not
    // download two months each time; a new month or a refreshed last month
    // (its key is the same, so the entry also expires) recomputes it.
    const cacheKey = `${first.key}|${last.key}`;
    const cached = rangeCache.get(symbol);
    if (cached && cached.key === cacheKey && cached.expiresAt > Date.now()) return cached.ranges;

    const [firstCandles, lastCandles] = await Promise.all([
      readMonth(config, first),
      first.key === last.key ? readMonth(config, first) : readMonth(config, last),
    ]);
    const startTime = firstCandles[0]?.timestamp;
    const endTime = lastCandles[lastCandles.length - 1]?.timestamp;
    const ranges = startTime !== undefined && endTime !== undefined ? [{ startTime, endTime }] : [];
    rangeCache.set(symbol, { key: cacheKey, ranges, expiresAt: Date.now() + RANGE_CACHE_TTL_MS });
    return ranges;
  }

  async getCandles(request: CandleRequest): Promise<Candle[]> {
    if (!getSymbolDefinition(request.symbol) || request.endTime < request.startTime) return [];
    const config = r2Config();
    // Legacy stored daily rollups are UTC-aligned and cannot be split into
    // New York-close bars without their minute data. Keep them for higher
    // calendar charts, but build daily charts from the original minute rows.
    if (TIMEFRAME_MS[request.timeframe] > TIMEFRAME_MS["1d"]) {
      const daily = await readDailyRollup(config, request.symbol);
      if (daily) {
        const selected = daily.filter(
          (candle) => candle.timestamp >= request.startTime && candle.timestamp <= request.endTime,
        );
        if (selected.length) {
          const safe = replaySafeDailyRollup(selected, request.timeframe, request.endTime);
          return request.limit === undefined ? safe : safe.slice(0, request.limit);
        }
      }
    }
    const readStart = request.timeframe === "1d" ? forexDailyStart(request.startTime) : request.startTime;
    const months = ((await loadManifest(config)).get(request.symbol) ?? []).filter((month) =>
      overlaps(month, readStart, request.endTime),
    );
    if (months.length === 0) return [];

    if (request.timeframe === "1d") {
      // Complete days come from the 17:00 New York rollup when it exists; the
      // day in progress, and days since the rollup was built, from minutes.
      const rollup = await readDailyRollup(config, request.symbol, "1d-ny");
      const fromRollup: Candle[] = [];
      let minuteStart = readStart;
      if (rollup) {
        for (const day of rollup) {
          if (day.timestamp >= readStart && nextForexDailyBoundary(day.timestamp) <= request.endTime + 1) fromRollup.push(day);
        }
        const lastDay = fromRollup[fromRollup.length - 1];
        if (lastDay) minuteStart = nextForexDailyBoundary(lastDay.timestamp);
      }
      const fragments: Candle[] = [];
      if (minuteStart <= request.endTime) {
        // Decode one month at a time to bound memory on a cold, long history page.
        for (const month of months.filter((item) => overlaps(item, minuteStart, request.endTime))) {
          fragments.push(...await readForexDailyMonth(config, month, minuteStart, request.endTime));
        }
      }
      // Join a New York trading day split between two monthly source objects.
      const daily = [...fromRollup, ...aggregateCandles(fragments, "1d", "1d")];
      return request.limit === undefined ? daily : daily.slice(0, request.limit);
    }

    if (HOURLY_FAMILY.has(request.timeframe)) {
      const hourlyNeeded = request.limit === undefined
        ? Number.POSITIVE_INFINITY
        : request.limit * (TIMEFRAME_MS[request.timeframe] / HOUR_MS);
      const hourly: Candle[] = [];
      for (let index = 0; index < months.length && hourly.length < hourlyNeeded; index += MONTH_READ_CONCURRENCY) {
        const batch = months.slice(index, index + MONTH_READ_CONCURRENCY);
        for (const bars of await Promise.all(batch.map((month) => hourlyForMonth(config, month, readStart, request.endTime)))) {
          hourly.push(...bars);
        }
      }
      const candles = request.timeframe === "1h" ? hourly : aggregateCandles(hourly, "1h", request.timeframe);
      return request.limit === undefined ? candles : candles.slice(0, request.limit);
    }

    const raw: Candle[] = [];
    const aggregatePerMonth = TIMEFRAME_MS[request.timeframe] >= TIMEFRAME_MS["1d"];
    const partialAggregates: Candle[] = [];
    const baseCandlesNeeded = request.limit === undefined
      ? Number.POSITIVE_INFINITY
      : request.limit * (TIMEFRAME_MS[request.timeframe] / TIMEFRAME_MS["1m"]);
    // Read chronological batches and stop as soon as the requested output
    // limit can be satisfied. Promise.all preserves the input month order.
    const batchSize = Number.isFinite(baseCandlesNeeded) && !aggregatePerMonth ? 1 : MONTH_READ_CONCURRENCY;
    for (let index = 0; index < months.length; index += batchSize) {
      const batch = months.slice(index, index + batchSize);
      const decoded = await Promise.all(batch.map((month) => readMonth(config, month)));
      for (const candles of decoded) {
        const selected = candles.filter(
          (candle) =>
            candle.timestamp >= readStart && candle.timestamp <= request.endTime,
        );
        if (aggregatePerMonth) {
          // A five-year monthly-chart page can span millions of minute rows.
          // Collapse each decoded object immediately and retain only a few
          // daily/weekly/calendar fragments. The final aggregation below joins
          // buckets that cross a month boundary without growing server heap.
          partialAggregates.push(...aggregateCandles(selected, "1m", request.timeframe));
        } else {
          raw.push(...selected);
        }
        if (raw.length >= baseCandlesNeeded) break;
      }
      if (raw.length >= baseCandlesNeeded) break;
    }
    const candles = aggregatePerMonth
      ? aggregateCandles(partialAggregates, "1m", request.timeframe)
      : request.timeframe === "1m"
        ? raw
        : aggregateCandles(raw, "1m", request.timeframe);
    return request.limit === undefined ? candles : candles.slice(0, request.limit);
  }
}
