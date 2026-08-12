import "server-only";

import {
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  S3Client,
} from "@aws-sdk/client-s3";
import { decompress as decompressZstd } from "fzstd";
import { parquetReadObjects, type Compressors } from "hyparquet";

import { aggregateCandles } from "@/lib/market-data/aggregation";
import { getSymbolDefinition, SYMBOL_DEFINITIONS } from "@/lib/market-data/symbols";
import type {
  Candle,
  CandleRequest,
  DataRange,
  MarketDataProvider,
  MarketSymbol,
} from "@/lib/market-data/types";
import { TIMEFRAME_MS } from "@/lib/market-data/types";

const MANIFEST_TTL_MS = 5 * 60_000;
const CANDLE_CACHE_TTL_MS = 15 * 60_000;
// A month of one-minute candles expands dramatically after Parquet decoding.
// Keep only the hottest month to leave memory for concurrent app requests;
// R2 remains durable and another month is decoded on demand.
const MAX_CACHED_MONTHS = 1;
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

function timestampMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "bigint") {
    const numeric = Number(value);
    return numeric > 10_000_000_000_000 ? numeric / 1_000_000 : numeric;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
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

    const candle: Candle = {
      timestamp,
      open,
      high,
      low,
      close,
      bidOpen: open,
      bidHigh: high,
      bidLow: low,
      bidClose: close,
      source: "dukascopy-r2",
    };
    const volume = decimalString(row.volume);
    if (volume !== undefined) candle.volume = volume;
    byTimestamp.set(timestamp, candle);
  }
  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
}

async function loadManifest(config: R2Config): Promise<Map<string, StoredMonth[]>> {
  if (manifestCache && manifestCache.expiresAt > Date.now()) {
    return manifestCache.monthsBySymbol;
  }

  const monthsBySymbol = new Map<string, StoredMonth[]>();
  let cursor: string | undefined;
  do {
    const page = await config.bucket.list({ prefix: `${config.prefix}/`, cursor });
    const objects = page.objects;
    const nextCursor = page.truncated ? page.cursor : undefined;
    for (const object of objects) {
      if (!object.key) continue;
      const month = parseStoredMonth(object.key, config.prefix);
      if (!month) continue;
      const stored = monthsBySymbol.get(month.symbol) ?? [];
      stored.push(month);
      monthsBySymbol.set(month.symbol, stored);
    }
    cursor = nextCursor;
  } while (cursor);

  for (const months of monthsBySymbol.values()) {
    months.sort((a, b) => a.year - b.year || a.month - b.month);
  }
  manifestCache = { expiresAt: Date.now() + MANIFEST_TTL_MS, monthsBySymbol };
  return monthsBySymbol;
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
    const candles = parquetRowsToCandles(rows);
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

function overlaps(month: StoredMonth, startTime: number, endTime: number): boolean {
  const monthStart = Date.UTC(month.year, month.month - 1, 1);
  const monthEnd = Date.UTC(month.year, month.month, 1) - 1;
  return monthStart <= endTime && monthEnd >= startTime;
}

export class R2ParquetProvider implements MarketDataProvider {
  async getAvailableSymbols(): Promise<MarketSymbol[]> {
    const config = r2Config();
    const manifest = await loadManifest(config);
    return SYMBOL_DEFINITIONS.map((definition) => ({
      symbol: definition.symbol,
      displayName: definition.displayName,
      baseCurrency: definition.baseCurrency,
      quoteCurrency: definition.quoteCurrency,
      pipSize: definition.pipSize,
      pricePrecision: definition.pricePrecision,
      enabled: (manifest.get(definition.symbol)?.length ?? 0) > 0,
    }));
  }

  async getAvailableRanges(symbol: string): Promise<DataRange[]> {
    if (!getSymbolDefinition(symbol)) return [];
    const config = r2Config();
    const months = (await loadManifest(config)).get(symbol) ?? [];
    const first = months[0];
    const last = months[months.length - 1];
    if (!first || !last) return [];

    const [firstCandles, lastCandles] = await Promise.all([
      readMonth(config, first),
      first.key === last.key ? readMonth(config, first) : readMonth(config, last),
    ]);
    const startTime = firstCandles[0]?.timestamp;
    const endTime = lastCandles[lastCandles.length - 1]?.timestamp;
    return startTime !== undefined && endTime !== undefined
      ? [{ startTime, endTime }]
      : [];
  }

  async getCandles(request: CandleRequest): Promise<Candle[]> {
    if (!getSymbolDefinition(request.symbol) || request.endTime < request.startTime) return [];
    const config = r2Config();
    const months = ((await loadManifest(config)).get(request.symbol) ?? []).filter((month) =>
      overlaps(month, request.startTime, request.endTime),
    );
    if (months.length === 0) return [];

    const raw: Candle[] = [];
    const baseCandlesNeeded = request.limit === undefined
      ? Number.POSITIVE_INFINITY
      : request.limit * (TIMEFRAME_MS[request.timeframe] / TIMEFRAME_MS["1m"]);
    // Read chronologically and stop as soon as the requested output limit can
    // be satisfied. This avoids downloading years of monthly files for a
    // replay session that only needs its first 1,500 candles.
    for (const month of months) {
      const candles = await readMonth(config, month);
      raw.push(
        ...candles.filter(
          (candle) =>
            candle.timestamp >= request.startTime && candle.timestamp <= request.endTime,
        ),
      );
      if (raw.length >= baseCandlesNeeded) break;
    }
    const candles = request.timeframe === "1m"
      ? raw
      : aggregateCandles(raw, "1m", request.timeframe);
    return request.limit === undefined ? candles : candles.slice(0, request.limit);
  }
}
