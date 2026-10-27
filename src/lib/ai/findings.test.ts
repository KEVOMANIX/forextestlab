import { describe, expect, it } from "vitest";

import { buildFindings, type FindingTrade } from "./findings";

// Monday 14 October 2024, 10:00 New York (London session runs 03:00 to 08:00, New York 08:00 to 17:00).
const MONDAY_NY = Date.UTC(2024, 9, 14, 14, 0);
const DAY = 86_400_000;

function trade(symbol: string, pnl: number, entryTime = MONDAY_NY): FindingTrade {
  return { symbol, pnl, entryTime };
}

describe("AI Analyst findings", () => {
  it("stays quiet with too few trades to see a pattern", () => {
    expect(buildFindings([trade("EUR/USD", -10), trade("EUR/USD", 20)])).toEqual([]);
  });

  it("names the costliest group, the best group and the win/loss balance", () => {
    const findings = buildFindings([
      trade("EUR/USD", -100), trade("EUR/USD", -120), trade("EUR/USD", 30),
      trade("XAU/USD", 80, MONDAY_NY + DAY), trade("XAU/USD", 90, MONDAY_NY + DAY), trade("XAU/USD", 70, MONDAY_NY + DAY),
    ]);
    expect(findings.map((finding) => finding.kind)).toEqual(["leak", "strength", "habit"]);
    expect(findings[0]).toMatchObject({ title: "EUR/USD trades cost you $190", text: "3 trades, 1 won." });
    expect(findings[1]).toMatchObject({ title: "XAU/USD trades are working", text: "+$240 over 3 trades, 100% won." });
    expect(findings[2]).toMatchObject({ title: "Your losses outweigh your wins", text: "Average win $68, average loss $110." });
  });

  it("leaves out a leak when nothing loses money", () => {
    const findings = buildFindings([10, 20, 30, 40, 50].map((pnl) => trade("GBP/USD", pnl)));
    expect(findings.map((finding) => finding.kind)).toEqual(["strength"]);
  });
});
