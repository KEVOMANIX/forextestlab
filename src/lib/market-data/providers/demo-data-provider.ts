/**
 * DemoDataProvider — deterministic synthetic data when no imported dataset is
 * available. Always labelled as demonstration data.
 */

import { SYMBOL_DEFINITIONS } from "../symbols";
import {
  DEMO_RANGE_END,
  DEMO_RANGE_START,
  generateDemoSeries,
} from "../demo-generator";
import type {
  Candle,
  CandleRequest,
  DataRange,
  MarketDataProvider,
  MarketSymbol,
} from "../types";

export class DemoDataProvider implements MarketDataProvider {
  async getAvailableSymbols(): Promise<MarketSymbol[]> {
    // Every catalogued symbol can be generated on demand, so all are enabled.
    return SYMBOL_DEFINITIONS.map((def) => ({
      symbol: def.symbol,
      displayName: def.displayName,
      baseCurrency: def.baseCurrency,
      quoteCurrency: def.quoteCurrency,
      pipSize: def.pipSize,
      pricePrecision: def.pricePrecision,
      enabled: true,
    }));
  }

  async getAvailableRanges(): Promise<DataRange[]> {
    return [{ startTime: DEMO_RANGE_START, endTime: DEMO_RANGE_END }];
  }

  async getCandles(request: CandleRequest): Promise<Candle[]> {
    const series = generateDemoSeries(request.symbol, request.timeframe);
    let filtered = series.filter(
      (c) => c.timestamp >= request.startTime && c.timestamp <= request.endTime,
    );
    if (request.limit && filtered.length > request.limit) {
      filtered = filtered.slice(0, request.limit);
    }
    return filtered;
  }
}
