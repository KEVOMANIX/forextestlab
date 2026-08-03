/**
 * Converts a configured spread from pips into the fractional price points
 * traders expect to see between quote buttons (for example, 1.4 EURUSD pips
 * at five-decimal precision is displayed as 14).
 */
export function spreadPointsLabel(
  spreadPips: number,
  pipSize: number,
  pricePrecision: number,
) {
  const pricePoint = 10 ** -pricePrecision;
  const points = pricePoint > 0 ? (spreadPips * pipSize) / pricePoint : spreadPips;
  const rounded = Math.round(points * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
