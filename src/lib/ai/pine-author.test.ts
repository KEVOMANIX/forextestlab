import { describe, expect, it } from "vitest";

import { authorPrompt, changedLines, parseAuthorReply, summarizeReport } from "./pine-author";

describe("parseAuthorReply", () => {
  it("reads message, rules, assumptions and code", () => {
    const reply = parseAuthorReply("MESSAGE:\nBreakout of the Asian range.\nRULES:\n- Long above the Asian high\n- ? Shorts left out\nCODE:\n```pine\n//@version=6\nstrategy(\"X\")\n```");
    expect(reply.message).toBe("Breakout of the Asian range.");
    expect(reply.rules).toEqual(["Long above the Asian high", "? Shorts left out"]);
    expect(reply.code).toBe("//@version=6\nstrategy(\"X\")\n");
  });
  it("handles an explanation with no code", () => {
    const reply = parseAuthorReply("MESSAGE:\nMost losses were on Fridays.\nRULES:\n");
    expect(reply).toEqual({ message: "Most losses were on Fridays.", rules: [], code: null });
  });
  it("falls back to the raw text when the format is ignored", () => {
    expect(parseAuthorReply("Just some words").message).toBe("Just some words");
  });
});

describe("helpers", () => {
  it("counts changed lines", () => {
    expect(changedLines("a\nb\nc", "a\nB\nc\nd")).toBe(2);
    expect(changedLines("a", "a")).toBe(0);
  });
  it("includes the summary and request in the prompt", () => {
    const text = authorPrompt({ prompt: "add a stop", code: "//@version=6", summary: null });
    expect(text).toContain("add a stop");
    expect(text).toContain("//@version=6");
  });
  it("groups trades by month, weekday and hour", () => {
    const trades = [
      { direction: "long" as const, entryTime: Date.UTC(2024, 0, 5, 9), pnl: 10 },
      { direction: "short" as const, entryTime: Date.UTC(2024, 0, 5, 9), pnl: -4 },
      { direction: "long" as const, entryTime: Date.UTC(2024, 1, 6, 14), pnl: 3 },
    ];
    const summary = summarizeReport({ symbol: "EURUSD", startingBalance: 10_000, netPnl: 9, winRate: 66.7, profitFactor: 3.25, trades }, { timeframe: "1h", from: "2024-01-01", through: "2024-02-28", maxDrawdownPercent: 0.04 });
    expect(summary.trades).toBe(3);
    expect(summary.longs).toBe(2);
    expect(summary.byMonth).toEqual([{ month: "2024-01", trades: 2, pnl: 6 }, { month: "2024-02", trades: 1, pnl: 3 }]);
    expect(summary.byWeekday).toEqual([{ day: "Tue", trades: 1, pnl: 3 }, { day: "Fri", trades: 2, pnl: 6 }]);
    expect(summary.byHour?.[0]).toEqual({ hour: 9, trades: 2, pnl: 6 });
  });
});
