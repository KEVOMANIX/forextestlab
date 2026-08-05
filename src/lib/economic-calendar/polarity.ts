/**
 * Whether a higher or lower actual is the good surprise, for the handful of
 * indicators where that is unambiguous.
 *
 * `surpriseDirection` otherwise assumes a bigger number is the better one —
 * true for GDP, retail sales, PMI, earnings. Labor-market figures that count
 * the unemployed run the other way: a lower unemployment rate, fewer jobless
 * claims, fewer redundancies are the good outcome. Colouring 216K beating a
 * 218K claims forecast the same red as a genuine miss says the opposite of
 * what happened.
 *
 * Left off this list on purpose: inflation (CPI/PPI). A hotter-than-expected
 * reading is bad for household budgets but is routinely read as bullish for
 * the currency on rate-hike odds — there is no one "good" direction to assign
 * it, so it stays at the default rather than being guessed at.
 */
const LOWER_IS_BETTER = [
  /unemployment/i,
  /\bclaims\b/i,
  /job\s*cuts/i,
  /redundanc/i,
  /bankruptc/i,
  /insolvenc/i,
];

export function isLowerBetter(name: string): boolean {
  return LOWER_IS_BETTER.some((pattern) => pattern.test(name));
}
