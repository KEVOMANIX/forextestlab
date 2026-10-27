import { describe, expect, it } from "vitest";

import { citation, compareWithout, filterTrades, groupTrades, matchSession, sessionRef, summarise, type BookTrade } from "./trade-query";

// Monday 14 October 2024. New York is UTC−4 then, so 14:00 UTC is 10:00 New York.
const MONDAY = Date.UTC(2024, 9, 14, 14, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let counter = 0;
function trade(extra: Partial<BookTrade>): BookTrade {
  counter += 1;
  return {
    number: counter, sessionId: "cmsessionabc123", sessionRef: "abc123", sessionName: "London breakout",
    symbol: "EUR/USD", direction: "long", entryTime: MONDAY, exitTime: MONDAY + HOUR,
    pnl: 0, pips: 0, exitReason: "manual", r: null, notes: null, ...extra,
  };
}

describe("AI Analyst trade queries", () => {
  const book = [
    trade({ pnl: 100, r: 2 }),
    trade({ pnl: -50, r: -1, entryTime: MONDAY + DAY, exitTime: MONDAY + DAY + 3 * HOUR }),
    trade({ pnl: -40, r: -1, entryTime: MONDAY + 4 * DAY + 5 * HOUR, exitTime: MONDAY + 4 * DAY + 6 * HOUR, direction: "short", symbol: "GBP/USD" }),
    trade({ pnl: 80, entryTime: MONDAY + 4 * DAY, exitTime: MONDAY + 4 * DAY + 20 * 60_000, sessionId: "cmsessionxyz789", sessionRef: "xyz789", sessionName: "Gold scalps", symbol: "XAU/USD", exitReason: "take-profit" }),
  ];

  it("summarises wins, losses, profit factor, R and drawdown", () => {
    expect(summarise(book)).toEqual({
      trades: 4, wins: 2, losses: 2, winRate: 50, net: 90, averageWin: 90, averageLoss: 45,
      profitFactor: 2, averageR: 0, maxDrawdown: 50,
    });
    expect(summarise([])).toMatchObject({ trades: 0, winRate: null, profitFactor: null });
  });

  it("filters by weekday, trading session, hour range, symbol and hold time", () => {
    expect(filterTrades(book, { weekdays: ["Friday"] }).map((t) => t.pnl)).toEqual([-40, 80]);
    expect(filterTrades(book, { tradingSessions: ["New York"] }).length).toBe(4);
    expect(filterTrades(book, { entryHourFrom: 14, entryHourTo: 16 }).map((t) => t.pnl)).toEqual([-40]);
    expect(filterTrades(book, { symbol: "gbpusd" }).map((t) => t.pnl)).toEqual([-40]);
    expect(filterTrades(book, { minHoldMinutes: 120 }).map((t) => t.pnl)).toEqual([-50]);
    expect(filterTrades(book, { outcome: "loss", direction: "long" }).map((t) => t.pnl)).toEqual([-50]);
  });

  it("finds a session by its ref, id or name", () => {
    expect(matchSession(book, "xyz789")).toBe("cmsessionxyz789");
    expect(matchSession(book, "Gold scalps")).toBe("cmsessionxyz789");
    expect(filterTrades(book, { session: "abc123" }).length).toBe(3);
    expect(filterTrades(book, { session: "missing" })).toEqual([]);
  });

  it("groups weekdays in calendar order and other groupings worst first", () => {
    expect(groupTrades(book, "weekday").map((row) => [row.group, row.net])).toEqual([["Monday", 100], ["Tuesday", -50], ["Friday", 40]]);
    expect(groupTrades(book, "symbol").map((row) => row.group)).toEqual(["GBP/USD", "EUR/USD", "XAU/USD"]);
  });

  it("shows what skipping some trades would have changed", () => {
    const result = compareWithout(book, { weekdays: ["Friday"] });
    expect(result.actual.net).toBe(90);
    expect(result.withoutSkipped.net).toBe(50);
    expect(result.skipped.trades).toBe(2);
  });

  it("writes citations the page can link", () => {
    expect(citation(book[0]!)).toMatch(/^\[#\d+@abc123\]$/);
    expect(sessionRef("cmh7X2ABCDEF")).toBe("abcdef");
  });
});
