/**
 * Domain types for the framework-independent backtest engine.
 *
 * Everything here is plain data (no React, no Prisma) so the engine can be
 * unit-tested in isolation and reused on the server.
 */

import type { Candle, Timeframe } from "@/lib/market-data/types";

export type TradeDirection = "long" | "short";

export type ReplayStatus = "idle" | "running" | "paused" | "finished";

/** Market-time multiplier. At 60x, one 1-minute candle appears each second. */
export type ReplaySpeed =
  | 15
  | 30
  | 60
  | 120
  | 300
  | 600
  | 900
  | 1200
  | 1800
  | 3600
  | 7200;

export const REPLAY_SPEEDS: ReplaySpeed[] = [
  15, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600, 7200,
];
export const DEFAULT_REPLAY_SPEED: ReplaySpeed = 60;
export const REPLAY_STEP_MINUTES = [1, 5, 15, 30, 60, 240] as const;
export type ReplayStepMinutes = (typeof REPLAY_STEP_MINUTES)[number];

export function normalizeReplaySpeed(value: number): ReplaySpeed {
  if (REPLAY_SPEEDS.includes(value as ReplaySpeed)) return value as ReplaySpeed;
  // Sessions created before real-time multipliers used candles-per-second.
  const migrated = value < 15 ? value * 60 : value;
  return REPLAY_SPEEDS.reduce((closest, candidate) =>
    Math.abs(candidate - migrated) < Math.abs(closest - migrated)
      ? candidate
      : closest,
  DEFAULT_REPLAY_SPEED);
}

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
export type OrderType = "market" | "limit" | "stop";
export type PendingOrderType = Exclude<OrderType, "market">;
export type PendingOrderStatus = "pending" | "activated" | "cancelled" | "expired";
export type TradeValidity = "valid" | "invalid" | "experimental";

export interface JournalRule {
  id: string;
  label: string;
  followed: boolean;
}

export interface SnapshotCandle {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
}

export interface TradeChartSnapshot {
  capturedAt: number;
  index: number;
  symbol: string;
  timeframe: Timeframe;
  candles: SnapshotCandle[];
}

export interface TradeJournal {
  entryReason: string;
  exitReview: string;
  setupTags: string[];
  mistakeTags: string[];
  emotion: string;
  confidence: number | null;
  ruleChecklist: JournalRule[];
  plannedRR: string | null;
  realizedR: string | null;
  validity: TradeValidity;
  beforeEntrySnapshot: TradeChartSnapshot | null;
  afterExitSnapshot: TradeChartSnapshot | null;
  updatedAt: number;
}

export interface TradeJournalUpdate {
  entryReason: string;
  exitReview: string;
  setupTags: string[];
  mistakeTags: string[];
  emotion: string;
  confidence: number | null;
  ruleChecklist: JournalRule[];
  validity: TradeValidity;
}

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
  /**
   * Account leverage as the ratio's second term ("100" = 1:100), used to report
   * margin held against open positions. Absent on sessions created before the
   * setting existed; readers fall back to DEFAULT_LEVERAGE.
   */
  leverage?: string;
}

export interface OrderRequest {
  /** Shared by optimistic browser execution and the server checkpoint. */
  clientOrderId?: string;
  direction: TradeDirection;
  orderType?: OrderType;
  /** Required for limit and stop orders. */
  entryPrice?: string;
  /** Market timestamp after which an unfilled order expires. */
  expiresAt?: number;
  sizingMode: PositionSizingMode;
  /** Used when sizingMode === "fixed-lots". */
  lots?: string;
  /** Used when sizingMode === "risk-percent". */
  riskPercent?: string;
  stopLoss?: string;
  takeProfit?: string;
}

export interface PendingOrder {
  id: string;
  direction: TradeDirection;
  orderType: PendingOrderType;
  entryPrice: string;
  sizingMode: PositionSizingMode;
  lots: string;
  riskPercent?: string;
  stopLoss: string | null;
  takeProfit: string | null;
  expiresAt: number | null;
  status: PendingOrderStatus;
  createdIndex: number;
  createdTime: number;
  updatedTime: number;
  activatedTime: number | null;
  cancelledTime: number | null;
  expiredTime: number | null;
  fillPrice: string | null;
  activatedPositionId: string | null;
}

export interface OpenPosition {
  id: string;
  journalId?: string;
  journal?: TradeJournal;
  direction: TradeDirection;
  /** Fill price after spread/slippage. */
  entryPrice: string;
  /** Candle index at which the position was opened. */
  entryIndex: number;
  entryTime: number;
  lots: string;
  stopLoss: string | null;
  takeProfit: string | null;
  /** Protection captured at entry for realised risk/reward analytics. */
  initialStopLoss?: string | null;
  initialTakeProfit?: string | null;
  initialRiskAmount?: string | null;
  /** Optional candle-close trailing distance and best executable price seen. */
  trailingStopPips?: string | null;
  trailingBestPrice?: string | null;
  /** Best and worst marked-to-market P&L observed while the position was open. */
  maxFavorablePnl?: string;
  maxAdversePnl?: string;
  commission: string;
  /** Unrealised P&L at the current candle, in account currency. */
  unrealizedPnl: string;
}

export interface ClosedTrade {
  id: string;
  journalId?: string;
  journal?: TradeJournal;
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
  initialStopLoss?: string | null;
  initialTakeProfit?: string | null;
  initialRiskAmount?: string | null;
  maxFavorablePnl?: string;
  maxAdversePnl?: string;
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

export interface SessionBookmark {
  id: string;
  index: number;
  time: number;
  note: string;
  createdAt: number;
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
  openPositions: OpenPosition[];
  pendingOrders: PendingOrder[];
  bookmarks: SessionBookmark[];
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
  maxEquity: string;
  maxDrawdown: string;
  maxDrawdownPercent: string;
  currentPrice: string | null;
  currentTime: number | null;
  openPositions: OpenPosition[];
  pendingOrders: PendingOrder[];
  bookmarks: SessionBookmark[];
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
