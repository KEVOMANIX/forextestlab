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
import {
  evaluatePropFirm,
  initialPropFirmRuntime,
  recordTradingDay,
  rollTradingDay,
} from "./prop-firm";
import { pipValuePerLot } from "./position-sizing";
import { calculatePositionSize } from "./position-sizing";
import {
  checkStopTakeProfit,
  commissionForLots,
  computePnl,
  deriveBidAsk,
  entryFillPrice,
  exitFillPrice,
} from "./execution";
import type {
  ClosedTrade,
  EngineContext,
  ExitReason,
  OpenPosition,
  PendingOrder,
  OrderRequest,
  ReplaySpeed,
  PublicSessionState,
  SessionConfig,
  SessionState,
} from "./types";
import { DEFAULT_REPLAY_SPEED } from "./types";
import {
  captureTradeSnapshot,
  createTradeJournal,
  emptyTradeJournal,
  normalizeTradeJournal,
} from "./trade-journal";

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
  state.pendingOrders ??= [];
  state.bookmarks ??= [];
  for (const position of state.openPositions) {
    position.journalId ??= position.id;
    position.journal =
      normalizeTradeJournal(position.journal) ??
      emptyTradeJournal(
        position.entryPrice,
        position.initialStopLoss ?? position.stopLoss,
        position.initialTakeProfit ?? position.takeProfit,
      );
    position.initialStopLoss ??= position.stopLoss;
    position.initialTakeProfit ??= position.takeProfit;
    position.initialRiskAmount ??= null;
    position.trailingStopPips ??= null;
    position.trailingBestPrice ??= null;
    position.maxFavorablePnl ??= "0.00";
    position.maxAdversePnl ??= "0.00";
  }
  for (const trade of state.closedTrades) {
    trade.journalId ??= trade.id;
    trade.journal =
      normalizeTradeJournal(trade.journal) ??
      emptyTradeJournal(
        trade.entryPrice,
        trade.initialStopLoss ?? trade.stopLoss,
        trade.initialTakeProfit ?? trade.takeProfit,
      );
    if (
      trade.journal.realizedR === null &&
      trade.initialRiskAmount &&
      d(trade.initialRiskAmount).greaterThan(0)
    ) {
      trade.journal.realizedR = d(trade.pnl)
        .dividedBy(trade.initialRiskAmount)
        .toFixed(2);
    }
  }
  return state;
}

/** Build the browser-safe view of an engine state. */
export function publicSessionState(
  ctx: EngineContext,
  anonymous = false,
): PublicSessionState {
  const candle = currentCandle(ctx);
  const { equityCurve, ...stateWithoutEquityCurve } = ctx.state;
  return {
    ...structuredClone(stateWithoutEquityCurve),
    // Equity points are append-only during forward replay. Copy the array so
    // React receives an immutable snapshot without deep-cloning thousands of
    // already-immutable points on every visual publication.
    equityCurve: equityCurve.slice(),
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
    pendingOrders: [],
    bookmarks: [],
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
  if (config.propFirm) {
    state.propFirm = initialPropFirmRuntime(
      balance,
      startCandle?.timestamp ?? config.startTime,
      config.propFirm,
    );
  }
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

/** Record intrabar best/worst marked-to-market outcomes for MAE/MFE analytics. */
function updateExcursion(ctx: EngineContext, pos: OpenPosition, candle: Candle): void {
  const { state } = ctx;
  const bidAsk = deriveBidAsk(candle, state.config.spreadPips, state.config.pipSize);
  const favorablePrice = pos.direction === "long" ? bidAsk.bidHigh : bidAsk.askLow;
  const adversePrice = pos.direction === "long" ? bidAsk.bidLow : bidAsk.askHigh;
  const pnlAt = (price: Decimal) => computePnl({
    direction: pos.direction,
    entryPrice: pos.entryPrice,
    exitPrice: price.toString(),
    lots: pos.lots,
    pipSize: state.config.pipSize,
    pipValueAccountPerLot: pipValueAccountPerLot(state.config, price.toString()),
    commission: pos.commission,
  }).pnl;
  pos.maxFavorablePnl = Decimal.max(d(pos.maxFavorablePnl ?? 0), d(pnlAt(favorablePrice))).toFixed(2);
  pos.maxAdversePnl = Decimal.min(d(pos.maxAdversePnl ?? 0), d(pnlAt(adversePrice))).toFixed(2);
}

/**
 * Tighten a trailing stop from the candle's executable close. Using the close
 * avoids inventing an intrabar high/low sequence that OHLC data cannot prove.
 */
function tightenTrailingStop(
  ctx: EngineContext,
  position: OpenPosition,
  candle: Candle,
): void {
  if (
    !position.trailingStopPips ||
    d(position.trailingStopPips).lessThanOrEqualTo(0)
  ) {
    return;
  }
  const reference = exitFillPrice(
    position.direction,
    candle,
    ctx.state.config.spreadPips,
    ctx.state.config.pipSize,
  );
  const previousBest = position.trailingBestPrice
    ? d(position.trailingBestPrice)
    : reference;
  const best =
    position.direction === "long"
      ? Decimal.max(previousBest, reference)
      : Decimal.min(previousBest, reference);
  const distance = d(position.trailingStopPips).times(
    ctx.state.config.pipSize,
  );
  const candidate =
    position.direction === "long"
      ? best.minus(distance)
      : best.plus(distance);
  const current = position.stopLoss ? d(position.stopLoss) : null;
  const tighter =
    !current ||
    (position.direction === "long"
      ? candidate.greaterThan(current)
      : candidate.lessThan(current));

  position.trailingBestPrice = best.toFixed(
    ctx.state.config.pricePrecision,
  );
  if (tighter) {
    position.stopLoss = candidate.toFixed(ctx.state.config.pricePrecision);
  }
}

/** Recompute equity, running peak, and drawdown; append an equity-curve point. */
function recomputeEquity(ctx: EngineContext, record: boolean): void {
  const { state } = ctx;
  const candle = currentCandle(ctx);
  let unreal = d(0);
  for (const position of state.openPositions) {
    position.unrealizedPnl = unrealizedPnl(ctx, position);
    position.maxFavorablePnl = Decimal.max(
      d(position.maxFavorablePnl ?? 0),
      d(position.unrealizedPnl),
    ).toFixed(2);
    position.maxAdversePnl = Decimal.min(
      d(position.maxAdversePnl ?? 0),
      d(position.unrealizedPnl),
    ).toFixed(2);
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
  const closeRatio = closeLots.dividedBy(pos.lots);
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
    journalId: pos.journalId ?? pos.id,
    journal: pos.journal ? structuredClone(pos.journal) : undefined,
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
    initialStopLoss: pos.initialStopLoss ?? pos.stopLoss,
    initialTakeProfit: pos.initialTakeProfit ?? pos.takeProfit,
    initialRiskAmount: pos.initialRiskAmount
      ? d(pos.initialRiskAmount).times(closeRatio).toFixed(2)
      : null,
    maxFavorablePnl: d(pos.maxFavorablePnl ?? 0).times(closeRatio).toFixed(2),
    maxAdversePnl: d(pos.maxAdversePnl ?? 0).times(closeRatio).toFixed(2),
    commission,
    pnl,
    pips,
    exitReason: reason,
    intrabarAmbiguous,
  };

  state.balance = d(state.balance).plus(pnl).toFixed(2);
  state.closedTrades.push(trade);
  // A day counts towards the minimum the moment a trade closes on it.
  if (state.config.propFirm && state.propFirm) {
    state.propFirm = recordTradingDay(
      state.propFirm,
      trade.exitTime,
      state.config.propFirm,
    );
  }
  const journalRecords = state.closedTrades.filter(
    (item) => (item.journalId ?? item.id) === trade.journalId,
  );
  const totalRisk = journalRecords.reduce(
    (sum, item) => sum.plus(item.initialRiskAmount ?? 0),
    d(0),
  );
  const totalPnl = journalRecords.reduce((sum, item) => sum.plus(item.pnl), d(0));
  const journal = trade.journal;
  if (journal) {
    if (closingAll) journal.afterExitSnapshot = captureTradeSnapshot(ctx);
    journal.realizedR = totalRisk.greaterThan(0)
      ? totalPnl.dividedBy(totalRisk).toFixed(2)
      : null;
    journal.updatedAt = Date.now();
    for (const item of journalRecords) item.journal = structuredClone(journal);
  }
  if (closingAll) {
    state.openPositions = state.openPositions.filter((position) => position.id !== pos.id);
  } else {
    const remainingRatio = d(1).minus(closeRatio);
    pos.lots = d(pos.lots).minus(closeLots).toString();
    pos.commission = d(pos.commission).minus(commission).toFixed(2);
    if (pos.initialRiskAmount) {
      pos.initialRiskAmount = d(pos.initialRiskAmount).times(remainingRatio).toFixed(2);
    }
    pos.maxFavorablePnl = d(pos.maxFavorablePnl ?? 0).times(remainingRatio).toFixed(2);
    pos.maxAdversePnl = d(pos.maxAdversePnl ?? 0).times(remainingRatio).toFixed(2);
  }
}

/**
 * End the session here: flatten everything at the current candle, expire what
 * is resting, and stop.
 *
 * Shared by running out of data and by breaching a prop-firm limit, because the
 * two have to leave the account in exactly the same shape. Keeping them as one
 * implementation is the only way that stays true as either path changes.
 */
function finishSession(ctx: EngineContext): void {
  const { state } = ctx;
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
  const finalTime = currentCandle(ctx)?.timestamp ?? state.config.endTime;
  for (const order of state.pendingOrders) {
    if (order.status !== "pending") continue;
    order.status = "expired";
    order.expiredTime = finalTime;
    order.updatedTime = finalTime;
  }
  state.status = "finished";
  recomputeEquity(ctx, false);
}

/**
 * Equity if the candle's adverse extreme had printed with the book as it stands.
 *
 * A prop firm watches a live account and closes it the moment equity crosses
 * the line, so grading on candle closes alone would pass runs that reality
 * would have failed. Every open position is marked at the worst price the
 * candle reached, in its own direction.
 */
function worstCaseEquity(ctx: EngineContext, candle: Candle): string {
  const { state } = ctx;
  const bidAsk = deriveBidAsk(candle, state.config.spreadPips, state.config.pipSize);
  let worst = d(state.balance);
  for (const position of state.openPositions) {
    const adverse =
      position.direction === "long" ? bidAsk.bidLow : bidAsk.askHigh;
    const { pnl } = computePnl({
      direction: position.direction,
      entryPrice: position.entryPrice,
      exitPrice: adverse.toString(),
      lots: position.lots,
      pipSize: state.config.pipSize,
      pipValueAccountPerLot: pipValueAccountPerLot(state.config, adverse.toString()),
      commission: position.commission,
    });
    worst = worst.plus(pnl);
  }
  return worst.toFixed(2);
}

/**
 * Open a new trading day before the candle is processed.
 *
 * The daily limit is measured from the equity carried *into* the day, so this
 * has to run while `state.equity` still holds the previous candle's close —
 * afterwards would hand the day's first candle a free pass on its own losses.
 */
function rollPropFirmDay(ctx: EngineContext, candle: Candle): void {
  const { state } = ctx;
  const rules = state.config.propFirm;
  if (!rules || !state.propFirm) return;
  state.propFirm = rollTradingDay(
    state.propFirm,
    candle.timestamp,
    state.equity,
    rules,
  );
}

/**
 * Grade the candle against the challenge rules, and end the run on a breach.
 *
 * Deliberately not folded into `recomputeEquity`: that runs on rewind, on order
 * placement and inside `closeAt`, so a breach that flattens positions would
 * re-enter it. This is called from the one place a candle is revealed.
 */
function enforcePropFirm(ctx: EngineContext, candle: Candle): void {
  const { state } = ctx;
  const rules = state.config.propFirm;
  if (!rules || !state.propFirm) return;
  if (state.propFirm.status === "breached") return;

  const next = evaluatePropFirm({
    rules,
    startingBalance: state.config.startingBalance,
    equity: state.equity,
    lowEquity: worstCaseEquity(ctx, candle),
    peakEquity: state.maxEquity,
    runtime: state.propFirm,
    at: candle.timestamp,
  });
  state.propFirm = next;
  if (next.status === "breached") finishSession(ctx);
}

/**
 * Reveal the next candle. Processes stop-loss / take-profit against the newly
 * revealed candle BEFORE the user can act on it, then updates equity.
 * Returns false when already at the end of the series.
 */
export function revealNext(ctx: EngineContext): boolean {
  const { state, candles } = ctx;
  if (state.visibleIndex >= state.totalCandles - 1) {
    finishSession(ctx);
    return false;
  }

  state.visibleIndex += 1;
  const candle = candles[state.visibleIndex];

  if (candle) {
    rollPropFirmDay(ctx, candle);
    processPendingOrders(ctx, candle);
    for (const position of [...state.openPositions]) {
      updateExcursion(ctx, position, candle);
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
      } else {
        tightenTrailingStop(ctx, position, candle);
      }
    }
  }

  recomputeEquity(ctx, true);
  if (candle) enforcePropFirm(ctx, candle);
  return true;
}

/** First candle available to the replay's previous-candle control. */
export function replayRewindFloor(state: SessionState): number {
  void state;
  return 0;
}

/**
 * Move backwards to any candle in the loaded series. Existing trading records
 * remain intact while the replay clock is reviewed.
 */
export function stepBackTo(ctx: EngineContext, targetIndex: number): boolean {
  const { state } = ctx;
  const target = Math.max(0, Math.floor(targetIndex));
  const canStep = target < state.visibleIndex;
  if (!canStep) return false;

  // Crossing back over an entry cancels that decision. This is not a market
  // close, so it must not create a closed-trade or journal record.
  const discardedTrades = state.closedTrades.filter(
    (trade) => trade.entryIndex >= target,
  );
  if (discardedTrades.length > 0) {
    const discardedPnl = discardedTrades.reduce(
      (total, trade) => total.plus(trade.pnl),
      d(0),
    );
    state.balance = d(state.balance).minus(discardedPnl).toFixed(2);
    state.closedTrades = state.closedTrades.filter(
      (trade) => trade.entryIndex < target,
    );
  }
  state.openPositions = state.openPositions.filter(
    (position) => position.entryIndex < target,
  );
  state.pendingOrders = state.pendingOrders.filter(
    (order) => order.createdIndex < target,
  );
  state.lockedBeforeIndex = Math.max(
    0,
    ...state.openPositions.map((position) => position.entryIndex),
    ...state.closedTrades.map((trade) => trade.exitIndex),
    ...state.pendingOrders.map((order) => order.createdIndex),
  );
  state.visibleIndex = target;
  state.equityCurve = state.equityCurve.filter(
    (p) => p.index <= state.visibleIndex,
  );
  // Rebuild path-dependent open-position excursion metrics through the new
  // candle. Otherwise a rewind would retain favorable/adverse values learned
  // from candles that are no longer revealed.
  const rewindIndex = state.visibleIndex;
  for (const position of state.openPositions) {
    position.maxFavorablePnl = "0.00";
    position.maxAdversePnl = "0.00";
    if (position.entryIndex > rewindIndex) continue;
    for (
      state.visibleIndex = position.entryIndex;
      state.visibleIndex <= rewindIndex;
      state.visibleIndex += 1
    ) {
      const pnl = d(unrealizedPnl(ctx, position));
      position.maxFavorablePnl = Decimal.max(
        d(position.maxFavorablePnl),
        pnl,
      ).toFixed(2);
      position.maxAdversePnl = Decimal.min(
        d(position.maxAdversePnl),
        pnl,
      ).toFixed(2);
    }
  }
  state.visibleIndex = rewindIndex;
  // Peak equity and drawdown are also path-dependent. Rebuild them from the
  // retained curve so no metric keeps knowledge of the removed candle.
  let peak = d(state.config.startingBalance);
  let maxDrawdown = d(0);
  let maxDrawdownPercent = "0.0";
  for (const point of state.equityCurve) {
    const equity = d(point.equity);
    peak = Decimal.max(peak, equity);
    const drawdown = peak.minus(equity);
    if (drawdown.greaterThan(maxDrawdown)) {
      maxDrawdown = drawdown;
      maxDrawdownPercent = peak.isZero()
        ? "0.0"
        : drawdown.dividedBy(peak).times(100).toFixed(1);
    }
  }
  state.maxEquity = peak.toFixed(2);
  state.maxDrawdown = maxDrawdown.toFixed(2);
  state.maxDrawdownPercent = maxDrawdownPercent;
  recomputeEquity(ctx, false);
  return true;
}

export function stepBack(ctx: EngineContext): boolean {
  return stepBackTo(ctx, ctx.state.visibleIndex - 1);
}

/**
 * Bring a persisted replay to the exact index selected by the instant client.
 * The server may be behind, already there, or ahead; all three are successful
 * synchronization paths when the requested rewind boundary is valid.
 */
export function moveReplayToIndex(
  ctx: EngineContext,
  requestedIndex: number,
): boolean {
  const target = Math.min(
    Math.max(0, Math.floor(requestedIndex)),
    ctx.state.totalCandles - 1,
  );
  while (ctx.state.visibleIndex < target && revealNext(ctx)) {
    // Reproduce every intervening candle so execution remains deterministic.
  }
  if (ctx.state.visibleIndex === target) return true;
  return stepBackTo(ctx, target);
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

function pendingExecutablePrices(
  ctx: EngineContext,
  candle: Candle,
  order: PendingOrder,
): { touched: boolean; fillPrice: string | null } {
  const prices = deriveBidAsk(
    candle,
    ctx.state.config.spreadPips,
    ctx.state.config.pipSize,
  );
  const requested = d(order.entryPrice);
  const isBuy = order.direction === "long";
  const open = isBuy ? prices.askOpen : prices.bidOpen;
  const high = isBuy ? prices.askHigh : prices.bidHigh;
  const low = isBuy ? prices.askLow : prices.bidLow;
  const gapThrough =
    order.orderType === "limit"
      ? isBuy
        ? open.lessThanOrEqualTo(requested)
        : open.greaterThanOrEqualTo(requested)
      : isBuy
        ? open.greaterThanOrEqualTo(requested)
        : open.lessThanOrEqualTo(requested);
  const touched =
    gapThrough ||
    (order.orderType === "limit"
      ? isBuy
        ? low.lessThanOrEqualTo(requested)
        : high.greaterThanOrEqualTo(requested)
      : isBuy
        ? high.greaterThanOrEqualTo(requested)
        : low.lessThanOrEqualTo(requested));
  if (!touched) return { touched: false, fillPrice: null };

  // Gap rule: execute at the first tradable opening quote. Intrabar touches
  // execute at the requested level; stop orders therefore preserve realistic
  // adverse gap slippage and limit orders receive favorable opening improvement.
  const rawFill = gapThrough ? open : requested;
  const slippage = d(ctx.state.config.slippagePips).times(
    ctx.state.config.pipSize,
  );
  const fill =
    order.orderType === "stop"
      ? isBuy
        ? rawFill.plus(slippage)
        : rawFill.minus(slippage)
      : rawFill;
  return {
    touched: true,
    fillPrice: fill.toFixed(ctx.state.config.pricePrecision),
  };
}

function activatePendingOrder(
  ctx: EngineContext,
  order: PendingOrder,
  candle: Candle,
  fillPrice: string,
): void {
  const commission = commissionForLots(
    ctx.state.config.commissionPerLot,
    order.lots,
  );
  const initialRiskAmount = order.stopLoss
    ? d(
        computePnl({
          direction: order.direction,
          entryPrice: fillPrice,
          exitPrice: order.stopLoss,
          lots: order.lots,
          pipSize: ctx.state.config.pipSize,
          pipValueAccountPerLot: pipValueAccountPerLot(
            ctx.state.config,
            order.stopLoss,
          ),
          commission,
        }).pnl,
      )
        .abs()
        .toFixed(2)
    : null;
  const position: OpenPosition = {
    id: `${order.id}:position`,
    journalId: `${order.id}:position`,
    direction: order.direction,
    entryPrice: fillPrice,
    entryIndex: ctx.state.visibleIndex,
    entryTime: candle.timestamp,
    lots: order.lots,
    stopLoss: order.stopLoss,
    takeProfit: order.takeProfit,
    initialStopLoss: order.stopLoss,
    initialTakeProfit: order.takeProfit,
    initialRiskAmount,
    trailingStopPips: null,
    trailingBestPrice: null,
    maxFavorablePnl: "0.00",
    maxAdversePnl: "0.00",
    commission,
    unrealizedPnl: "0.00",
  };
  position.journal = createTradeJournal(
    ctx,
    fillPrice,
    order.stopLoss,
    order.takeProfit,
  );
  ctx.state.openPositions.push(position);
  order.status = "activated";
  order.fillPrice = fillPrice;
  order.activatedTime = candle.timestamp;
  order.updatedTime = candle.timestamp;
  order.activatedPositionId = position.id;
}

function processPendingOrders(ctx: EngineContext, candle: Candle): void {
  for (const order of ctx.state.pendingOrders) {
    if (order.status !== "pending") continue;
    if (order.expiresAt != null && candle.timestamp >= order.expiresAt) {
      order.status = "expired";
      order.expiredTime = candle.timestamp;
      order.updatedTime = candle.timestamp;
      continue;
    }
    const result = pendingExecutablePrices(ctx, candle, order);
    if (result.touched && result.fillPrice) {
      activatePendingOrder(ctx, order, candle, result.fillPrice);
    }
  }
}

export function expirePendingOrders(ctx: EngineContext): void {
  const time = currentCandle(ctx)?.timestamp ?? ctx.state.config.endTime;
  for (const order of ctx.state.pendingOrders) {
    if (order.status !== "pending") continue;
    order.status = "expired";
    order.expiredTime = time;
    order.updatedTime = time;
  }
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
  const stopLoss = req.stopLoss ?? null;
  const takeProfit = req.takeProfit ?? null;

  const sizing = calculatePositionSize({
    accountBalance: state.balance,
    accountCurrency: state.config.accountCurrency,
    riskPercent: req.riskPercent,
    entryPrice: entry,
    stopLoss: stopLoss ?? undefined,
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

  const commission = commissionForLots(state.config.commissionPerLot, lots);
  const initialRiskAmount = stopLoss
    ? d(computePnl({
        direction: req.direction,
        entryPrice: entry,
        exitPrice: stopLoss,
        lots,
        pipSize: state.config.pipSize,
        pipValueAccountPerLot: pipValueAccountPerLot(state.config, stopLoss),
        commission,
      }).pnl).abs().toFixed(2)
    : null;

  return {
    ok: true,
    position: {
      id,
      journalId: id,
      direction: req.direction,
      entryPrice: entry,
      entryIndex: state.visibleIndex,
      entryTime: candle.timestamp,
      lots,
      stopLoss,
      takeProfit,
      initialStopLoss: stopLoss,
      initialTakeProfit: takeProfit,
      initialRiskAmount,
      trailingStopPips: null,
      trailingBestPrice: null,
      maxFavorablePnl: "0.00",
      maxAdversePnl: "0.00",
      commission,
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
  const orderType = req.orderType ?? "market";
  if (orderType !== "market") {
    if (!req.entryPrice) {
      return { ok: false, error: "Pending orders require an entry price." };
    }
    const market = d(candle.close);
    const entry = d(req.entryPrice);
    const validSide =
      orderType === "limit"
        ? req.direction === "long"
          ? entry.lessThan(market)
          : entry.greaterThan(market)
        : req.direction === "long"
          ? entry.greaterThan(market)
          : entry.lessThan(market);
    if (!validSide) {
      return {
        ok: false,
        error: `${req.direction === "long" ? "Buy" : "Sell"} ${orderType} price is on the wrong side of market.`,
      };
    }
    const sizing = calculatePositionSize({
      accountBalance: state.balance,
      accountCurrency: state.config.accountCurrency,
      riskPercent: req.riskPercent,
      entryPrice: req.entryPrice,
      stopLoss: req.stopLoss,
      pipSize: state.config.pipSize,
      symbol: state.config.symbol,
      quoteCurrency: state.config.quoteCurrency,
      baseCurrency: state.config.baseCurrency,
      fixedLots: req.sizingMode === "fixed-lots" ? req.lots : undefined,
    });
    if (d(sizing.lots).lessThanOrEqualTo(0)) {
      return { ok: false, error: "Calculated position size is zero." };
    }
    const pending: PendingOrder = {
      id: req.clientOrderId ?? makeId("ord"),
      direction: req.direction,
      orderType,
      entryPrice: d(req.entryPrice).toFixed(state.config.pricePrecision),
      sizingMode: req.sizingMode,
      lots: sizing.lots,
      riskPercent: req.riskPercent,
      stopLoss: req.stopLoss ?? null,
      takeProfit: req.takeProfit ?? null,
      expiresAt: req.expiresAt ?? null,
      status: "pending",
      createdIndex: state.visibleIndex,
      createdTime: candle.timestamp,
      updatedTime: candle.timestamp,
      activatedTime: null,
      cancelledTime: null,
      expiredTime: null,
      fillPrice: null,
      activatedPositionId: null,
    };
    state.pendingOrders.push(pending);
    state.lockedBeforeIndex = state.visibleIndex;
    return { ok: true };
  }

  const preview = previewPosition(
    state,
    candle,
    req,
    req.clientOrderId ?? makeId("pos"),
  );
  if (!preview.ok || !preview.position) return preview;
  preview.position.journal = createTradeJournal(
    ctx,
    preview.position.entryPrice,
    preview.position.stopLoss,
    preview.position.takeProfit,
  );
  state.openPositions.push(preview.position);
  state.lockedBeforeIndex = state.visibleIndex;
  recomputeEquity(ctx, false);
  return { ok: true };
}

export function modifyPendingOrder(
  ctx: EngineContext,
  orderId: string,
  price: string,
): PlaceOrderResult {
  const order = ctx.state.pendingOrders.find((item) => item.id === orderId);
  if (!order || order.status !== "pending") {
    return { ok: false, error: "Pending order is no longer active." };
  }
  if (!d(price).isFinite() || d(price).lessThanOrEqualTo(0)) {
    return { ok: false, error: "Order price must be greater than zero." };
  }
  const candle = currentCandle(ctx);
  if (!candle) return { ok: false, error: "No current candle." };
  const market = d(candle.close);
  const entry = d(price);
  const validSide =
    order.orderType === "limit"
      ? order.direction === "long"
        ? entry.lessThan(market)
        : entry.greaterThan(market)
      : order.direction === "long"
        ? entry.greaterThan(market)
        : entry.lessThan(market);
  if (!validSide) {
    return {
      ok: false,
      error: `${order.direction === "long" ? "Buy" : "Sell"} ${order.orderType} price is on the wrong side of market.`,
    };
  }
  order.entryPrice = d(price).toFixed(ctx.state.config.pricePrecision);
  order.updatedTime = candle.timestamp;
  ctx.state.lockedBeforeIndex = Math.max(
    ctx.state.lockedBeforeIndex,
    ctx.state.visibleIndex,
  );
  return { ok: true };
}

export function cancelPendingOrder(
  ctx: EngineContext,
  orderId: string,
): PlaceOrderResult {
  const order = ctx.state.pendingOrders.find((item) => item.id === orderId);
  if (!order || order.status !== "pending") {
    return { ok: false, error: "Pending order is no longer active." };
  }
  const time = currentCandle(ctx)?.timestamp ?? order.updatedTime;
  order.status = "cancelled";
  order.cancelledTime = time;
  order.updatedTime = time;
  ctx.state.lockedBeforeIndex = Math.max(
    ctx.state.lockedBeforeIndex,
    ctx.state.visibleIndex,
  );
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
  const establishesRisk =
    price != null &&
    (position.direction === "long"
      ? d(price).lessThan(position.entryPrice)
      : d(price).greaterThan(position.entryPrice));
  if (price && establishesRisk && !position.initialStopLoss) {
    position.initialStopLoss = price;
    position.initialRiskAmount = d(
      computePnl({
        direction: position.direction,
        entryPrice: position.entryPrice,
        exitPrice: price,
        lots: position.lots,
        pipSize: ctx.state.config.pipSize,
        pipValueAccountPerLot: pipValueAccountPerLot(
          ctx.state.config,
          price,
        ),
        commission: position.commission,
      }).pnl,
    )
      .abs()
      .toFixed(2);
  }
  if (price == null) {
    position.trailingStopPips = null;
    position.trailingBestPrice = null;
  }
  position.stopLoss = price;
  ctx.state.lockedBeforeIndex = Math.max(
    ctx.state.lockedBeforeIndex,
    ctx.state.visibleIndex,
  );
  recomputeEquity(ctx, false);
  return { ok: true };
}

export function modifyTrailingStop(
  ctx: EngineContext,
  pips: string | null,
  positionId?: string,
): PlaceOrderResult {
  const position = positionId
    ? ctx.state.openPositions.find((item) => item.id === positionId)
    : ctx.state.openPositions[0];
  if (!position) return { ok: false, error: "No open position." };
  if (pips == null) {
    position.trailingStopPips = null;
    position.trailingBestPrice = null;
    ctx.state.lockedBeforeIndex = Math.max(
      ctx.state.lockedBeforeIndex,
      ctx.state.visibleIndex,
    );
    return { ok: true };
  }
  if (!d(pips).isFinite() || d(pips).lessThanOrEqualTo(0)) {
    return { ok: false, error: "Trailing-stop distance must be greater than zero." };
  }

  position.trailingStopPips = d(pips).toString();
  position.trailingBestPrice = null;
  const candle = currentCandle(ctx);
  if (candle) tightenTrailingStop(ctx, position, candle);
  const establishesRisk =
    position.stopLoss != null &&
    (position.direction === "long"
      ? d(position.stopLoss).lessThan(position.entryPrice)
      : d(position.stopLoss).greaterThan(position.entryPrice));
  if (position.stopLoss && establishesRisk && !position.initialStopLoss) {
    position.initialStopLoss = position.stopLoss;
    position.initialRiskAmount = d(
      computePnl({
        direction: position.direction,
        entryPrice: position.entryPrice,
        exitPrice: position.stopLoss,
        lots: position.lots,
        pipSize: ctx.state.config.pipSize,
        pipValueAccountPerLot: pipValueAccountPerLot(
          ctx.state.config,
          position.stopLoss,
        ),
        commission: position.commission,
      }).pnl,
    )
      .abs()
      .toFixed(2);
  }
  recomputeEquity(ctx, false);
  ctx.state.lockedBeforeIndex = Math.max(
    ctx.state.lockedBeforeIndex,
    ctx.state.visibleIndex,
  );
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
  if (price && !position.initialTakeProfit) {
    position.initialTakeProfit = price;
  }
  position.takeProfit = price;
  ctx.state.lockedBeforeIndex = Math.max(
    ctx.state.lockedBeforeIndex,
    ctx.state.visibleIndex,
  );
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

/** Close every open position at the current candle's executable price. */
export function closeAllPositions(ctx: EngineContext): PlaceOrderResult {
  if (ctx.state.openPositions.length === 0) {
    return { ok: false, error: "No open positions." };
  }
  while (ctx.state.openPositions.length > 0) {
    const result = closePosition(ctx);
    if (!result.ok) return result;
  }
  return { ok: true };
}
