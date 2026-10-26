import type { ClosedTrade, EquityPoint, SessionState } from "@/lib/backtest/types";
import { Decimal } from "@/lib/decimal";
import { analyticsTrades } from "./trade-scope";

export interface AnalyticsShareSnapshot {
  sessionName: string;
  symbols: string[];
  startTime: number;
  endTime: number;
  startingBalance: string;
  endingBalance?: string;
  accountCurrency: string;
  trades: ClosedTrade[];
  equityCurve: EquityPoint[];
}

/** Explicit allowlist: never serialize the session, journal, notes or real IDs. */
export function createShareSnapshot(state: SessionState, startingBalance: string): AnalyticsShareSnapshot {
  const included = analyticsTrades(state.closedTrades);
  const trades: ClosedTrade[] = included.map((t, i) => ({
    id: `trade-${i + 1}`, symbol: t.symbol ?? state.config.symbol,
    direction: t.direction, entryPrice: t.entryPrice, exitPrice: t.exitPrice,
    entryTime: t.entryTime, exitTime: t.exitTime, entryIndex: t.entryIndex, exitIndex: t.exitIndex,
    lots: t.lots, stopLoss: t.stopLoss, takeProfit: t.takeProfit,
    initialStopLoss: t.initialStopLoss, initialTakeProfit: t.initialTakeProfit,
    initialRiskAmount: t.initialRiskAmount, maxFavorablePnl: t.maxFavorablePnl,
    maxAdversePnl: t.maxAdversePnl, commission: t.commission, pnl: t.pnl, pips: t.pips,
    exitReason: t.exitReason, intrabarAmbiguous: t.intrabarAmbiguous,
  }));
  const excluded = included.length !== state.closedTrades.length;
  return {
    sessionName: "Shared performance report",
    symbols: [...new Set([state.config.symbol, ...trades.map(t => t.symbol!)])],
    startTime: state.config.startTime, endTime: state.config.endTime,
    startingBalance,
    endingBalance: excluded ? trades.reduce((sum, t) => sum.plus(t.pnl), new Decimal(startingBalance)).toFixed(2) : state.balance,
    accountCurrency: state.config.accountCurrency,
    trades,
    equityCurve: excluded ? [] : state.equityCurve.map(p => ({ index: p.index, time: p.time, balance: p.balance, equity: p.equity })),
  };
}
