import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getHistoricalRates, instrumentMetaData } from "dukascopy-node";
import { decompress as decompressZstd } from "fzstd";

import { SYMBOL_DEFINITIONS } from "./symbols";
import type { Candle } from "./types";
import { validateCandle } from "./validators";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const FOREX_CURRENCIES = new Set(["AUD", "CAD", "CHF", "EUR", "GBP", "JPY", "NZD", "USD"]);
const PARQUET_COMPRESSORS = {
  ZSTD: (input: Uint8Array) => decompressZstd(input),
};

export const AUTOMATED_FX_SYMBOLS = SYMBOL_DEFINITIONS.filter(
  ({ symbol, baseCurrency, quoteCurrency }) =>
    symbol.length === 6 &&
    FOREX_CURRENCIES.has(baseCurrency) &&
    FOREX_CURRENCIES.has(quoteCurrency),
).map(({ symbol }) => symbol);

export interface R2MarketSyncOptions {
  symbols?: string[];
  from?: Date;
  /** Start each symbol at the first minute published by Dukascopy. */
  earliest?: boolean;
  bootstrapFrom?: Date;
  to?: Date;
  bootstrapDays?: number;
  overlapDays?: number;
  /** Leave an already stored month untouched, making long backfills resumable. */
  skipExistingMonths?: boolean;
  dryRun?: boolean;
  log?: (message: string) => void;
}

export interface R2MarketSyncReport {
  symbols: number;
  objectsPrepared: number;
  candlesDownloaded: number;
  bytesPrepared: number;
  skippedMonths: number;
  existingMonthsSkipped: number;
}

interface R2Context {
  client: S3Client;
  bucket: string;
  prefix: string;
}

function configuredR2(): R2Context {
  const endpoint = process.env.R2_ENDPOINT?.trim().replace(/\/$/, "");
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials are incomplete.");
  }
  return {
    client: new S3Client({
      endpoint,
      region: "auto",
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
    prefix: (process.env.R2_PREFIX?.trim() || "market_data").replace(/^\/+|\/+$/g, ""),
  };
}

function isAcknowledged(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes(value?.trim().toLowerCase() || "");
}

function monthStart(at: number): number {
  const date = new Date(at);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function nextMonth(at: number): number {
  const date = new Date(at);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

function monthKey(prefix: string, symbol: string, at: number): string {
  const date = new Date(at);
  return `${prefix}/${symbol}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}.parquet`;
}

function numeric(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return Number(value);
  return Number.NaN;
}

export function rowsToCandles(rows: Record<string, unknown>[], source = "dukascopy-r2"): Candle[] {
  const byTimestamp = new Map<number, Candle>();
  for (const row of rows) {
    const timestamp = numeric(row.timestamp);
    const open = numeric(row.open);
    const high = numeric(row.high);
    const low = numeric(row.low);
    const close = numeric(row.close);
    const volume = numeric(row.volume);
    if (![timestamp, open, high, low, close].every(Number.isFinite)) continue;
    const candle: Candle = {
      timestamp,
      open: String(open),
      high: String(high),
      low: String(low),
      close: String(close),
      bidOpen: String(open),
      bidHigh: String(high),
      bidLow: String(low),
      bidClose: String(close),
      source,
    };
    if (Number.isFinite(volume)) candle.volume = String(volume);
    if (validateCandle(candle).valid) byTimestamp.set(timestamp, candle);
  }
  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function mergeCandles(existing: Candle[], incoming: Candle[]): Candle[] {
  const merged = new Map(existing.map((candle) => [candle.timestamp, candle]));
  for (const candle of incoming) merged.set(candle.timestamp, candle);
  return [...merged.values()].sort((a, b) => a.timestamp - b.timestamp);
}

async function encodeParquet(candles: Candle[]): Promise<ArrayBuffer> {
  const { parquetWriteBuffer } = await import("hyparquet-writer");
  return parquetWriteBuffer({
    codec: "SNAPPY",
    rowGroupSize: 100_000,
    columnData: [
      {
        name: "timestamp",
        data: BigInt64Array.from(candles, (candle) => BigInt(candle.timestamp)),
        type: "INT64",
        nullable: false,
      },
      { name: "open", data: Float64Array.from(candles, (candle) => Number(candle.open)), type: "DOUBLE", nullable: false },
      { name: "high", data: Float64Array.from(candles, (candle) => Number(candle.high)), type: "DOUBLE", nullable: false },
      { name: "low", data: Float64Array.from(candles, (candle) => Number(candle.low)), type: "DOUBLE", nullable: false },
      { name: "close", data: Float64Array.from(candles, (candle) => Number(candle.close)), type: "DOUBLE", nullable: false },
      { name: "volume", data: Float64Array.from(candles, (candle) => Number(candle.volume || 0)), type: "DOUBLE", nullable: false },
    ],
    kvMetadata: [
      { key: "forextestlab.source", value: "dukascopy" },
      { key: "forextestlab.timeframe", value: "1m" },
    ],
  });
}

async function decodeParquet(buffer: ArrayBuffer): Promise<Candle[]> {
  const { parquetReadObjects } = await import("hyparquet");
  const rows = await parquetReadObjects({
    file: buffer,
    compressors: PARQUET_COMPRESSORS,
    columns: ["timestamp", "open", "high", "low", "close", "volume"],
  });
  return rowsToCandles(rows);
}

async function readObject(context: R2Context, key: string): Promise<Candle[]> {
  try {
    const object = await context.client.send(
      new GetObjectCommand({ Bucket: context.bucket, Key: key }),
    );
    if (!object.Body) return [];
    const bytes = await object.Body.transformToByteArray();
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    return decodeParquet(buffer);
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return [];
    throw error;
  }
}

async function latestStoredKey(context: R2Context, symbol: string): Promise<string | undefined> {
  let token: string | undefined;
  let latest: string | undefined;
  do {
    const page = await context.client.send(
      new ListObjectsV2Command({
        Bucket: context.bucket,
        Prefix: `${context.prefix}/${symbol}/`,
        ContinuationToken: token,
      }),
    );
    for (const object of page.Contents || []) {
      if (object.Key?.endsWith(".parquet") && (!latest || object.Key > latest)) latest = object.Key;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return latest;
}

function assertSymbols(symbols: string[]): string[] {
  const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  for (const symbol of unique) {
    if (!AUTOMATED_FX_SYMBOLS.includes(symbol)) {
      throw new Error(`${symbol} is not an automated forex symbol.`);
    }
    if (!(symbol.toLowerCase() in instrumentMetaData)) {
      throw new Error(`Dukascopy does not publish ${symbol}.`);
    }
  }
  return unique;
}

function earliestMinuteForSymbol(symbol: string): number {
  const metadata = instrumentMetaData[symbol.toLowerCase() as keyof typeof instrumentMetaData] as {
    startDayForMinuteCandles?: string;
  };
  const start = Date.parse(metadata.startDayForMinuteCandles || "");
  if (!Number.isFinite(start)) throw new Error(`Dukascopy has no minute-history start date for ${symbol}.`);
  return start;
}

function completedMinute(now: number): number {
  return Math.floor((now - 10 * MINUTE_MS) / MINUTE_MS) * MINUTE_MS;
}

async function downloadCandles(symbol: string, from: number, to: number): Promise<Candle[]> {
  if (to <= from) return [];
  const rows = await getHistoricalRates({
    instrument: symbol.toLowerCase() as keyof typeof instrumentMetaData,
    dates: { from: new Date(from), to: new Date(to) },
    timeframe: "m1",
    priceType: "bid",
    format: "json",
    volumes: true,
    ignoreFlats: false,
    // Serialize hourly-file requests. Even a four-request batch can exhaust the
    // provider's per-IP allowance when several currency pairs run back-to-back.
    batchSize: 1,
    pauseBetweenBatchesMs: 2_000,
    retryCount: 5,
    // Weekend/holiday daily files are legitimately empty. The month-level
    // guard below still refuses to upload when the whole requested span is empty.
    retryOnEmpty: false,
    failAfterRetryCount: true,
    pauseBetweenRetriesMs: 30_000,
  });
  return rowsToCandles(rows as unknown as Record<string, unknown>[]);
}

export async function syncMarketDataToR2(
  options: R2MarketSyncOptions = {},
): Promise<R2MarketSyncReport> {
  if (!isAcknowledged(process.env.DUKASCOPY_DATA_AUTHORIZED)) {
    throw new Error(
      "Set DUKASCOPY_DATA_AUTHORIZED=true only after confirming your right to use and redistribute this data.",
    );
  }
  const context = configuredR2();
  const log = options.log || (() => undefined);
  const symbols = assertSymbols(options.symbols?.length ? options.symbols : AUTOMATED_FX_SYMBOLS);
  const bootstrapDays = Math.max(1, Math.min(options.bootstrapDays ?? 45, 366));
  const overlapDays = Math.max(1, Math.min(options.overlapDays ?? 2, 14));
  const end = Math.min(options.to?.getTime() ?? completedMinute(Date.now()), completedMinute(Date.now()));
  if (!Number.isFinite(end)) throw new Error("Invalid sync end date.");

  const report: R2MarketSyncReport = {
    symbols: symbols.length,
    objectsPrepared: 0,
    candlesDownloaded: 0,
    bytesPrepared: 0,
    skippedMonths: 0,
    existingMonthsSkipped: 0,
  };

  for (const symbol of symbols) {
    const latestKey = await latestStoredKey(context, symbol);
    let start = options.earliest ? earliestMinuteForSymbol(symbol) : options.from?.getTime();
    if (start === undefined && latestKey) {
      const latest = await readObject(context, latestKey);
      const last = latest.at(-1)?.timestamp;
      start = last === undefined ? end - bootstrapDays * DAY_MS : last - overlapDays * DAY_MS;
    }
    start ??= options.bootstrapFrom?.getTime() ?? end - bootstrapDays * DAY_MS;
    if (!Number.isFinite(start)) throw new Error("Invalid sync start date.");
    start = Math.floor(start / MINUTE_MS) * MINUTE_MS;
    if (start >= end) {
      log(`${symbol}: already current.`);
      continue;
    }

    log(`${symbol}: ${new Date(start).toISOString()} -> ${new Date(end).toISOString()}`);
    for (let cursor = monthStart(start); cursor < end; cursor = nextMonth(cursor)) {
      const rangeFrom = Math.max(start, cursor);
      const rangeTo = Math.min(end, nextMonth(cursor));
      const key = monthKey(context.prefix, symbol, cursor);
      const existing = await readObject(context, key);
      if (options.skipExistingMonths && existing.length > 0) {
        report.existingMonthsSkipped += 1;
        log(`  ${key}: already stored; skipped.`);
        continue;
      }
      const incoming = await downloadCandles(symbol, rangeFrom, rangeTo);
      report.candlesDownloaded += incoming.length;
      if (incoming.length === 0) {
        report.skippedMonths += 1;
        log(`  ${key}: no new candles; skipped.`);
        continue;
      }
      const merged = mergeCandles(existing, incoming);
      const parquet = await encodeParquet(merged);
      const verified = await decodeParquet(parquet);
      if (
        verified.length !== merged.length ||
        verified[0]?.timestamp !== merged[0]?.timestamp ||
        verified.at(-1)?.timestamp !== merged.at(-1)?.timestamp
      ) {
        throw new Error(`Parquet verification failed for ${key}.`);
      }

      if (!options.dryRun) {
        await context.client.send(
          new PutObjectCommand({
            Bucket: context.bucket,
            Key: key,
            Body: Buffer.from(parquet),
            ContentType: "application/vnd.apache.parquet",
            Metadata: {
              source: "dukascopy",
              timeframe: "1m",
              rows: String(merged.length),
              updated: new Date().toISOString(),
            },
          }),
        );
      }
      report.objectsPrepared += 1;
      report.bytesPrepared += parquet.byteLength;
      log(`  ${key}: ${merged.length.toLocaleString()} candles, ${(parquet.byteLength / 1024).toFixed(1)} KiB${options.dryRun ? " (dry run)" : ""}.`);
    }
  }
  return report;
}
