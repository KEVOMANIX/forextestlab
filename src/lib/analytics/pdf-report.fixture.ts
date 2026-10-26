import type { AnalyticsModel } from "@/components/app/AnalyticsDesignPrototype";

/** Deterministic document-layout fixture, never used by the application. */
export const pdfFixtureModel: AnalyticsModel = {
  equity: [10000, 10100, 10050, 10200, 10400], balance: [10000, 10100, 10050, 10200, 10400],
  endingBalance: 10400, netProfit: 400, returnPercent: 4, winRate: "75.00", profitFactor: "9.00",
  expectancy: 100, maxDrawdown: 50, maxDrawdownPercent: .5, closedTrades: 4, averageR: "1.5", payoffRatio: "3.00",
  averageHold: "1.2h", bestTrade: 200, worstTrade: -50, streak: "2 wins", calendarMonths: [], recentTrades: [],
  monthlyReturns: [{ key: "2026-10", label: "Oct", year: 2026, month: 10, profit: 400, percent: 4 }],
  drawdown: [0, 0, -50, 0, 0], weekdays: [{ label: "Monday", value: 400, trades: 4, winRate: 75 }],
  sessions: [{ label: "London", value: 400, trades: 4, winRate: 75 }], rDistribution: [{ label: "1R to 2R", count: 4 }],
  exits: [{ label: "Take profit", value: 400, trades: 4, winRate: 75 }], sizes: [], holding: [],
  directions: { long: { label: "Long", value: 400, trades: 4, winRate: 75 }, short: { label: "Short", value: 0, trades: 0 } },
  concentration: 100, daysProcessed: 4, monthsProcessed: 1, tradingDays: 4, winningTrades: 3, losingTrades: 1,
  maxConsecutiveWins: 2, maxConsecutiveLosses: 1, tradesPerDay: 1, tradesPerMonth: 4, grossProfit: 450, grossLoss: 50,
  averageTrade: 100, averageWin: 150, averageLoss: 50, profitPerMonth: 400, maxLot: 1, recoveryFactor: 8,
};
