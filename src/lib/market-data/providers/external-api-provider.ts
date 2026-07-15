/**
 * Reusable interface + shared helpers for FUTURE authorised external data
 * providers. No third-party API is mandatory for the public beta.
 *
 * The contract for every external provider:
 *   1. Retrieve data server-side (never from the browser).
 *   2. Validate + normalise it.
 *   3. Store it in the ForexTestLab database.
 *   4. Serve replay data from the ForexTestLab backend (LocalDatabaseProvider).
 *
 * Credentials must come from server-only env vars — never NEXT_PUBLIC_*.
 */

import "server-only";

import { prisma } from "@/lib/db";
import { validateCandle } from "../validators";
import { getSymbolDefinition } from "../symbols";
import type {
  Candle,
  MarketDataProvider,
  Timeframe,
} from "../types";

export interface ExternalApiProvider extends MarketDataProvider {
  /** True only when the provider is enabled AND correctly configured. */
  isEnabled(): boolean;
  /**
   * Fetch a range server-side, validate/normalise, and persist into the DB.
   * Returns the number of candles stored. Must be a no-op-with-error when the
   * provider is disabled.
   */
  ingest(
    symbol: string,
    timeframe: Timeframe,
    startTime: number,
    endTime: number,
  ): Promise<number>;
}

/** Persist externally-sourced candles into the DB (validated, deduplicated). */
export async function persistExternalCandles(
  symbol: string,
  timeframe: Timeframe,
  candles: Candle[],
): Promise<number> {
  const def = getSymbolDefinition(symbol);
  if (!def) throw new Error(`Unknown symbol "${symbol}".`);

  const instrument = await prisma.marketInstrument.upsert({
    where: { symbol: def.symbol },
    update: {},
    create: {
      symbol: def.symbol,
      displayName: def.displayName,
      baseCurrency: def.baseCurrency,
      quoteCurrency: def.quoteCurrency,
      pipSize: def.pipSize,
      pricePrecision: def.pricePrecision,
      enabled: true,
    },
  });

  const valid = candles.filter((c) => validateCandle(c).valid);
  if (valid.length === 0) return 0;

  let stored = 0;
  for (const c of valid) {
    await prisma.marketCandle.upsert({
      where: {
        instrumentId_timeframe_timestamp: {
          instrumentId: instrument.id,
          timeframe,
          timestamp: BigInt(c.timestamp),
        },
      },
      update: {},
      create: {
        instrumentId: instrument.id,
        timeframe,
        timestamp: BigInt(c.timestamp),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume ?? null,
        source: c.source,
      },
    });
    stored += 1;
  }
  return stored;
}
