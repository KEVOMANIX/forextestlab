/**
 * Exit quality — what a trade reached, and what it would have done if the
 * original plan had been left alone.
 *
 * Two tiers, and the split matters:
 *
 *  - Tier 1 lives entirely inside the trade's own lifetime. The replay engine
 *    already records peak favourable and adverse P/L on every position, so
 *    "you reached +2.4R and kept +0.8R" needs no candles and no look-ahead.
 *  - Tier 2 asks what the untouched plan would have produced, which needs
 *    candles the replay may not have revealed. Feeding those to the browser
 *    mid-session would hand the trader the future, which is the one thing this
 *    product promises not to do — so callers must only run it on a finished
 *    session. {@link planTestable} states that precondition in one place.
 *
 * The counterfactual reuses the engine's own fill helpers rather than
 * reimplementing them. If it invented its own spread handling or its own rule
 * for a candle that touches both stop and target, its numbers would not
 * reconcile with the trades beside them and nobody should believe either.
 */

import {
  checkStopTakeProfit,
  computePnl,
  deriveBidAsk,
} from "@/lib/backtest/execution";
import { pipValuePerLot } from "@/lib/backtest/position-sizing";
import type { Candle } from "@/lib/market-data/types";
import { Decimal } from "@/lib/decimal";
import type {
  ClosedTrade,
  ExecutionPolicy,
  SessionState,
  TradeDirection,
} from "@/lib/backtest/types";

const d = (value: Decimal.Value) => new Decimal(value);

/** How far past the entry the counterfactual will walk before giving up. */
export const MAX_PLAN_CANDLES = 750;

/** Fixed targets the ladder reports on. */
export const LADDER_TARGETS = [1, 1.5, 2, 3] as const;

/* -------------------------------------------------------------------------- */
/* Tier 1 — inside the trade                                                  */
/* -------------------------------------------------------------------------- */

export interface Excursion {
  /** Best R the trade was ever worth while it was open. */
  peakR: number | null;
  /** Worst R it was ever worth. Negative. */
  troughR: number | null;
  /** R actually taken. */
  capturedR: number | null;
  /**
   * Profit that existed and was surrendered, never below zero and never more
   * than the peak. A loss is not a give-back: a trade that poked 0.3R into
   * profit and then lost 3R gave back 0.3R, not 3.3R. Subtracting a negative
   * close from the peak would have made every large loser look like a winner
   * cut short, which is the opposite of the lesson.
   */
  giveBackR: number | null;
}

const EMPTY: Excursion = {
  peakR: null,
  troughR: null,
  capturedR: null,
  giveBackR: null,
};

/**
 * R is only meaningful when the trade defined its risk. A position opened with
 * no stop has no denominator, and inventing one would quietly turn a
 * risk-management failure into a flattering number.
 */
function riskOf(trade: ClosedTrade): Decimal | null {
  if (!trade.initialRiskAmount) return null;
  const risk = d(trade.initialRiskAmount);
  return risk.greaterThan(0) ? risk : null;
}

export function tradeExcursion(trade: ClosedTrade): Excursion {
  const risk = riskOf(trade);
  if (!risk) return EMPTY;
  const peakR =
    trade.maxFavorablePnl === undefined
      ? null
      : d(trade.maxFavorablePnl).dividedBy(risk).toNumber();
  const troughR =
    trade.maxAdversePnl === undefined
      ? null
      : d(trade.maxAdversePnl).dividedBy(risk).toNumber();
  const capturedR = d(trade.pnl).dividedBy(risk).toNumber();
  return {
    peakR,
    troughR,
    capturedR,
    giveBackR:
      peakR === null ? null : Math.max(0, peakR - Math.max(0, capturedR)),
  };
}

/** The trade with the widest gap between its peak and where it was closed. */
export interface WidestGap {
  /** Ledger number, matching the trades table and the journal. */
  tradeNumber: number;
  peakR: number;
  capturedR: number;
  giveBackR: number;
}

export interface ExcursionSummary {
  /** Trades with both a defined risk and a recorded excursion. */
  tested: number;
  /** Open profit that appeared at some point, in account currency. */
  favourableMoney: number;
  /** How much of it was banked. */
  bankedMoney: number;
  /**
   * One trade named concretely. A single "reached +2.3R, closed at +0.5R" does
   * more for comprehension than any of the ratios above it.
   */
  widestGap: WidestGap | null;
  /**
   * Share of the favourable movement that was actually banked, 0–1. A trade
   * that peaked at +$50 and closed at a loss captured none of it, so the
   * numerator floors at zero rather than going negative and flattering the
   * ratio of some other trade.
   */
  captureRate: number | null;
  averageGiveBackR: number | null;
  /** Trades that handed back more than a full R of open profit. */
  gaveBackOverOneR: number;
  /** How far winners went against you before they worked. Negative. */
  averageWinnerTroughR: number | null;
}

export function summariseExcursions(trades: ClosedTrade[]): ExcursionSummary {
  let favourable = new Decimal(0);
  let banked = new Decimal(0);
  const giveBacks: number[] = [];
  const winnerTroughs: number[] = [];
  let gaveBackOverOneR = 0;
  let tested = 0;
  let widestGap: WidestGap | null = null;

  trades.forEach((trade, index) => {
    const excursion = tradeExcursion(trade);
    if (excursion.peakR === null || excursion.capturedR === null) return;
    tested += 1;
    if (!widestGap || (excursion.giveBackR ?? 0) > widestGap.giveBackR) {
      widestGap = {
        // Ledger numbering: position in the closed-trade list, oldest first.
        tradeNumber: index + 1,
        peakR: excursion.peakR,
        capturedR: excursion.capturedR,
        giveBackR: excursion.giveBackR ?? 0,
      };
    }

    const peak = d(trade.maxFavorablePnl ?? 0);
    if (peak.greaterThan(0)) {
      favourable = favourable.plus(peak);
      banked = banked.plus(Decimal.max(0, d(trade.pnl)));
    }

    giveBacks.push(excursion.giveBackR ?? 0);
    if ((excursion.giveBackR ?? 0) > 1) gaveBackOverOneR += 1;
    if (d(trade.pnl).greaterThan(0) && excursion.troughR !== null) {
      winnerTroughs.push(excursion.troughR);
    }
  });

  return {
    tested,
    favourableMoney: favourable.toNumber(),
    bankedMoney: banked.toNumber(),
    widestGap: (widestGap as WidestGap | null)?.giveBackR ? widestGap : null,
    captureRate: favourable.greaterThan(0)
      ? banked.dividedBy(favourable).toNumber()
      : null,
    averageGiveBackR: giveBacks.length ? mean(giveBacks) : null,
    gaveBackOverOneR,
    averageWinnerTroughR: winnerTroughs.length ? mean(winnerTroughs) : null,
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/* -------------------------------------------------------------------------- */
/* Tier 2 — what the untouched plan would have done                           */
/* -------------------------------------------------------------------------- */

export type PlanOutcome = "take-profit" | "stop-loss" | "unresolved";

export interface PlanTest {
  tradeId: string;
  outcome: PlanOutcome;
  /** R the plan would have produced. */
  planR: number;
  /** R actually taken. */
  capturedR: number;
  /** planR − capturedR. Positive means leaving it alone would have paid more. */
  deltaR: number;
  /** Best R reached at any point before the plan resolved. */
  peakR: number;
  troughR: number;
  /** The trade's initial risk in account currency, so R can be shown in money. */
  risk: number;
  /** Candles from entry to resolution, or to the end of the data. */
  candles: number;
  /** The resolving candle touched both levels; the session policy decided. */
  intrabarAmbiguous: boolean;
}

export interface PlanConfig {
  spreadPips: string;
  pipSize: string;
  quoteCurrency: string;
  accountCurrency: string;
  baseCurrency: string;
  symbol: string;
  executionPolicy: ExecutionPolicy;
}

/**
 * A finished session is the precondition for any of this. Everything Tier 2
 * reads lies past the reveal cursor of a session still being replayed.
 */
export function planTestable(state: Pick<SessionState, "status">): boolean {
  return state.status === "finished";
}

/**
 * Whether this particular trade can be asked the question at all. Only a
 * manual close left a plan unresolved — a trade that hit its own stop or
 * target followed the plan by definition, and re-litigating those teaches
 * nothing except to move stops.
 */
export function tradePlanTestable(trade: ClosedTrade): boolean {
  if (trade.exitReason !== "manual") return false;
  if (!riskOf(trade)) return false;
  return Boolean(trade.initialStopLoss ?? trade.initialTakeProfit);
}

function pnlAt(
  trade: ClosedTrade,
  config: PlanConfig,
  price: Decimal | string,
): Decimal {
  const exitPrice = price.toString();
  return d(
    computePnl({
      direction: trade.direction as TradeDirection,
      entryPrice: trade.entryPrice,
      exitPrice,
      lots: trade.lots,
      pipSize: config.pipSize,
      pipValueAccountPerLot: pipValuePerLot({
        pipSize: config.pipSize,
        quoteCurrency: config.quoteCurrency,
        accountCurrency: config.accountCurrency,
        baseCurrency: config.baseCurrency,
        price: exitPrice,
        symbol: config.symbol,
      }).value,
      commission: trade.commission,
    }).pnl,
  );
}

/**
 * Walk forward from the entry with the levels the trade was opened with,
 * ignoring the exit that actually happened and any stop or target moved
 * afterwards. `candles` must start at or before the entry and be ordered.
 */
export function testTradePlan(
  trade: ClosedTrade,
  candles: Candle[],
  config: PlanConfig,
): PlanTest | null {
  const risk = riskOf(trade);
  if (!risk) return null;

  const stopLoss = trade.initialStopLoss ?? null;
  const takeProfit = trade.initialTakeProfit ?? null;
  if (!stopLoss && !takeProfit) return null;

  const forward = candles
    .filter((candle) => candle.timestamp >= trade.entryTime)
    .slice(0, MAX_PLAN_CANDLES);
  if (!forward.length) return null;

  const capturedR = d(trade.pnl).dividedBy(risk).toNumber();
  let peak = new Decimal(0);
  let trough = new Decimal(0);
  let walked = 0;

  for (const candle of forward) {
    walked += 1;
    const bidAsk = deriveBidAsk(candle, config.spreadPips, config.pipSize);
    const favourable =
      trade.direction === "long" ? bidAsk.bidHigh : bidAsk.askLow;
    const adverse = trade.direction === "long" ? bidAsk.bidLow : bidAsk.askHigh;
    peak = Decimal.max(peak, pnlAt(trade, config, favourable));
    trough = Decimal.min(trough, pnlAt(trade, config, adverse));

    const hit = checkStopTakeProfit(
      trade.direction as TradeDirection,
      stopLoss,
      takeProfit,
      candle,
      config.spreadPips,
      config.pipSize,
      config.executionPolicy,
    );
    if (!hit) continue;

    const planR = pnlAt(trade, config, hit.price).dividedBy(risk).toNumber();
    return {
      tradeId: trade.id,
      outcome: hit.reason === "stop-loss" ? "stop-loss" : "take-profit",
      planR,
      capturedR,
      deltaR: planR - capturedR,
      peakR: peak.dividedBy(risk).toNumber(),
      troughR: trough.dividedBy(risk).toNumber(),
      risk: risk.toNumber(),
      candles: walked,
      intrabarAmbiguous: hit.intrabarAmbiguous,
    };
  }

  // The data ran out with the trade still open. Mark it to close on the last
  // price rather than pretending the plan resolved.
  const last = forward[forward.length - 1]!;
  const closing =
    trade.direction === "long"
      ? deriveBidAsk(last, config.spreadPips, config.pipSize).bidClose
      : deriveBidAsk(last, config.spreadPips, config.pipSize).askClose;
  const planR = pnlAt(trade, config, closing).dividedBy(risk).toNumber();
  return {
    tradeId: trade.id,
    outcome: "unresolved",
    planR,
    capturedR,
    deltaR: planR - capturedR,
    peakR: peak.dividedBy(risk).toNumber(),
    troughR: trough.dividedBy(risk).toNumber(),
    risk: risk.toNumber(),
    candles: walked,
    intrabarAmbiguous: false,
  };
}

export interface LadderRung {
  target: number;
  /** Trades whose peak reached the target before the plan resolved. */
  hit: number;
  /** Net R if every trade had used this fixed target and its original stop. */
  netR: number;
  netMoney: number;
}

export interface PlanSummary {
  tested: number;
  /** Total R actually taken on the tested trades, for comparing the ladder to. */
  capturedR: number;
  capturedMoney: number;
  /** Total R the untouched plan would have produced. */
  planR: number;
  planMoney: number;
  /** Sum of deltaR. Positive means cutting cost you; negative means it saved you. */
  netDeltaR: number;
  cutEarly: number;
  cutWell: number;
  reachedTarget: number;
  stoppedOut: number;
  unresolved: number;
  ladder: LadderRung[];
}

export function summarisePlanTests(tests: PlanTest[]): PlanSummary {
  const ladder = LADDER_TARGETS.map((target) => {
    let hit = 0;
    let netR = 0;
    let netMoney = 0;
    for (const test of tests) {
      // Reached the target before the plan resolved, so the target pays.
      // Otherwise the trade ends wherever its own plan left it.
      const outcomeR = test.peakR >= target ? target : test.planR;
      if (test.peakR >= target) hit += 1;
      netR += outcomeR;
      netMoney += outcomeR * test.risk;
    }
    return { target, hit, netR, netMoney };
  });

  return {
    tested: tests.length,
    capturedR: tests.reduce((sum, test) => sum + test.capturedR, 0),
    capturedMoney: tests.reduce((sum, test) => sum + test.capturedR * test.risk, 0),
    planR: tests.reduce((sum, test) => sum + test.planR, 0),
    planMoney: tests.reduce((sum, test) => sum + test.planR * test.risk, 0),
    netDeltaR: tests.reduce((sum, test) => sum + test.deltaR, 0),
    cutEarly: tests.filter((test) => test.deltaR > 0).length,
    cutWell: tests.filter((test) => test.deltaR < 0).length,
    reachedTarget: tests.filter((test) => test.outcome === "take-profit").length,
    stoppedOut: tests.filter((test) => test.outcome === "stop-loss").length,
    unresolved: tests.filter((test) => test.outcome === "unresolved").length,
    ladder,
  };
}
