import "server-only";

import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";

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
const MAX_CACHED_MONTHS = 24;
const COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"];

interface R2Config {
  bucket: string;
  prefix: string;
  client: S3Client;
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
const candleCache = new Map<string, Promise<Candle[]>>();

function requiredEnv(name: string, fallbackName?: string): string {
  const value = process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!value?.trim()) {
    throw new Error(`Missing required server environment variable ${name}.`);
  }
  return value.trim();
}

function r2Config(): R2Config {
  const endpoint = requiredEnv("R2_ENDPOINT", "R2_ENDPOINT_URL").replace(/\/$/, "");
  const bucket = requiredEnv("R2_BUCKET_NAME", "R2_BUCKET");
  const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");

  return {
    bucket,
    prefix: (process.env.R2_PREFIX?.trim() || "market_data").replace(/^\/+|\/+$/g, ""),
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
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
  let continuationToken: string | undefined;
  do {
    const page = await config.client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: `${config.prefix}/`,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of page.Contents ?? []) {
      if (!object.Key) continue;
      const month = parseStoredMonth(object.Key, config.prefix);
      if (!month) continue;
      const stored = monthsBySymbol.get(month.symbol) ?? [];
      stored.push(month);
      monthsBySymbol.set(month.symbol, stored);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  for (const months of monthsBySymbol.values()) {
    months.sort((a, b) => a.year - b.year || a.month - b.month);
  }
  manifestCache = { expiresAt: Date.now() + MANIFEST_TTL_MS, monthsBySymbol };
  return monthsBySymbol;
}

async function readMonth(config: R2Config, stored: StoredMonth): Promise<Candle[]> {
  const cached = candleCache.get(stored.key);
  if (cached) {
    candleCache.delete(stored.key);
    candleCache.set(stored.key, cached);
    return cached;
  }

  const pending = (async () => {
    const response = await config.client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: stored.key }),
    );
    if (!response.Body) throw new Error(`Cloudflare R2 returned an empty object for ${stored.key}.`);
    const bytes = await response.Body.transformToByteArray();
    const file = Uint8Array.from(bytes).buffer;
    const rows = await parquetReadObjects({ file, compressors, columns: COLUMNS });
    const candles = parquetRowsToCandles(rows);
    if (candles.length === 0) {
      throw new Error(`No valid candles were found in ${stored.key}.`);
    }
    return candles;
  })();

  candleCache.set(stored.key, pending);
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
