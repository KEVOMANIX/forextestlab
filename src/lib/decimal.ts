/**
 * Shared decimal.js configuration + helpers.
 *
 * ALL financial arithmetic (balances, position sizes, commission, risk, P&L)
 * must go through decimal.js — never native JS number math. Values are passed
 * around as strings and only converted to Decimal for computation.
 */

import Decimal from "decimal.js";

// 28 significant digits is ample for FX; round half-up like typical accounting.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function d(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

/** Format a Decimal to a fixed number of decimal places as a string. */
export function toFixed(value: Decimal.Value, places: number): string {
  return new Decimal(value).toFixed(places);
}

/** Money formatted to 2dp string (account-currency amounts). */
export function money(value: Decimal.Value): string {
  return new Decimal(value).toFixed(2);
}

export function isFiniteNumeric(value: string): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    return new Decimal(value).isFinite();
  } catch {
    return false;
  }
}
