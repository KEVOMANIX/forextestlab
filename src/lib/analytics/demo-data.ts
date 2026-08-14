import type { ClosedTrade, EquityPoint } from "@/lib/backtest/types";

export const DEMO_ANALYTICS_START = Date.UTC(2025, 1, 3, 13, 0);
export const DEMO_ANALYTICS_PNLS = [541, 260, -444, -930, -584, 304, 557, -1492, 362, -71, 522, 620, -125, 740, 410, -280, 860, 1240, 2330] as const;

const setupTags = ["London breakout", "Opening range", "Liquidity sweep", "NY reversal"];
const emotions = ["Focused", "Patient", "Confident", "Neutral"];

export const DEMO_ANALYTICS_TRADES: ClosedTrade[] = DEMO_ANALYTICS_PNLS.map((pnl, index) => {
  const entryHoursUtc = [7, 10, 14, 22] as const;
  const entryTime = Date.UTC(2025, 1, 3 + index, entryHoursUtc[index % entryHoursUtc.length]);
  const won = pnl > 0;
  const setup = setupTags[index % setupTags.length]!;
  const risk = 500;
  return {
    id: `demo-trade-${index + 1}`,
    journalId: `demo-journal-${index + 1}`,
    direction: index % 3 === 1 ? "short" : "long",
    entryPrice: (1.082 + index * 0.0004).toFixed(5),
    exitPrice: (1.082 + index * 0.0004 + (won ? 0.0012 : -0.0008)).toFixed(5),
    entryTime,
    exitTime: entryTime + (1 + index % 5) * 3_600_000,
    entryIndex: index * 100,
    exitIndex: index * 100 + 12,
    lots: index % 4 === 0 ? "1.20" : index % 3 === 0 ? "0.80" : "0.40",
    stopLoss: "1.07800",
    takeProfit: "1.08800",
    initialStopLoss: "1.07800",
    initialTakeProfit: "1.08800",
    initialRiskAmount: String(risk),
    commission: "7.00",
    pnl: String(pnl),
    pips: String((pnl / 10).toFixed(1)),
    exitReason: pnl > 500 ? "take-profit" : pnl < 0 ? "stop-loss" : "manual",
    intrabarAmbiguous: false,
    notes: won ? "Entry followed the plan and momentum confirmed." : "Review entry timing and confirmation quality.",
    journal: {
      entryReason: `${setup}: structure aligned with the session plan and price confirmed the entry zone.`,
      exitReview: won ? "Managed according to plan. No early intervention was needed." : "The setup invalidated cleanly. The loss stayed inside the planned risk.",
      setupTags: [setup, index % 2 === 0 ? "A-grade" : "Session setup"],
      mistakeTags: won ? [] : index % 2 === 0 ? ["Entered early"] : ["Weak confirmation"],
      emotion: emotions[index % emotions.length]!,
      confidence: 7 + index % 3,
      ruleChecklist: [
        { id: `trend-${index}`, label: "Higher-timeframe direction confirmed", followed: true },
        { id: `risk-${index}`, label: "Risk defined before entry", followed: true },
        { id: `trigger-${index}`, label: "Waited for entry trigger", followed: won || index % 2 === 1 },
      ],
      plannedRR: "2.00",
      realizedR: (pnl / risk).toFixed(2),
      validity: won || index % 2 === 1 ? "valid" : "experimental",
      beforeEntrySnapshot: null,
      afterExitSnapshot: null,
      updatedAt: entryTime + 6 * 3_600_000,
    },
  };
});

export const DEMO_ANALYTICS_EQUITY_CURVE: EquityPoint[] = DEMO_ANALYTICS_TRADES.reduce<EquityPoint[]>((points, trade, index) => {
  const previous = Number(points[points.length - 1]?.balance ?? 100000);
  const balance = previous + Number(trade.pnl);
  points.push({ index: index + 1, time: trade.exitTime, balance: String(balance), equity: String(balance) });
  return points;
}, [{ index: 0, time: DEMO_ANALYTICS_START, balance: "100000", equity: "100000" }]);
