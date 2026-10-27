import { describe, expect, it } from "vitest";

import type { SimulatedTrade } from "@/generated/prisma/client";
import { analystSessionCard } from "./analyst";
import type { PortfolioSessionRow } from "./portfolio";

const HOUR = 3_600_000;
const START = Date.UTC(2024, 0, 2, 12);

function trade(index: number, pnl: string, validity = "valid"): SimulatedTrade {
  return {
    id: `t${index}`, sessionId: "s1", direction: "long", entryPrice: "1.1", exitPrice: "1.1",
    entryTime: BigInt(START + index * HOUR), exitTime: BigInt(START + index * HOUR + 1_800_000),
    entryIndex: index, exitIndex: index + 1, lots: "0.1", stopLoss: null, takeProfit: null,
    commission: "0", pnl, pips: "0", exitReason: "manual", intrabarAmbiguous: false,
    validity, notes: null, createdAt: new Date(0),
  };
}

function session(trades: SimulatedTrade[]): PortfolioSessionRow {
  return {
    id: "s1", name: "London breakout", symbol: "EURUSD", symbols: ["EURUSD"], archived: false,
    timeframe: "1h", status: "completed", startTime: BigInt(START), endTime: BigInt(START + 30 * 24 * HOUR),
    startingBalance: "10000", depositedFunds: "0", balance: "10000", trades, equitySnapshots: [],
  };
}

describe("AI Analyst session cards", () => {
  it("reports the session's own numbers", () => {
    const card = analystSessionCard(session([trade(0, "300"), trade(1, "-100"), trade(2, "200")]));
    expect(card).toMatchObject({ id: "s1", name: "London breakout", market: "EUR/USD", category: "Forex", timeframe: "1h", trades: 3, profitFactor: "5.00" });
    expect(card.returnPercent).toBeCloseTo(4);
    expect(card.period).toBe("Jan 2, 2024 to Feb 1, 2024");
    expect(card.curve).toEqual([10000, 10300, 10200, 10400]);
  });

  it("leaves experimental trades out of every number", () => {
    const card = analystSessionCard(session([trade(0, "300"), trade(1, "-900", "experimental")]));
    expect(card.trades).toBe(1);
    expect(card.returnPercent).toBeCloseTo(3);
  });

  it("thins a long equity history to a fixed number of points", () => {
    const row = session([trade(0, "50")]);
    row.equitySnapshots = Array.from({ length: 500 }, (_, index) => ({ index, time: BigInt(START + index * HOUR), balance: "10000", equity: String(10000 + index) }));
    const card = analystSessionCard(row);
    expect(card.curve).toHaveLength(48);
    expect(card.curve[0]).toBe(10000);
    expect(card.curve.at(-1)).toBe(10499);
  });
});
