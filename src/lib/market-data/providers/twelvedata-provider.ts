/**
 * TwelveData adapter — DISABLED by default. Server-side only.
 *
 * Enable ONLY when TWELVE_DATA_ENABLED=true and TWELVE_DATA_API_KEY is set.
 *
 * ⚠️ LICENSING: Free API access does NOT automatically grant public-display,
 * redistribution, or commercial-use rights. Before enabling this on the public
 * ForexTestLab platform, the project owner MUST review TwelveData's current
 * terms and obtain any required written permission or commercial licence.
 */

import "server-only";

import { getSymbolDefinition } from "../symbols";
import { TIMEFRAME_MS, type Candle, type CandleRequest, type DataRange, type MarketSymbol, type Timeframe } from "../types";
import { LocalDatabaseProvider } from "./local-database-provider";
import { persistExternalCandles, type ExternalApiProvider } from "./external-api-provider";

const TF_MAP: Record<Timeframe, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day",
};

export class TwelveDataProvider implements ExternalApiProvider {
  private readonly db = new LocalDatabaseProvider();

  isEnabled(): boolean {
    return (
      process.env.TWELVE_DATA_ENABLED === "true" &&
      typeof process.env.TWELVE_DATA_API_KEY === "string" &&
      process.env.TWELVE_DATA_API_KEY.length > 0
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
        "TwelveDataProvider is disabled. Set TWELVE_DATA_ENABLED=true and TWELVE_DATA_API_KEY, and confirm licensing.",
      );
    }
    const def = getSymbolDefinition(symbol);
    if (!def) throw new Error(`Unknown symbol "${symbol}".`);

    const params = new URLSearchParams({
      symbol: `${def.baseCurrency}/${def.quoteCurrency}`,
      interval: TF_MAP[timeframe],
      apikey: process.env.TWELVE_DATA_API_KEY as string,
      format: "JSON",
      timezone: "UTC",
      start_date: new Date(startTime).toISOString(),
      end_date: new Date(endTime).toISOString(),
      outputsize: "5000",
    });

    const res = await fetch(`https://api.twelvedata.com/time_series?${params}`);
    if (!res.ok) throw new Error(`TwelveData request failed: ${res.status}`);
    const json: unknown = await res.json();

    const values =
      typeof json === "object" && json !== null && "values" in json
        ? (json as { values?: unknown }).values
        : undefined;
    if (!Array.isArray(values)) return 0;

    const step = TIMEFRAME_MS[timeframe];
    const candles: Candle[] = [];
    for (const v of values) {
      if (typeof v !== "object" || v === null) continue;
      const row = v as Record<string, unknown>;
      const dt = typeof row.datetime === "string" ? row.datetime : null;
      if (!dt) continue;
      const ms = Date.parse(dt.includes("T") ? `${dt}Z` : `${dt.replace(" ", "T")}Z`);
      if (Number.isNaN(ms)) continue;
      candles.push({
        timestamp: ms - (ms % step),
        open: String(row.open ?? ""),
        high: String(row.high ?? ""),
        low: String(row.low ?? ""),
        close: String(row.close ?? ""),
        volume: row.volume != null ? String(row.volume) : undefined,
        source: "twelvedata",
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
