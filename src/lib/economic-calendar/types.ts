/**
 * Economic calendar domain types.
 *
 * One record is one *release* — a single publication of a single indicator, so
 * "US CPI" is hundreds of records, one per month. Figures are decimal strings
 * for the same reason prices are: they are formatted and compared, and a float
 * turns a forecast of 54.5 into 54.499999999999996.
 */

export const IMPORTANCE_LEVELS = ["none", "low", "medium", "high"] as const;
export type EventImportance = (typeof IMPORTANCE_LEVELS)[number];

/** Ascending, so `IMPORTANCE_RANK[a] >= IMPORTANCE_RANK[b]` reads as "at least". */
export const IMPORTANCE_RANK: Record<EventImportance, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export function isEventImportance(value: string): value is EventImportance {
  return (IMPORTANCE_LEVELS as readonly string[]).includes(value);
}

/**
 * How precisely the release is scheduled. Only "exact" earns a vertical line on
 * the chart; the rest are known to the day at best, and drawing them at 00:00
 * would invent a minute the trader never had.
 */
export const TIME_MODES = ["exact", "date", "notime", "tentative"] as const;
export type EventTimeMode = (typeof TIME_MODES)[number];

export function isEventTimeMode(value: string): value is EventTimeMode {
  return (TIME_MODES as readonly string[]).includes(value);
}

export const EVENT_MULTIPLIERS = ["thousands", "millions", "billions", "trillions"] as const;
export type EventMultiplier = (typeof EVENT_MULTIPLIERS)[number];

/** A release, normalised and ready for the database. */
export interface EconomicEventRecord {
  source: string;
  externalId: string;
  seriesId: string | null;
  eventCode: string | null;
  name: string;
  currency: string;
  country: string | null;
  importance: EventImportance;
  /** UTC epoch milliseconds. */
  timestamp: number;
  timeMode: EventTimeMode;
  /** Start of the period described, UTC epoch ms. */
  period: number | null;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  revisedPrevious: string | null;
  unit: string | null;
  multiplier: EventMultiplier | null;
  digits: number;
  revision: number;
}

/** The shape the chart consumes. Same thing, minus the bookkeeping. */
export interface CalendarEvent {
  id: string;
  name: string;
  currency: string;
  country: string | null;
  importance: EventImportance;
  timestamp: number;
  timeMode: EventTimeMode;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  unit: string | null;
  multiplier: EventMultiplier | null;
  digits: number;
}

/**
 * Currencies the chart can badge with a flag. Everything else falls back to a
 * lettered chip, which is why this list can stay short: it covers every currency
 * the app's instruments quote in.
 */
export const FLAGGED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
  "NZD",
  "CNY",
] as const;

/**
 * Currencies a calendar actually files releases under. A whitelist, not a
 * pattern: "XAU" and "BTC" are three capitals each and neither has a central
 * bank, so matching on shape would have gold's chart querying gold's news.
 */
const NEWS_CURRENCIES = new Set([
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
  "NZD",
  "CNY",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "HUF",
  "CZK",
  "TRY",
  "ZAR",
  "MXN",
  "BRL",
  "SGD",
  "HKD",
  "KRW",
  "INR",
]);

/**
 * Currencies whose news moves a given symbol. A trader on EURUSD wants both
 * legs, and everyone wants the dollar — it is the other side of gold, the
 * indices and the crypto pairs the app carries, so those charts get it alone.
 */
export function currenciesForSymbol(
  symbol: string,
  base?: string | null,
  quote?: string | null,
): string[] {
  const currencies = new Set<string>(["USD"]);
  const consider = (leg: string | null | undefined) => {
    const code = (leg ?? "").toUpperCase();
    if (NEWS_CURRENCIES.has(code)) currencies.add(code);
  };

  if (base != null || quote != null) {
    consider(base);
    consider(quote);
  } else if (/^[A-Za-z]{6}$/.test(symbol)) {
    // No definition to hand — split a six-letter pair on the obvious seam.
    consider(symbol.slice(0, 3));
    consider(symbol.slice(3, 6));
  }
  return [...currencies].sort();
}
