/** Keep the instrument's tick precision while removing index-axis zero padding. */
export function chartPriceFormat(precision: number, pipSize: number) {
  const digits = Math.max(0, Math.min(8, precision));
  if (pipSize < 0.1) return { type: "price" as const, precision: digits, minMove: 1 / 10 ** digits };
  return {
    type: "custom" as const,
    minMove: 1 / 10 ** digits,
    formatter: (price: number) => Number(price.toFixed(digits)).toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: digits }),
  };
}

export function spreadReadout(symbol: string, spreadPips: number, pipSize: number) {
  const points = symbol.includes("IDX") || symbol === "DXY";
  const value = points ? spreadPips * pipSize : spreadPips;
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 3, useGrouping: false })} ${points ? "pts" : "pips"}`;
}
