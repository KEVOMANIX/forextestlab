import { d, money, type Decimal } from "@/lib/decimal";

/**
 * Prop-firm challenge rules, and the evaluation of a session against them.
 *
 * Deliberately pure: no engine imports, no candles, no positions. Everything
 * here is arithmetic over an equity number and a clock, which is what makes the
 * interesting cases — the day boundary, a breach one cent inside the line, a
 * target met before the minimum days — testable without running a replay.
 *
 * The engine owns *when* to ask (see `enforcePropFirm` in the replay engine);
 * this module owns *what the answer is*.
 */

export type PropFirmPreset = "ftmo-phase-1" | "ftmo-phase-2" | "custom";

/**
 * What the loss limits are measured against.
 *
 * FTMO uses the initial balance for both limits, so the lines are fixed for the
 * whole challenge. Other firms trail the limit up behind a rising peak, which
 * is a materially harder rule — the same trades can pass one and fail the other.
 */
export type PropFirmLossBasis = "initial" | "peak-equity";

export interface PropFirmRules {
  preset: PropFirmPreset;
  /** 1 = Challenge, 2 = Verification. Shown in the HUD, carried into a fork. */
  phase: 1 | 2;
  profitTargetPercent: number;
  maxDailyLossPercent: number;
  maxTotalLossPercent: number;
  lossBasis: PropFirmLossBasis;
  /** IANA zone whose midnight resets the daily loss limit. */
  dailyResetZone: string;
  /** Zero disables. FTMO no longer requires a minimum. */
  minTradingDays: number;
}

export type PropFirmBreachRule = "daily-loss" | "total-loss";

export interface PropFirmBreach {
  rule: PropFirmBreachRule;
  /** Market timestamp of the candle that broke the rule. */
  at: number;
  /** Equity that broke it — the intra-candle low, not the close. */
  equity: string;
  /** The equity level that had to hold. */
  limit: string;
}

export interface PropFirmRuntime {
  status: "active" | "passed" | "breached";
  breach: PropFirmBreach | null;
  /** Day key, in the firm's zone, that `dayStartEquity` belongs to. */
  dayKey: string;
  /** Equity carried into the current trading day. */
  dayStartEquity: string;
  /** Day keys on which at least one trade closed. */
  tradingDays: string[];
  /**
   * Set once a breach has been acknowledged, so the trader can keep trading the
   * data for practice without the verdict being reopened or rewritten.
   */
  breachAcknowledged?: boolean;
}

/** FTMO's zone: the trading day rolls at midnight Prague time, not New York. */
const FTMO_ZONE = "Europe/Prague";

export const PROP_FIRM_PRESETS: Record<
  Exclude<PropFirmPreset, "custom">,
  PropFirmRules
> = {
  "ftmo-phase-1": {
    preset: "ftmo-phase-1",
    phase: 1,
    profitTargetPercent: 10,
    maxDailyLossPercent: 5,
    maxTotalLossPercent: 10,
    lossBasis: "initial",
    dailyResetZone: FTMO_ZONE,
    minTradingDays: 0,
  },
  "ftmo-phase-2": {
    preset: "ftmo-phase-2",
    phase: 2,
    profitTargetPercent: 5,
    maxDailyLossPercent: 5,
    maxTotalLossPercent: 10,
    lossBasis: "initial",
    dailyResetZone: FTMO_ZONE,
    minTradingDays: 0,
  },
};

export const PROP_FIRM_ACCOUNT_SIZES = [
  "10000",
  "25000",
  "50000",
  "100000",
  "200000",
] as const;

/** The day a market timestamp belongs to, in the firm's reset zone. */
export function propFirmDayKey(at: number, zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    // An unknown zone must not take the engine down mid-replay; UTC keeps the
    // daily limit working, just on the wrong boundary.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  }
}

export function initialPropFirmRuntime(
  startingBalance: string,
  at: number,
  rules: PropFirmRules,
): PropFirmRuntime {
  return {
    status: "active",
    breach: null,
    dayKey: propFirmDayKey(at, rules.dailyResetZone),
    dayStartEquity: money(startingBalance),
    tradingDays: [],
  };
}

/**
 * Open a new trading day.
 *
 * Called with the equity carried *into* the day's first candle — before that
 * candle's stops and targets are processed — because that is the reference the
 * daily limit is measured from. Taking it after would give the candle's own
 * loss a free pass.
 */
export function rollTradingDay(
  runtime: PropFirmRuntime,
  at: number,
  equity: string,
  rules: PropFirmRules,
): PropFirmRuntime {
  const dayKey = propFirmDayKey(at, rules.dailyResetZone);
  if (dayKey === runtime.dayKey) return runtime;
  return { ...runtime, dayKey, dayStartEquity: money(equity) };
}

/** Record that a trade closed today, for the minimum-trading-days requirement. */
export function recordTradingDay(
  runtime: PropFirmRuntime,
  at: number,
  rules: PropFirmRules,
): PropFirmRuntime {
  const dayKey = propFirmDayKey(at, rules.dailyResetZone);
  if (runtime.tradingDays.includes(dayKey)) return runtime;
  return { ...runtime, tradingDays: [...runtime.tradingDays, dayKey] };
}

export interface PropFirmProgress {
  status: PropFirmRuntime["status"];
  phase: 1 | 2;
  /** Equity the account has to reach. */
  targetEquity: string;
  profit: string;
  profitPercent: number;
  /** Equity floors that must hold; the tighter of the two is what bites. */
  dailyFloor: string;
  totalFloor: string;
  dailyRemaining: string;
  totalRemaining: string;
  /** 0–1, for the HUD's meters. */
  targetProgress: number;
  dailyUsedRatio: number;
  totalUsedRatio: number;
  tradingDays: number;
  minTradingDays: number;
  targetMet: boolean;
  /** Target reached *and* every other requirement satisfied. */
  requirementsMet: boolean;
}

function lossReference(
  rules: PropFirmRules,
  startingBalance: string,
  peakEquity: string,
): string {
  return rules.lossBasis === "peak-equity"
    ? money(peakEquity)
    : money(startingBalance);
}

export function propFirmProgress(input: {
  rules: PropFirmRules;
  startingBalance: string;
  equity: string;
  peakEquity: string;
  runtime: PropFirmRuntime;
}): PropFirmProgress {
  const { rules, runtime } = input;
  const start = d(input.startingBalance);
  const equity = d(input.equity);
  const reference = d(lossReference(rules, input.startingBalance, input.peakEquity));

  const targetEquity = start.plus(start.times(rules.profitTargetPercent).dividedBy(100));
  const profit = equity.minus(start);
  const profitPercent = start.isZero()
    ? 0
    : profit.dividedBy(start).times(100).toNumber();

  // The daily allowance is a percentage of the reference, but it is spent from
  // the equity the day opened at — so a day that starts in profit still only
  // gets the same allowance, measured from where it started.
  const dailyAllowance = reference.times(rules.maxDailyLossPercent).dividedBy(100);
  const dailyFloor = d(runtime.dayStartEquity).minus(dailyAllowance);
  const totalAllowance = reference.times(rules.maxTotalLossPercent).dividedBy(100);
  const totalFloor = reference.minus(totalAllowance);

  const dailyUsed = d(runtime.dayStartEquity).minus(equity);
  const totalUsed = reference.minus(equity);

  const targetMet = rules.profitTargetPercent <= 0 || equity.greaterThanOrEqualTo(targetEquity);
  const daysMet = runtime.tradingDays.length >= rules.minTradingDays;

  return {
    status: runtime.status,
    phase: rules.phase,
    targetEquity: targetEquity.toFixed(2),
    profit: profit.toFixed(2),
    profitPercent,
    dailyFloor: dailyFloor.toFixed(2),
    totalFloor: totalFloor.toFixed(2),
    dailyRemaining: headroom(equity.minus(dailyFloor)),
    totalRemaining: headroom(equity.minus(totalFloor)),
    targetProgress: clamp01(
      rules.profitTargetPercent <= 0
        ? 1
        : profit.dividedBy(targetEquity.minus(start)).toNumber(),
    ),
    dailyUsedRatio: dailyAllowance.isZero()
      ? 0
      : clamp01(dailyUsed.dividedBy(dailyAllowance).toNumber()),
    totalUsedRatio: totalAllowance.isZero()
      ? 0
      : clamp01(totalUsed.dividedBy(totalAllowance).toNumber()),
    tradingDays: runtime.tradingDays.length,
    minTradingDays: rules.minTradingDays,
    targetMet,
    requirementsMet: targetMet && daysMet,
  };
}

function headroom(value: Decimal): string {
  // Remaining headroom never reads as negative: once it is gone the account has
  // breached, and "-120.00 left" is a number nobody needs.
  return value.isNegative() ? "0.00" : value.toFixed(2);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Evaluate one candle against the rules.
 *
 * `lowEquity` is the worst equity printed inside the candle. Breaches measure
 * against it rather than the close, because a firm watching a live account
 * would have closed it the moment the wick went through the line — grading on
 * closes alone would pass runs that reality would have failed.
 *
 * Returns the next runtime; the caller assigns it and reacts to a status change.
 */
export function evaluatePropFirm(input: {
  rules: PropFirmRules;
  startingBalance: string;
  equity: string;
  lowEquity?: string;
  peakEquity: string;
  runtime: PropFirmRuntime;
  at: number;
}): PropFirmRuntime {
  const { rules, runtime } = input;
  if (runtime.status === "breached") return runtime;

  const reference = d(lossReference(rules, input.startingBalance, input.peakEquity));
  const worst = d(input.lowEquity ?? input.equity);

  const dailyFloor = d(runtime.dayStartEquity).minus(
    reference.times(rules.maxDailyLossPercent).dividedBy(100),
  );
  const totalFloor = reference.minus(
    reference.times(rules.maxTotalLossPercent).dividedBy(100),
  );

  // Total loss is checked first: an account through both lines has failed the
  // challenge outright, which is the more serious of the two verdicts.
  if (rules.maxTotalLossPercent > 0 && worst.lessThanOrEqualTo(totalFloor)) {
    return {
      ...runtime,
      status: "breached",
      breach: {
        rule: "total-loss",
        at: input.at,
        equity: worst.toFixed(2),
        limit: totalFloor.toFixed(2),
      },
    };
  }
  if (rules.maxDailyLossPercent > 0 && worst.lessThanOrEqualTo(dailyFloor)) {
    return {
      ...runtime,
      status: "breached",
      breach: {
        rule: "daily-loss",
        at: input.at,
        equity: worst.toFixed(2),
        limit: dailyFloor.toFixed(2),
      },
    };
  }

  const progress = propFirmProgress({
    rules,
    startingBalance: input.startingBalance,
    equity: input.equity,
    peakEquity: input.peakEquity,
    runtime,
  });
  // Passing does not stop the session. The phase is complete, but the rest of
  // the data is still worth trading, and a firm would not close the account.
  if (progress.requirementsMet && runtime.status !== "passed") {
    return { ...runtime, status: "passed" };
  }
  return runtime;
}

export const BREACH_LABELS: Record<PropFirmBreachRule, string> = {
  "daily-loss": "Daily loss limit",
  "total-loss": "Maximum loss limit",
};
