import {
  summarisePlanTests,
  type PlanSummary,
  type PlanTest,
} from "@/lib/backtest/exit-quality";
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
    // The engine records peak and trough open P/L on every real position, so
    // the sample carries them too, otherwise the exit-quality report is blank
    // in the preview and the feature looks like it does not exist.
    maxFavorablePnl: String(Math.round(won ? pnl * (1.25 + (index % 4) * 0.22) : risk * (0.18 + (index % 3) * 0.16))),
    maxAdversePnl: String(-Math.round(won ? risk * (0.22 + (index % 4) * 0.14) : Math.abs(pnl))),
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
      confidence: 3 + (index % 3),
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

/**
 * The sample report's exit-quality counterfactual.
 *
 * A real one is worked out by walking market history the trade never saw, and
 * a synthetic trade has none — so the sample supplies plausible outcomes and
 * runs them through the same summariser the live report uses. The arithmetic a
 * visitor reads in the preview is therefore the real arithmetic; only the
 * per-trade verdicts are authored.
 *
 * Each shape uses the 2R plan the demo journals already claim, and one is a
 * stop-loss so the preview shows cutting saving money as well as costing it.
 */
const DEMO_PLAN_SHAPES = [
  { outcome: "take-profit", planR: 2, peakR: 2.3, candles: 26 },
  { outcome: "take-profit", planR: 2, peakR: 2.15, candles: 18 },
  { outcome: "stop-loss", planR: -1, peakR: 0.85, candles: 11 },
  { outcome: "unresolved", planR: 1.3, peakR: 1.6, candles: 64 },
] as const;

export const DEMO_EXIT_QUALITY: PlanSummary = summarisePlanTests(
  DEMO_ANALYTICS_TRADES.filter((trade) => trade.exitReason === "manual").map(
    (trade, index): PlanTest => {
      const shape = DEMO_PLAN_SHAPES[index % DEMO_PLAN_SHAPES.length]!;
      const risk = Number(trade.initialRiskAmount);
      const capturedR = Number(trade.pnl) / risk;
      // The plan's window contains the holding period, so its peak can never
      // be lower than the peak the trade reached while it was open.
      const heldPeakR = Number(trade.maxFavorablePnl ?? 0) / risk;
      return {
        tradeId: trade.id,
        outcome: shape.outcome,
        planR: shape.planR,
        capturedR,
        deltaR: shape.planR - capturedR,
        peakR: Math.max(shape.peakR, heldPeakR),
        troughR:
          shape.outcome === "stop-loss"
            ? -1
            : Number(trade.maxAdversePnl ?? 0) / risk,
        candles: shape.candles,
        intrabarAmbiguous: false,
      };
    },
  ),
);
