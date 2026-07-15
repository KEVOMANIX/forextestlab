/**
 * Position sizing for the backtest engine.
 *
 * All arithmetic uses decimal.js (never native float). Inputs and outputs are
 * decimal STRINGS. A "standard lot" is 100,000 units of the base currency.
 */

import { Decimal, d, isFiniteNumeric, money } from "@/lib/decimal";

/** Units of base currency in one standard lot. */
const STANDARD_LOT = 100000;

/** Minimum lot size used as a safe fallback when risk sizing is impossible. */
const MIN_LOTS = "0.01";

const CROSS_NOTE =
  "Cross-currency pip value approximated; provide a conversion rate for accuracy.";

export interface PositionSizingInput {
  accountBalance: string;
  accountCurrency: string; // e.g. "USD"
  riskPercent?: string; // used when fixedLots not given, e.g. "1" = 1%
  entryPrice: string;
  stopLoss?: string;
  pipSize: string; // e.g. "0.0001" or "0.01"
  symbol: string; // e.g. "EURUSD", "USDJPY", "EURGBP"
  quoteCurrency: string; // e.g. "USD", "JPY", "GBP"
  baseCurrency: string; // e.g. "EUR", "USD"
  fixedLots?: string; // when provided, sizing is fixed
}

export interface PositionSizingResult {
  lots: string; // standard lots (1.0 lot = 100,000 base units), 2 dp
  riskAmount: string; // account currency, 2 dp ("0.00" if not risk-based)
  stopDistancePips: string; // pips, 1 dp ("Not available" if no stopLoss)
  pipValuePerLot: string; // account currency per pip per 1.0 lot, 2 dp
  maxExpectedLoss: string; // account currency, 2 dp ("Not available" if no stopLoss)
  crossCurrencyApprox: boolean; // true when a conversion had to be approximated
  notes: string[];
}

const NOT_AVAILABLE = "Not available";

/**
 * Pip value in the ACCOUNT currency for one standard (1.0) lot.
 *
 * The pip value in the QUOTE currency is always `pipSize * 100000`. Converting
 * to the account currency depends on how the pair relates to the account:
 *  - quote === account  -> exact, no conversion needed.
 *  - base === account   -> divide by the current price (exact, price given).
 *  - otherwise (a cross vs the account currency) -> approximated as quote ~ account.
 */
export function pipValuePerLot(params: {
  pipSize: string;
  quoteCurrency: string;
  accountCurrency: string;
  baseCurrency: string;
  price: string;
  symbol: string;
}): { value: string; approx: boolean } {
  const { pipSize, quoteCurrency, accountCurrency, baseCurrency, price } =
    params;

  if (!isFiniteNumeric(pipSize)) {
    return { value: NOT_AVAILABLE, approx: false };
  }

  // Pip value expressed in the quote currency for one standard lot.
  const pipValueQuote = d(pipSize).times(STANDARD_LOT);

  if (quoteCurrency === accountCurrency) {
    return { value: money(pipValueQuote), approx: false };
  }

  if (baseCurrency === accountCurrency) {
    if (!isFiniteNumeric(price) || d(price).lte(0)) {
      return { value: NOT_AVAILABLE, approx: false };
    }
    return { value: money(pipValueQuote.div(price)), approx: false };
  }

  // Cross vs the account currency: approximate quote ~ account (documented).
  return { value: money(pipValueQuote), approx: true };
}

export function calculatePositionSize(
  input: PositionSizingInput,
): PositionSizingResult {
  const notes: string[] = [];

  const {
    accountBalance,
    accountCurrency,
    riskPercent,
    entryPrice,
    stopLoss,
    pipSize,
    symbol,
    quoteCurrency,
    baseCurrency,
    fixedLots,
  } = input;

  const pv = pipValuePerLot({
    pipSize,
    quoteCurrency,
    accountCurrency,
    baseCurrency,
    price: entryPrice,
    symbol,
  });
  const crossCurrencyApprox = pv.approx;
  if (crossCurrencyApprox) {
    notes.push(CROSS_NOTE);
  }

  const pipValueAvailable = isFiniteNumeric(pv.value) && d(pv.value).gt(0);
  const pipValueOut = isFiniteNumeric(pv.value) ? pv.value : NOT_AVAILABLE;

  // Stop distance in pips. Keep the exact Decimal for math; expose 1 dp string.
  let stopDistanceDecimal: Decimal | null = null;
  let stopDistancePips = NOT_AVAILABLE;
  if (
    stopLoss !== undefined &&
    isFiniteNumeric(stopLoss) &&
    isFiniteNumeric(entryPrice) &&
    isFiniteNumeric(pipSize) &&
    d(pipSize).gt(0)
  ) {
    stopDistanceDecimal = d(entryPrice).minus(stopLoss).abs().div(pipSize);
    stopDistancePips = stopDistanceDecimal.toFixed(1);
  }

  // ---- Fixed-lot sizing --------------------------------------------------
  if (fixedLots !== undefined && isFiniteNumeric(fixedLots)) {
    const lots = d(fixedLots).toFixed(2);
    let maxExpectedLoss = NOT_AVAILABLE;
    if (stopDistanceDecimal !== null && pipValueAvailable) {
      maxExpectedLoss = money(
        stopDistanceDecimal.times(pv.value).times(lots),
      );
    }
    return {
      lots,
      riskAmount: "0.00",
      stopDistancePips,
      pipValuePerLot: pipValueOut,
      maxExpectedLoss,
      crossCurrencyApprox,
      notes,
    };
  }

  // ---- Risk-based sizing -------------------------------------------------
  let riskAmount = "0.00";
  if (
    riskPercent !== undefined &&
    isFiniteNumeric(riskPercent) &&
    isFiniteNumeric(accountBalance)
  ) {
    riskAmount = money(d(accountBalance).times(riskPercent).div(100));
  }

  const canSizeByRisk =
    stopDistanceDecimal !== null &&
    stopDistanceDecimal.gt(0) &&
    pipValueAvailable &&
    riskPercent !== undefined &&
    isFiniteNumeric(riskPercent);

  let lots: string;
  let maxExpectedLoss: string;
  if (canSizeByRisk && stopDistanceDecimal !== null) {
    const denom = stopDistanceDecimal.times(pv.value);
    // Round DOWN so we never risk more than requested.
    lots = d(riskAmount)
      .div(denom)
      .toDecimalPlaces(2, Decimal.ROUND_DOWN)
      .toFixed(2);
    maxExpectedLoss = money(denom.times(lots));
  } else {
    lots = MIN_LOTS;
    maxExpectedLoss = NOT_AVAILABLE;
    notes.push(
      "No usable stop-loss for risk-based sizing; defaulted to minimum size 0.01 lots.",
    );
  }

  return {
    lots,
    riskAmount,
    stopDistancePips,
    pipValuePerLot: pipValueOut,
    maxExpectedLoss,
    crossCurrencyApprox,
    notes,
  };
}
