/**
 * LocalCsvProvider — imports historical CSV files into the database and then
 * serves them like any other stored data. Reads are delegated to the
 * LocalDatabaseProvider (the CSV lands in the same tables).
 */

import { importMarketData, type ImportOptions, type ImportReport } from "../import";
import { LocalDatabaseProvider } from "./local-database-provider";
import type {
  Candle,
  CandleRequest,
  DataRange,
  MarketDataProvider,
  MarketSymbol,
  Timeframe,
} from "../types";

export class LocalCsvProvider implements MarketDataProvider {
  private readonly db = new LocalDatabaseProvider();

  /** Import a CSV file into the database. Returns a detailed report. */
  async import(options: ImportOptions): Promise<ImportReport> {
    return importMarketData(options);
  }

  getAvailableSymbols(): Promise<MarketSymbol[]> {
    return this.db.getAvailableSymbols();
  }

  getAvailableRanges(
    symbol: string,
    timeframe: Timeframe,
  ): Promise<DataRange[]> {
    return this.db.getAvailableRanges(symbol, timeframe);
  }

  getCandles(request: CandleRequest): Promise<Candle[]> {
    return this.db.getCandles(request);
  }
}
