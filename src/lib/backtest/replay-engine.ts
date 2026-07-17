/**
 * Framework-independent market-replay + simulated-trading engine.
 *
 * This module holds NO React and NO database code. It operates purely on an
 * EngineContext ({ state, candles }) and returns new state, so it can be:
 *   - driven by the browser for latency-free replay,
 *   - replayed by the server when synchronising a checkpoint,
 *   - and unit-tested in isolation.
 *
 * Both environments use the same candle-by-candle execution rules.
 */

import { Decimal, d, money } from "@/lib/decimal";
import type { Candle } from "@/lib/market-data/types";
import { pipValuePerLot } from "./position-sizing";
import { calculatePositionSize } from "./position-sizing";
import {
  checkStopTakeProfit,
  commissionForLots,
  computePnl,
  entryFillPrice,
  exitFillPrice,
} from "./execution";
import type {
  ClosedTrade,
  EngineContext,
  ExitReason,
  OpenPosition,
  OrderRequest,
  ReplaySpeed,
  PublicSessionState,
  SessionConfig,
  SessionState,
} from "./types";
import { DEFAULT_REPLAY_SPEED } from "./types";

/** Convert persisted/public state into a mutable replay state for local playback. */
export function engineStateFromPublic(state: PublicSessionState): SessionState {
  const engine = structuredClone(state) as unknown as Record<string, unknown>;
  delete engine.currentPrice;
  delete engine.currentTime;
  delete engine.anonymous;
  return normalizeSessionState(engine as unknown as SessionState);
}

/** Upgrade states saved before multi-position support without invalidating sessions. */
export function normalizeSessionState(state: SessionState): SessionState {
  const legacy = state as SessionState & { openPosition?: OpenPosition | null };
  if (!Array.isArray(state.openPositions)) {
    state.openPositions = legacy.openPosition ? [legacy.openPosition] : [];
  }
  delete legacy.openPosition;
  return state;
}

/** Build the browser-safe view of an engine state. */
export function publicSessionState(
  ctx: EngineContext,
  anonymous = false,
): PublicSessionState {
  const candle = currentCandle(ctx);
  return {
    ...structuredClone(ctx.state),
    currentPrice: candle?.close ?? null,
    currentTime: candle?.timestamp ?? null,
    anonymous,
  };
}

let counter = 0;
/** Deterministic-enough id for positions/trades within a process. */
function makeId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

export function currentCandle(ctx: EngineContext): Candle | null {
  const { state, candles } = ctx;
  if (state.visibleIndex < 0 || state.visibleIndex >= candles.length) {
    return null;
  }
  return candles[state.visibleIndex] ?? null;
}

function pipValueAccountPerLot(config: SessionConfig, price: string): string {
  return pipValuePerLot({
    pipSize: config.pipSize,
    quoteCurrency: config.quoteCurrency,
    accountCurrency: config.accountCurrency,
    baseCurrency: config.baseCurrency,
    price,
    symbol: config.symbol,
  }).value;
}

/** Create the initial session state with the opening candles already revealed. */
export function createSessionState(
  sessionId: string,
  config: SessionConfig,
  totalCandles: number,
  candles: Candle[],
  dataSource: string,
  demoData: boolean,
): SessionState {
  const initialIndex = Math.min(
    Math.max(config.initialVisibleCount - 1, 0),
    totalCandles - 1,
  );
  const startCandle = candles[initialIndex];
  const balance = money(config.startingBalance);

  const state: SessionState = {
    sessionId,
    config,
    status: "idle",
    speed: DEFAULT_REPLAY_SPEED,
    visibleIndex: initialIndex,
    totalCandles,
    balance,
    equity: balance,
    maxEquity: balance,
    maxDrawdown: "0.00",
    maxDrawdownPercent: "0.0",
    openPositions: [],
    closedTrades: [],
    equityCurve: startCandle
      ? [
          {
            index: initialIndex,
            time: startCandle.timestamp,
            balance,
            equity: balance,
          },
        ]
      : [],
    lockedBeforeIndex: 0,
    dataSource,
    demoData,
  };
  return state;
}

/** Unrealised P&L of one open position at the current candle. */
function unrealizedPnl(ctx: EngineContext, pos: OpenPosition): string {
  const { state } = ctx;
  const candle = currentCandle(ctx);
  if (!candle) return "0.00";
  const exit = exitFillPrice(
    pos.direction,
    candle,
    state.config.spreadPips,
    state.config.pipSize,
  ).toString();
  const { pnl } = computePnl({
    direction: pos.direction,
    entryPrice: pos.entryPrice,
    exitPrice: exit,
    lots: pos.lots,
    pipSize: state.config.pipSize,
    pipValueAccountPerLot: pipValueAccountPerLot(state.config, exit),
    commission: pos.commission,
  });
  return pnl;
}

/** Recompute equity, running peak, and drawdown; append an equity-curve point. */
function recomputeEquity(ctx: EngineContext, record: boolean): void {
  const { state } = ctx;
  const candle = currentCandle(ctx);
  let unreal = d(0);
  for (const position of state.openPositions) {
    position.unrealizedPnl = unrealizedPnl(ctx, position);
    unreal = unreal.plus(position.unrealizedPnl);
  }
  const equity = d(state.balance).plus(unreal);
  state.equity = equity.toFixed(2);

  const maxEquity = Decimal.max(d(state.maxEquity), equity);
  state.maxEquity = maxEquity.toFixed(2);

  const drawdown = maxEquity.minus(equity);
  if (drawdown.greaterThan(state.maxDrawdown)) {
    state.maxDrawdown = drawdown.toFixed(2);
    state.maxDrawdownPercent = maxEquity.isZero()
      ? "0.0"
      : drawdown.dividedBy(maxEquity).times(100).toFixed(1);
  }

  if (record && candle) {
    state.equityCurve.push({
      index: state.visibleIndex,
      time: candle.timestamp,
      balance: state.balance,
      equity: state.equity,
    });
  }
}

/** Close the open position at a specific price for a specific reason. */
function closeAt(
  ctx: EngineContext,
  positionId: string,
  exitPrice: string,
  reason: ExitReason,
  intrabarAmbiguous: boolean,
  requestedLots?: string,
): void {
  const { state } = ctx;
  const pos = state.openPositions.find((position) => position.id === positionId);
  const candle = currentCandle(ctx);
  if (!pos || !candle) return;

  const closeLots = requestedLots
    ? Decimal.min(d(requestedLots), d(pos.lots))
    : d(pos.lots);
  if (closeLots.lessThanOrEqualTo(0)) return;
  const closingAll = closeLots.greaterThanOrEqualTo(pos.lots);
  const commission = d(pos.commission)
    .times(closeLots)
    .dividedBy(pos.lots)
    .toFixed(2);

  const { pnl, pips } = computePnl({
    direction: pos.direction,
    entryPrice: pos.entryPrice,
    exitPrice,
    lots: closeLots.toString(),
    pipSize: state.config.pipSize,
    pipValueAccountPerLot: pipValueAccountPerLot(state.config, exitPrice),
    commission,
  });

  const trade: ClosedTrade = {
    id: makeId("trade"),
    direction: pos.direction,
    entryPrice: pos.entryPrice,
    exitPrice: money(exitPrice) === "NaN" ? exitPrice : d(exitPrice).toFixed(state.config.pricePrecision),
    entryTime: pos.entryTime,
    exitTime: candle.timestamp,
    entryIndex: pos.entryIndex,
    exitIndex: state.visibleIndex,
    lots: closeLots.toString(),
    stopLoss: pos.stopLoss,
    takeProfit: pos.takeProfit,
    commission,
    pnl,
    pips,
    exitReason: reason,
    intrabarAmbiguous,
  };

  state.balance = d(state.balance).plus(pnl).toFixed(2);
  state.closedTrades.push(trade);
  if (closingAll) {
    state.openPositions = state.openPositions.filter((position) => position.id !== pos.id);
  } else {
    pos.lots = d(pos.lots).minus(closeLots).toString();
    pos.commission = d(pos.commission).minus(commission).toFixed(2);
  }
}

/**
 * Reveal the next candle. Processes stop-loss / take-profit against the newly
 * revealed candle BEFORE the user can act on it, then updates equity.
 * Returns false when already at the end of the series.
 */
export function revealNext(ctx: EngineContext): boolean {
  const { state, candles } = ctx;
  if (state.visibleIndex >= state.totalCandles - 1) {
    // End of data: close any open position at the final candle, mark finished.
    for (const position of [...state.openPositions]) {
      const candle = currentCandle(ctx);
      if (candle) {
        const price = exitFillPrice(
          position.direction,
          candle,
          state.config.spreadPips,
          state.config.pipSize,
        ).toString();
        closeAt(ctx, position.id, price, "session-end", false);
      }
    }
    state.status = "finished";
    recomputeEquity(ctx, false);
    return false;
  }

  state.visibleIndex += 1;
  const candle = candles[state.visibleIndex];

  if (candle) {
    for (const position of [...state.openPositions]) {
      const hit = checkStopTakeProfit(
        position.direction,
        position.stopLoss,
        position.takeProfit,
        candle,
        state.config.spreadPips,
        state.config.pipSize,
        state.config.executionPolicy,
      );
      if (hit) {
        closeAt(ctx, position.id, hit.price, hit.reason, hit.intrabarAmbiguous);
      }
    }
  }

  recomputeEquity(ctx, true);
  return true;
}

/**
 * Step one candle backwards. Only permitted before any trade has been placed
 * (no closed trades, no open position) and not before the initial visible set.
 */
export function stepBack(ctx: EngineContext): boolean {
  const { state } = ctx;
  const floor = Math.max(state.config.initialVisibleCount - 1, 0);
  const canStep =
    state.closedTrades.length === 0 &&
    state.openPositions.length === 0 &&
    state.visibleIndex > floor &&
    state.visibleIndex > state.lockedBeforeIndex;
  if (!canStep) return false;
  state.visibleIndex -= 1;
  state.equityCurve = state.equityCurve.filter(
    (p) => p.index <= state.visibleIndex,
  );
  recomputeEquity(ctx, false);
  return true;
}

export function setStatus(
  ctx: EngineContext,
  status: SessionState["status"],
): void {
  if (ctx.state.status === "finished") return;
  ctx.state.status = status;
}

export function setSpeed(ctx: EngineContext, speed: ReplaySpeed): void {
  ctx.state.speed = speed;
}

/** Restart the session back to the opening candles, clearing all trades. */
export function restart(ctx: EngineContext): void {
  const { state } = ctx;
  const fresh = createSessionState(
    state.sessionId,
    state.config,
    state.totalCandles,
    ctx.candles,
    state.dataSource,
    state.demoData,
  );
  ctx.state = fresh;
}

export interface PlaceOrderResult {
  ok: boolean;
  error?: string;
}

export interface PositionPreviewResult extends PlaceOrderResult {
  position?: OpenPosition;
}

/** Build the exact server fill immediately for optimistic client feedback. */
export function previewPosition(
  state: Pick<SessionState, "config" | "balance" | "visibleIndex">,
  candle: Candle,
  req: OrderRequest,
  id = "pending-position",
): PositionPreviewResult {
  const entry = entryFillPrice(
    req.direction,
    candle,
    state.config.spreadPips,
    state.config.pipSize,
    state.config.slippagePips,
  ).toFixed(state.config.pricePrecision);
  const entryDecimal = d(entry);
  const temporaryStopDistance = d(state.config.pipSize).times(20);
  const temporaryTargetDistance = d(state.config.pipSize).times(40);
  const stopLoss =
    req.stopLoss ??
    (req.direction === "long"
      ? entryDecimal.minus(temporaryStopDistance)
      : entryDecimal.plus(temporaryStopDistance)
    ).toFixed(state.config.pricePrecision);
  const takeProfit =
    req.takeProfit ??
    (req.direction === "long"
      ? entryDecimal.plus(temporaryTargetDistance)
      : entryDecimal.minus(temporaryTargetDistance)
    ).toFixed(state.config.pricePrecision);

  const sizing = calculatePositionSize({
    accountBalance: state.balance,
    accountCurrency: state.config.accountCurrency,
    riskPercent: req.riskPercent,
    entryPrice: entry,
    stopLoss,
    pipSize: state.config.pipSize,
    symbol: state.config.symbol,
    quoteCurrency: state.config.quoteCurrency,
    baseCurrency: state.config.baseCurrency,
    fixedLots: req.sizingMode === "fixed-lots" ? req.lots : undefined,
  });

  const lots = sizing.lots;
  if (d(lots).lessThanOrEqualTo(0)) {
    return { ok: false, error: "Calculated position size is zero." };
  }

  return {
    ok: true,
    position: {
      id,
      direction: req.direction,
      entryPrice: entry,
      entryIndex: state.visibleIndex,
      entryTime: candle.timestamp,
      lots,
      stopLoss,
      takeProfit,
      commission: commissionForLots(state.config.commissionPerLot, lots),
      unrealizedPnl: "0.00",
    },
  };
}

/** Open a simulated position. Multiple independent positions are supported. */
export function placeOrder(
  ctx: EngineContext,
  req: OrderRequest,
): PlaceOrderResult {
  const { state } = ctx;
  if (state.status === "finished") {
    return { ok: false, error: "Session has finished." };
  }
  const candle = currentCandle(ctx);
  if (!candle) return { ok: false, error: "No current candle." };

  const preview = previewPosition(state, candle, req, makeId("pos"));
  if (!preview.ok || !preview.position) return preview;
  state.openPositions.push(preview.position);
  state.lockedBeforeIndex = state.visibleIndex;
  recomputeEquity(ctx, false);
  return { ok: true };
}

export function modifyStopLoss(
  ctx: EngineContext,
  price: string | null,
  positionId?: string,
): PlaceOrderResult {
  const position = positionId
    ? ctx.state.openPositions.find((item) => item.id === positionId)
    : ctx.state.openPositions[0];
  if (!position) {
    return { ok: false, error: "No open position." };
  }
  position.stopLoss = price;
  recomputeEquity(ctx, false);
  return { ok: true };
}

export function modifyTakeProfit(
  ctx: EngineContext,
  price: string | null,
  positionId?: string,
): PlaceOrderResult {
  const position = positionId
    ? ctx.state.openPositions.find((item) => item.id === positionId)
    : ctx.state.openPositions[0];
  if (!position) {
    return { ok: false, error: "No open position." };
  }
  position.takeProfit = price;
  recomputeEquity(ctx, false);
  return { ok: true };
}

/** Manually close all or part of a position at the current candle. */
export function closePosition(
  ctx: EngineContext,
  positionId?: string,
  lots?: string,
): PlaceOrderResult {
  const { state } = ctx;
  const position = positionId
    ? state.openPositions.find((item) => item.id === positionId)
    : state.openPositions[0];
  if (!position) return { ok: false, error: "No open position." };
  const candle = currentCandle(ctx);
  if (!candle) return { ok: false, error: "No current candle." };
  const price = exitFillPrice(
    position.direction,
    candle,
    state.config.spreadPips,
    state.config.pipSize,
  ).toFixed(state.config.pricePrecision);
  closeAt(ctx, position.id, price, "manual", false, lots);
  recomputeEquity(ctx, false);
  return { ok: true };
}
