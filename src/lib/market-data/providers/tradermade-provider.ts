/**
 * TraderMade adapter — DISABLED by default. Server-side only.
 *
 * Enable ONLY when TRADERMADE_ENABLED=true and TRADERMADE_API_KEY is set.
 *
 * ⚠️ LICENSING: verify that the selected plan permits public/commercial display
 * and redistribution before enabling on the public platform.
 */

import "server-only";

import { getSymbolDefinition } from "../symbols";
import { TIMEFRAME_MS, type Candle, type CandleRequest, type DataRange, type MarketSymbol, type Timeframe } from "../types";
import { LocalDatabaseProvider } from "./local-database-provider";
import { persistExternalCandles, type ExternalApiProvider } from "./external-api-provider";

const TF_MAP: Record<Timeframe, { interval: string; period: number }> = {
  "1m": { interval: "minute", period: 1 },
  "5m": { interval: "minute", period: 5 },
  "15m": { interval: "minute", period: 15 },
  "30m": { interval: "minute", period: 30 },
  "1h": { interval: "hourly", period: 1 },
  "4h": { interval: "hourly", period: 4 },
  "1d": { interval: "daily", period: 1 },
};

export class TraderMadeProvider implements ExternalApiProvider {
  private readonly db = new LocalDatabaseProvider();

  isEnabled(): boolean {
    return (
      process.env.TRADERMADE_ENABLED === "true" &&
      typeof process.env.TRADERMADE_API_KEY === "string" &&
      process.env.TRADERMADE_API_KEY.length > 0
    );
  }

  async ingest(
    symbol: string,
    timeframe: Timeframe,
    startTime: number,
    endTime: number,
  ): Promise<number> {
    if (!this.isEnabled()) {
      throw new Error(
        "TraderMadeProvider is disabled. Set TRADERMADE_ENABLED=true and TRADERMADE_API_KEY, and confirm licensing.",
      );
    }
    const def = getSymbolDefinition(symbol);
    if (!def) throw new Error(`Unknown symbol "${symbol}".`);
    const tf = TF_MAP[timeframe];

    const toStamp = (ms: number) =>
      new Date(ms).toISOString().slice(0, 16).replace("T", "-");
    const params = new URLSearchParams({
      currency: def.symbol,
      api_key: process.env.TRADERMADE_API_KEY as string,
      start_date: toStamp(startTime),
      end_date: toStamp(endTime),
      format: "records",
      interval: tf.interval,
      period: String(tf.period),
    });

    const res = await fetch(`https://marketdata.tradermade.com/api/v1/timeseries?${params}`);
    if (!res.ok) throw new Error(`TraderMade request failed: ${res.status}`);
    const json: unknown = await res.json();
    const quotes =
      typeof json === "object" && json !== null && "quotes" in json
        ? (json as { quotes?: unknown }).quotes
        : undefined;
    if (!Array.isArray(quotes)) return 0;

    const step = TIMEFRAME_MS[timeframe];
    const candles: Candle[] = [];
    for (const q of quotes) {
      if (typeof q !== "object" || q === null) continue;
      const row = q as Record<string, unknown>;
      const dt = typeof row.date === "string" ? row.date : null;
      if (!dt) continue;
      const ms = Date.parse(`${dt.replace(" ", "T")}Z`);
      if (Number.isNaN(ms)) continue;
      candles.push({
        timestamp: ms - (ms % step),
        open: String(row.open ?? ""),
        high: String(row.high ?? ""),
        low: String(row.low ?? ""),
        close: String(row.close ?? ""),
        source: "tradermade",
      });
    }
    return persistExternalCandles(symbol, timeframe, candles);
  }

  getAvailableSymbols(): Promise<MarketSymbol[]> {
    return this.db.getAvailableSymbols();
  }
  getAvailableRanges(symbol: string, timeframe: Timeframe): Promise<DataRange[]> {
    return this.db.getAvailableRanges(symbol, timeframe);
  }
  getCandles(request: CandleRequest): Promise<Candle[]> {
    return this.db.getCandles(request);
  }
}
