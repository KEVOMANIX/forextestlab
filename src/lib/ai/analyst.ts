import "server-only";

import { toClosedTrade, toEquityPoint } from "@/lib/ai/context";
import type { PortfolioSessionRow } from "@/lib/ai/portfolio";
import { computeStatistics } from "@/lib/backtest/statistics";
import { formatNewYorkDate } from "@/lib/date-time";
import { Decimal } from "@/lib/decimal";
import { formatSymbol, getSymbolDefinition, marketCategory } from "@/lib/market-data/symbols";

/** One saved session as a card on the AI Analyst welcome screen. */
export interface AnalystSessionCard {
  id: string;
  name: string;
  market: string;
  category: ReturnType<typeof marketCategory> | null;
  timeframe: string;
  period: string;
  /** Realised return on everything the trader funded, in percent. */
  returnPercent: number;
  profitFactor: string;
  maxDrawdownPercent: string;
  trades: number;
  /** Equity at evenly spaced points, oldest first. */
  curve: number[];
}

const CURVE_POINTS = 48;

function sample(values: number[], points = CURVE_POINTS): number[] {
  if (values.length <= points) return values;
  return Array.from({ length: points }, (_, index) => values[Math.round((index * (values.length - 1)) / (points - 1))]!);
}

export function analystSessionCard(session: PortfolioSessionRow): AnalystSessionCard {
  const trades = session.trades.filter((trade) => trade.validity !== "experimental").map(toClosedTrade);
  const funded = new Decimal(session.startingBalance).plus(session.depositedFunds ?? 0);
  const net = trades.reduce((sum, trade) => sum.plus(trade.pnl), new Decimal(0));
  const curveSource = trades.length === session.trades.length ? session.equitySnapshots.map(toEquityPoint) : [];
  const stats = computeStatistics({ startingBalance: funded.toFixed(2), endingBalance: funded.plus(net).toFixed(2), trades, equityCurve: curveSource });
  // Without a usable equity history, the closed trades still draw the curve.
  let running = funded.toNumber();
  const curve = curveSource.length > 1
    ? curveSource.map((point) => Number(point.equity))
    : [running, ...trades.map((trade) => (running += Number(trade.pnl)))];
  const definition = getSymbolDefinition(session.symbol);
  const markets = session.symbols.length ? session.symbols : [session.symbol];
  return {
    id: session.id,
    name: session.name,
    market: markets.map(formatSymbol).join(", "),
    category: definition ? marketCategory(definition) : null,
    timeframe: session.timeframe,
    period: `${formatNewYorkDate(Number(session.startTime))} to ${formatNewYorkDate(Number(session.endTime))}`,
    returnPercent: funded.isZero() ? 0 : net.dividedBy(funded).times(100).toNumber(),
    profitFactor: stats.profitFactor,
    maxDrawdownPercent: stats.maxDrawdownPercent,
    trades: trades.length,
    curve: sample(curve),
  };
}
