import { describe, expect, it } from "vitest";

import { AUTOMATED_FX_SYMBOLS, DUKASCOPY_MARKET_SYMBOLS, mergeCandles, rowsToCandles } from "./r2-sync";
import type { Candle } from "./types";

function candle(timestamp: number, close: string): Candle {
  return {
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    source: "test",
  };
}

describe("R2 market-data synchronization", () => {
  it("automates exactly the 28 traditional FX pairs", () => {
    expect(AUTOMATED_FX_SYMBOLS).toHaveLength(28);
    expect(AUTOMATED_FX_SYMBOLS).toContain("AUDCAD");
    expect(AUTOMATED_FX_SYMBOLS).toContain("GBPJPY");
    expect(AUTOMATED_FX_SYMBOLS).not.toContain("XAUUSD");
    expect(AUTOMATED_FX_SYMBOLS).not.toContain("BTCUSD");
  });

  it("allows explicit provider backfills for metals and Bitcoin, but not DXY", () => {
    expect(DUKASCOPY_MARKET_SYMBOLS).toContain("XAUUSD");
    expect(DUKASCOPY_MARKET_SYMBOLS).toContain("XAGUSD");
    expect(DUKASCOPY_MARKET_SYMBOLS).toContain("BTCUSD");
    expect(DUKASCOPY_MARKET_SYMBOLS).not.toContain("DXY");
  });

  it("deduplicates overlap candles and lets the newer download win", () => {
    expect(mergeCandles([candle(60_000, "1.1")], [candle(60_000, "1.2"), candle(120_000, "1.3")]))
      .toEqual([candle(60_000, "1.2"), candle(120_000, "1.3")]);
  });

  it("rejects malformed OHLC rows before they can reach R2", () => {
    const rows = rowsToCandles([
      { timestamp: 60_000n, open: 1.1, high: 1.2, low: 1, close: 1.15, volume: 2 },
      { timestamp: 120_000n, open: 1.1, high: 1, low: 1.2, close: 1.15, volume: 2 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.timestamp).toBe(60_000);
  });
});
