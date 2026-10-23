import { tmpdir } from "node:os";
import path from "node:path";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { aggregateCandles } from "@/lib/market-data/aggregation";
import { nextForexDailyBoundary } from "@/lib/market-data/forex-day";
import { encodeParquet } from "@/lib/market-data/r2-sync";
import type { Candle } from "@/lib/market-data/types";

// A fake R2: objects by key, served through the S3 commands the provider sends.
const objects = new Map<string, Uint8Array>();
vi.mock("@aws-sdk/client-s3", () => {
  class NoSuchKey extends Error {}
  class GetObjectCommand { constructor(public input: { Key: string }) {} }
  class ListObjectsV2Command { constructor(public input: { Prefix: string }) {} }
  class S3Client {
    async send(command: GetObjectCommand | ListObjectsV2Command) {
      if (command instanceof ListObjectsV2Command) {
        return { Contents: [...objects.keys()].filter((key) => key.startsWith(command.input.Prefix)).map((Key) => ({ Key })), IsTruncated: false };
      }
      const bytes = objects.get(command.input.Key);
      if (!bytes) throw new NoSuchKey("missing");
      return { Body: { transformToByteArray: async () => bytes } };
    }
  }
  return { GetObjectCommand, ListObjectsV2Command, NoSuchKey, S3Client };
});

const { R2ParquetProvider } = await import("./r2-parquet-provider");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const START = Date.UTC(2024, 2, 4, 0, 0); // Monday 4 March 2024
const minutes: Candle[] = Array.from({ length: 3 * 24 * 60 }, (_, index) => {
  // A wandering price, so every bucket has a distinct open/high/low/close.
  const base = 1.08 + Math.sin(index / 37) * 0.002 + (index % 11) * 0.00001;
  const price = (offset: number) => (base + offset).toFixed(5);
  return { timestamp: START + index * MINUTE, open: price(0), high: price(0.0004), low: price(-0.0004), close: price(0.0001), source: "dukascopy-r2" };
});

async function put(key: string, candles: Candle[], timeframe: string) {
  objects.set(key, new Uint8Array(await encodeParquet(candles, timeframe)));
}

const ohlc = (candles: Candle[]) => candles.map(({ timestamp, open, high, low, close }) => [timestamp, Number(open), Number(high), Number(low), Number(close)]);

beforeAll(async () => {
  process.env.R2_ENDPOINT = "https://r2.test";
  process.env.R2_BUCKET_NAME = "test";
  process.env.R2_ACCESS_KEY_ID = "id";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_MANIFEST_CACHE_FILE = path.join(tmpdir(), `ftl-manifest-${process.pid}.json`);
  await put("market_data/EURUSD/2024/03.parquet", minutes, "1m");
  // The hourly rollup stops 5 hours before the data ends, as it would between
  // daily builds; the reader must fill that stretch from minutes.
  const hourly = aggregateCandles(minutes, "1m", "1h");
  await put("market_data_rollups/1h/EURUSD/2024/03.parquet", hourly.slice(0, -5), "1h");
  // The daily rollup holds the complete New York days only.
  const lastMinute = minutes[minutes.length - 1]!.timestamp;
  const days = aggregateCandles(minutes, "1m", "1d").filter((day) => nextForexDailyBoundary(day.timestamp) <= lastMinute + MINUTE);
  await put("market_data_rollups/1d-ny/EURUSD.parquet", days, "1d-ny");
});

describe("chart rollups", () => {
  const provider = new R2ParquetProvider();
  // The replay clock stops mid-hour on the third day.
  const endTime = START + 2 * 24 * HOUR + 22 * HOUR + 17 * MINUTE;
  const revealed = minutes.filter((candle) => candle.timestamp <= endTime);

  it("serves hourly-family charts identical to building them from minutes, up to the replay clock", async () => {
    for (const timeframe of ["1h", "4h"] as const) {
      const fromRollups = await provider.getCandles({ symbol: "EURUSD", timeframe, startTime: START, endTime });
      expect(ohlc(fromRollups)).toEqual(ohlc(aggregateCandles(revealed, "1m", timeframe)));
    }
  });

  it("never shows the hour in progress beyond the replay clock", async () => {
    const hourly = await provider.getCandles({ symbol: "EURUSD", timeframe: "1h", startTime: START, endTime });
    const last = hourly[hourly.length - 1]!;
    const sameHour = revealed.filter((candle) => candle.timestamp >= last.timestamp);
    expect(Number(last.high)).toBe(Math.max(...sameHour.map((candle) => Number(candle.high))));
    expect(Number(last.close)).toBe(Number(sameHour[sameHour.length - 1]!.close));
  });

  it("serves daily charts identical to building them from minutes, with the open day partial", async () => {
    const fromRollup = await provider.getCandles({ symbol: "EURUSD", timeframe: "1d", startTime: START, endTime });
    expect(ohlc(fromRollup)).toEqual(ohlc(aggregateCandles(revealed, "1m", "1d")));
  });
});
