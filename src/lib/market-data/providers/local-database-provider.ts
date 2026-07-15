/**
 * LocalDatabaseProvider — the DEFAULT production provider. Reads seeded or
 * imported candles from the ForexTestLab database. When the exact requested
 * timeframe is not stored, it aggregates on the server from a finer stored
 * timeframe.
 */

import { prisma } from "@/lib/db";
import { aggregateCandles } from "../aggregation";
import type { MarketCandle } from "@prisma/client";
import {
  TIMEFRAME_MS,
  TIMEFRAMES,
  type Candle,
  type CandleRequest,
  type DataRange,
  type MarketDataProvider,
  type MarketSymbol,
  type Timeframe,
} from "../types";

function rowToCandle(row: MarketCandle): Candle {
  return {
    timestamp: Number(row.timestamp),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume ?? undefined,
    bidOpen: row.bidOpen ?? undefined,
    bidHigh: row.bidHigh ?? undefined,
    bidLow: row.bidLow ?? undefined,
    bidClose: row.bidClose ?? undefined,
    askOpen: row.askOpen ?? undefined,
    askHigh: row.askHigh ?? undefined,
    askLow: row.askLow ?? undefined,
    askClose: row.askClose ?? undefined,
    source: row.source,
  };
}

export class LocalDatabaseProvider implements MarketDataProvider {
  async getAvailableSymbols(): Promise<MarketSymbol[]> {
    const instruments = await prisma.marketInstrument.findMany({
      orderBy: { symbol: "asc" },
    });
    // A symbol is enabled only when it actually has candle data.
    const withData = await prisma.marketCandle.groupBy({
      by: ["instrumentId"],
      _count: { _all: true },
    });
    const hasData = new Set(withData.map((g) => g.instrumentId));

    return instruments.map((i) => ({
      symbol: i.symbol,
      displayName: i.displayName,
      baseCurrency: i.baseCurrency,
      quoteCurrency: i.quoteCurrency,
      pipSize: i.pipSize,
      pricePrecision: i.pricePrecision,
      enabled: i.enabled && hasData.has(i.id),
    }));
  }

  private async resolveInstrumentId(symbol: string): Promise<string | null> {
    const instrument = await prisma.marketInstrument.findUnique({
      where: { symbol },
      select: { id: true },
    });
    return instrument?.id ?? null;
  }

  private async storedTimeframes(instrumentId: string): Promise<Timeframe[]> {
    const rows = await prisma.marketCandle.findMany({
      where: { instrumentId },
      distinct: ["timeframe"],
      select: { timeframe: true },
    });
    return rows
      .map((r) => r.timeframe as Timeframe)
      .filter((tf) => (TIMEFRAMES as string[]).includes(tf));
  }

  /** Pick the coarsest stored timeframe that aggregates evenly into `target`. */
  private pickSourceTimeframe(
    stored: Timeframe[],
    target: Timeframe,
  ): Timeframe | null {
    if (stored.includes(target)) return target;
    const targetMs = TIMEFRAME_MS[target];
    const candidates = stored
      .filter((tf) => TIMEFRAME_MS[tf] < targetMs && targetMs % TIMEFRAME_MS[tf] === 0)
      .sort((a, b) => TIMEFRAME_MS[b] - TIMEFRAME_MS[a]);
    return candidates[0] ?? null;
  }

  async getAvailableRanges(
    symbol: string,
    timeframe: Timeframe,
  ): Promise<DataRange[]> {
    const instrumentId = await this.resolveInstrumentId(symbol);
    if (!instrumentId) return [];
    const stored = await this.storedTimeframes(instrumentId);
    const source = this.pickSourceTimeframe(stored, timeframe);
    if (!source) return [];

    const agg = await prisma.marketCandle.aggregate({
      where: { instrumentId, timeframe: source },
      _min: { timestamp: true },
      _max: { timestamp: true },
    });
    if (agg._min.timestamp == null || agg._max.timestamp == null) return [];
    return [
      {
        startTime: Number(agg._min.timestamp),
        endTime: Number(agg._max.timestamp),
      },
    ];
  }

  async getCandles(request: CandleRequest): Promise<Candle[]> {
    const instrumentId = await this.resolveInstrumentId(request.symbol);
    if (!instrumentId) return [];
    const stored = await this.storedTimeframes(instrumentId);
    const source = this.pickSourceTimeframe(stored, request.timeframe);
    if (!source) return [];

    const rows = await prisma.marketCandle.findMany({
      where: {
        instrumentId,
        timeframe: source,
        timestamp: {
          gte: BigInt(Math.floor(request.startTime)),
          lte: BigInt(Math.floor(request.endTime)),
        },
      },
      orderBy: { timestamp: "asc" },
    });

    let candles = rows.map(rowToCandle);
    if (source !== request.timeframe) {
      candles = aggregateCandles(candles, source, request.timeframe);
    }
    if (request.limit && candles.length > request.limit) {
      candles = candles.slice(0, request.limit);
    }
    return candles;
  }
}
