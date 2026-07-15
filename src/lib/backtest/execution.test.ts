import { describe, it, expect } from "vitest";

import type { Candle } from "@/lib/market-data/types";
import {
  checkStopTakeProfit,
  commissionForLots,
  computePnl,
  deriveBidAsk,
  entryFillPrice,
  exitFillPrice,
} from "./execution";

function candle(o: string, h: string, l: string, c: string): Candle {
  return { timestamp: 0, open: o, high: h, low: l, close: c, source: "test" };
}

describe("deriveBidAsk", () => {
  it("applies a symmetric simulated half-spread when no bid/ask present", () => {
    const ba = deriveBidAsk(candle("1.10000", "1.10050", "1.09950", "1.10000"), "2.0", "0.0001");
    expect(ba.nativeSpread).toBe(false);
    expect(ba.bidClose.toString()).toBe("1.0999");
    expect(ba.askClose.toString()).toBe("1.1001");
  });

  it("uses native bid/ask when present", () => {
    const c: Candle = {
      timestamp: 0,
      open: "1.1", high: "1.1", low: "1.1", close: "1.1",
      bidOpen: "1.0999", bidHigh: "1.1004", bidLow: "1.0994", bidClose: "1.0999",
      askOpen: "1.1001", askHigh: "1.1006", askLow: "1.0996", askClose: "1.1001",
      source: "test",
    };
    const ba = deriveBidAsk(c, "5", "0.0001");
    expect(ba.nativeSpread).toBe(true);
    expect(ba.bidClose.toString()).toBe("1.0999");
    expect(ba.askClose.toString()).toBe("1.1001");
  });
});

describe("entry / exit fills", () => {
  it("long enters at ask + slippage, short enters at bid - slippage", () => {
    const c = candle("1.10000", "1.10050", "1.09950", "1.10000");
    expect(entryFillPrice("long", c, "0", "0.0001", "1").toString()).toBe("1.1001");
    expect(entryFillPrice("short", c, "0", "0.0001", "1").toString()).toBe("1.0999");
  });

  it("long exits at bid, short exits at ask", () => {
    const c = candle("1.10000", "1.10050", "1.09950", "1.10000");
    expect(exitFillPrice("long", c, "2", "0.0001").toString()).toBe("1.0999");
    expect(exitFillPrice("short", c, "2", "0.0001").toString()).toBe("1.1001");
  });
});

describe("checkStopTakeProfit", () => {
  it("detects a long stop-loss", () => {
    const hit = checkStopTakeProfit("long", "1.09900", "1.10500", candle("1.10000", "1.10050", "1.09850", "1.09900"), "0", "0.0001", "conservative");
    expect(hit?.reason).toBe("stop-loss");
    expect(hit?.intrabarAmbiguous).toBe(false);
  });

  it("detects a long take-profit", () => {
    const hit = checkStopTakeProfit("long", "1.09000", "1.10200", candle("1.10000", "1.10250", "1.09990", "1.10200"), "0", "0.0001", "conservative");
    expect(hit?.reason).toBe("take-profit");
  });

  it("marks intrabar ambiguity and prefers stop-loss under the conservative policy", () => {
    const c = candle("1.10000", "1.10300", "1.09700", "1.10000");
    const conservative = checkStopTakeProfit("long", "1.09800", "1.10200", c, "0", "0.0001", "conservative");
    expect(conservative?.reason).toBe("stop-loss");
    expect(conservative?.intrabarAmbiguous).toBe(true);
    const optimistic = checkStopTakeProfit("long", "1.09800", "1.10200", c, "0", "0.0001", "optimistic");
    expect(optimistic?.reason).toBe("take-profit");
    expect(optimistic?.intrabarAmbiguous).toBe(true);
  });

  it("returns null when neither level is touched", () => {
    const hit = checkStopTakeProfit("long", "1.09000", "1.11000", candle("1.10000", "1.10050", "1.09950", "1.10000"), "0", "0.0001", "conservative");
    expect(hit).toBeNull();
  });

  it("detects a short stop-loss on the ask side", () => {
    const hit = checkStopTakeProfit("short", "1.10200", "1.09000", candle("1.10000", "1.10250", "1.09950", "1.10200"), "0", "0.0001", "conservative");
    expect(hit?.reason).toBe("stop-loss");
  });
});

describe("commission + P&L", () => {
  it("computes commission for lots", () => {
    expect(commissionForLots("7", "0.5")).toBe("3.50");
  });

  it("computes long P&L net of commission", () => {
    const r = computePnl({ direction: "long", entryPrice: "1.10000", exitPrice: "1.10100", lots: "1.0", pipSize: "0.0001", pipValueAccountPerLot: "10.00", commission: "0" });
    expect(r.pips).toBe("10.0");
    expect(r.pnl).toBe("100.00");
  });

  it("computes short P&L (profit when price falls)", () => {
    const r = computePnl({ direction: "short", entryPrice: "1.10000", exitPrice: "1.09900", lots: "2.0", pipSize: "0.0001", pipValueAccountPerLot: "10.00", commission: "5" });
    expect(r.pips).toBe("10.0");
    expect(r.pnl).toBe("195.00");
  });
});
