/**
 * Domain types for the framework-independent backtest engine.
 *
 * Everything here is plain data (no React, no Prisma) so the engine can be
 * unit-tested in isolation and reused on the server.
 */

import type { Candle, Timeframe } from "@/lib/market-data/types";

export type TradeDirection = "long" | "short";

export type ReplayStatus = "idle" | "running" | "paused" | "finished";

export type ReplaySpeed = 0.5 | 1 | 2 | 5 | 10;

export const REPLAY_SPEEDS: ReplaySpeed[] = [0.5, 1, 2, 5, 10];

/**
 * How to resolve the case where a single candle's range touches both the
 * stop-loss and the take-profit (candle data cannot tell which came first).
 */
export type ExecutionPolicy = "conservative" | "optimistic";

export type ExitReason =
  | "stop-loss"
  | "take-profit"
  | "manual"
  | "session-end";

export type PositionSizingMode = "fixed-lots" | "risk-percent";

/** Immutable configuration chosen when a session is created. */
export interface SessionConfig {
  /** User-facing label for identifying a saved testing session. */
  name?: string;
  /** All pairs selected for this session. The first is the initial active chart. */
  symbols?: string[];
  /** Optional user-defined strategy labels for organization and search. */
  tags?: string[];
  /** Archived sessions are hidden from the default recent-session view. */
  archived?: boolean;
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  startingBalance: string;
  accountCurrency: string;
  /** Simulated spread in pips applied when only midpoint OHLC is available. */
  spreadPips: string;
  commissionPerLot: string;
  slippagePips: string;
  executionPolicy: ExecutionPolicy;
  pipSize: string;
  pricePrecision: number;
  /** Number of candles shown before replay begins. */
  initialVisibleCount: number;
}

export interface OrderRequest {
  direction: TradeDirection;
  sizingMode: PositionSizingMode;
  /** Used when sizingMode === "fixed-lots". */
  lots?: string;
  /** Used when sizingMode === "risk-percent". */
  riskPercent?: string;
  stopLoss?: string;
  takeProfit?: string;
}

export interface OpenPosition {
  id: string;
  direction: TradeDirection;
  /** Fill price after spread/slippage. */
  entryPrice: string;
  /** Candle index at which the position was opened. */
  entryIndex: number;
  entryTime: number;
  lots: string;
  stopLoss: string | null;
  takeProfit: string | null;
  commission: string;
  /** Unrealised P&L at the current candle, in account currency. */
  unrealizedPnl: string;
}

export interface ClosedTrade {
  id: string;
  direction: TradeDirection;
  entryPrice: string;
  exitPrice: string;
  entryTime: number;
  exitTime: number;
  entryIndex: number;
  exitIndex: number;
  lots: string;
  stopLoss: string | null;
  takeProfit: string | null;
  commission: string;
  /** Realised profit/loss net of commission, in account currency. */
  pnl: string;
  pips: string;
  exitReason: ExitReason;
  /** True when SL and TP were both touched in the exit candle. */
  intrabarAmbiguous: boolean;
  notes?: string;
}

export interface EquityPoint {
  index: number;
  time: number;
  balance: string;
  equity: string;
}

/** Full engine state. Serialisable — safe to persist and to sanitise. */
export interface SessionState {
  sessionId: string;
  config: SessionConfig;
  status: ReplayStatus;
  speed: ReplaySpeed;
  /** Index of the last revealed candle (inclusive). -1 before start. */
  visibleIndex: number;
  totalCandles: number;
  balance: string;
  equity: string;
  maxEquity: string;
  maxDrawdown: string;
  maxDrawdownPercent: string;
  openPosition: OpenPosition | null;
  closedTrades: ClosedTrade[];
  equityCurve: EquityPoint[];
  /** Index after which stepping backwards is disallowed (a trade was placed). */
  lockedBeforeIndex: number;
  dataSource: string;
  demoData: boolean;
}

/** The subset of engine state that is safe to send to the browser. */
export interface PublicSessionState {
  sessionId: string;
  config: SessionConfig;
  status: ReplayStatus;
  speed: ReplaySpeed;
  visibleIndex: number;
  totalCandles: number;
  balance: string;
  equity: string;
  maxDrawdown: string;
  maxDrawdownPercent: string;
  currentPrice: string | null;
  currentTime: number | null;
  openPosition: OpenPosition | null;
  closedTrades: ClosedTrade[];
  equityCurve: EquityPoint[];
  lockedBeforeIndex: number;
  dataSource: string;
  demoData: boolean;
  /** Anonymous demonstrations are temporary and are not saved to user history. */
  anonymous: boolean;
}

/** Engine + candle series bundled for server-side stepping. */
export interface EngineContext {
  state: SessionState;
  candles: Candle[];
}
