/**
 * The Free plan's limits, in one place for the server checks and the UI.
 * Safe to import on the client: no secrets, no database.
 */

/** New sessions a Free account can start each calendar month. */
export const FREE_MONTHLY_SESSIONS = 3;
/** Longest replay window a Free session can cover. */
export const FREE_SESSION_DAYS = 31;
/** A little slack over 31 days for timezone-aligned period ends. */
export const FREE_SESSION_MAX_MS = FREE_SESSION_DAYS * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000;
export const FREE_MAX_REPLAY_SPEED = 1200;
export const PRO_MAX_REPLAY_SPEED = 7200;
export const PRO_TRIAL_DAYS = 7;

/**
 * Free markets: the seven major FX pairs, each quoted against the US dollar.
 * Pro adds the crosses, metals, indices, crypto and the dollar index.
 */
export const FREE_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"] as const;

export function isFreeSymbol(symbol: string): boolean {
  return (FREE_SYMBOLS as readonly string[]).includes(symbol.toUpperCase());
}

/**
 * The quota month. One documented boundary for everyone: the UTC calendar
 * month, renewing at 00:00 UTC on the 1st, whatever the trader's timezone.
 */
export function quotaMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** When the current quota month ends and three new sessions become available. */
export function quotaResetsAt(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** "1 November" — how the UI names the renewal date. */
export function formatQuotaReset(resetsAt: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(resetsAt));
}
