import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/market-data", () => ({ getMarketDataProvider: () => ({ getCandles: async () => [] }) }));

import { TOOL_DECLARATIONS, runTool, type TradeBook } from "./tools";
import type { BookTrade } from "./trade-query";
import type { SessionState } from "@/lib/backtest/types";

const MONDAY = Date.UTC(2024, 9, 14, 14, 0);
const DAY = 86_400_000;

function trade(number: number, pnl: number, entryTime: number): BookTrade {
  return { number, sessionId: "cmsessionabc123", sessionRef: "abc123", sessionName: "London breakout", symbol: "EUR/USD", direction: "long", entryTime, exitTime: entryTime + 3_600_000, pnl, pips: pnl / 10, exitReason: "manual", r: null, notes: null };
}

const state = { status: "running", config: { symbol: "EURUSD", timeframe: "1h", startTime: MONDAY, endTime: MONDAY + 10 * DAY } } as unknown as SessionState;
const book: TradeBook = {
  sessions: [{ id: "cmsessionabc123", ref: "abc123", name: "London breakout", state, trades: [] }],
  trades: [trade(1, 120, MONDAY), trade(2, -60, MONDAY + 4 * DAY), trade(3, -40, MONDAY + 4 * DAY + 3_600_000)],
};

describe("AI Analyst tools", () => {
  it("declares every tool it can run", async () => {
    for (const declaration of TOOL_DECLARATIONS) {
      expect(await runTool(declaration.name, { session: "abc123", groupBy: "weekday" }, book)).not.toHaveProperty("error", `Unknown tool ${declaration.name}.`);
    }
  });

  it("lists sessions with their ref and results", async () => {
    expect(await runTool("list_sessions", {}, book)).toEqual([expect.objectContaining({ ref: "abc123", name: "London breakout", trades: 3, net: 20, status: "running" })]);
  });

  it("finds trades with citations and a summary of every match", async () => {
    const result = await runTool("find_trades", { weekdays: ["Friday"], sortBy: "pnl", limit: 1 }, book) as { summary: { trades: number; net: number }; listed: { cite: string }[]; more: number };
    expect(result.summary).toMatchObject({ trades: 2, net: -100 });
    expect(result.listed).toEqual([expect.objectContaining({ cite: "[#2@abc123]", pnl: -60 })]);
    expect(result.more).toBe(1);
  });

  it("ignores filters of the wrong type rather than failing", async () => {
    const result = await runTool("find_trades", { weekdays: "Friday", entryHourFrom: "nine" }, book) as { summary: { trades: number } };
    expect(result.summary.trades).toBe(3);
  });

  it("answers what skipping Fridays would have changed", async () => {
    const result = await runTool("what_if_skipped", { weekdays: ["Friday"] }, book) as { actual: { net: number }; withoutSkipped: { net: number } };
    expect([result.actual.net, result.withoutSkipped.net]).toEqual([20, 120]);
  });

  it("only re-runs levels on a finished session", async () => {
    expect(await runTool("what_if_levels", { session: "abc123", stopLossPips: 20 }, book)).toEqual({ error: expect.stringContaining("still being replayed") });
    expect(await runTool("what_if_levels", { session: "nope", stopLossPips: 20 }, book)).toEqual({ error: expect.stringContaining("No session matches") });
  });
});
