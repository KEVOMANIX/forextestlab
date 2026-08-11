/**
 * Market-data provider factory.
 *
 * The active provider is chosen by MARKET_DATA_PROVIDER (default `r2`). When
 * the primary provider has no data for a request and
 * demo data is enabled, requests fall back to the deterministic DemoDataProvider
 * so the public beta always works without any external API key.
 */

import "server-only";

import { DemoDataProvider } from "./providers/demo-data-provider";
import { R2ParquetProvider } from "./providers/r2-parquet-provider";
import type {
  Candle,
  CandleRequest,
  DataRange,
  MarketDataProvider,
  MarketSymbol,
  Timeframe,
} from "./types";

export type ProviderKey = "r2" | "demo";

function demoEnabled(): boolean {
  // Enabled unless explicitly turned off.
  return process.env.ENABLE_DEMO_DATA !== "false";
}

function basePrimary(): MarketDataProvider {
  switch (process.env.MARKET_DATA_PROVIDER as ProviderKey | undefined) {
    case "demo":
      return new DemoDataProvider();
    case "r2":
    default:
      return new R2ParquetProvider();
  }
}

/**
 * Wraps the primary provider so that any symbol/range with no stored data
 * transparently falls back to deterministic demo data (when enabled).
 */
class ProviderWithDemoFallback implements MarketDataProvider {
  private readonly primary: MarketDataProvider;
  private readonly demo = new DemoDataProvider();

  constructor(primary: MarketDataProvider) {
    this.primary = primary;
  }

  async getAvailableSymbols(): Promise<MarketSymbol[]> {
    const primary = await this.primary.getAvailableSymbols();
    if (!demoEnabled()) return primary;

    const demoSymbols = await this.demo.getAvailableSymbols();
    const primaryBySymbol = new Map(
      primary.map((symbol) => [symbol.symbol, symbol]),
    );
    return demoSymbols.map((demoSymbol) => {
      const stored = primaryBySymbol.get(demoSymbol.symbol);
      return stored
        ? { ...demoSymbol, ...stored, enabled: stored.enabled || demoSymbol.enabled }
        : demoSymbol;
    });
  }

  async getAvailableRanges(
    symbol: string,
    timeframe: Timeframe,
  ): Promise<DataRange[]> {
    const ranges = await this.primary.getAvailableRanges(symbol, timeframe);
    if (ranges.length > 0 || !demoEnabled()) return ranges;
    return this.demo.getAvailableRanges();
  }

  async getCandles(request: CandleRequest): Promise<Candle[]> {
    const candles = await this.primary.getCandles(request);
    if (candles.length > 0 || !demoEnabled()) return candles;
    return this.demo.getCandles(request);
  }
}

export function getMarketDataProvider(): MarketDataProvider {
  const primary = basePrimary();
  if (primary instanceof DemoDataProvider) return primary;
  return new ProviderWithDemoFallback(primary);
}

export * from "./types";
