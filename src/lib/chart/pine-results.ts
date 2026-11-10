/** The last Strategy Lab test of each saved script, for the Strategy Lab dashboard. */
export const PINE_RESULTS_KEY = "forextestlab:pine-results:v1";

export type PineTestSummary = {
  ranAt: number;
  symbol: string;
  timeframe: string;
  from: string;
  through: string;
  netPnl: number;
  netPercent: number;
  profitFactor: number | null;
  winRate: number;
  trades: number;
  maxDrawdownPercent: number;
  /** Realized balance, sampled to at most 40 points, for the card's equity line. */
  equity: number[];
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function isSummary(value: unknown): value is PineTestSummary {
  const item = value as PineTestSummary | null;
  return Boolean(item && finite(item.ranAt) && typeof item.symbol === "string" && typeof item.timeframe === "string" && finite(item.netPercent) && finite(item.winRate) && finite(item.trades) && Array.isArray(item.equity));
}

export function readPineResults(): Record<string, PineTestSummary> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PINE_RESULTS_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, summary]) => isSummary(summary))) as Record<string, PineTestSummary>;
  } catch { return {}; }
}

function write(results: Record<string, PineTestSummary>) {
  try { localStorage.setItem(PINE_RESULTS_KEY, JSON.stringify(results)); } catch { /* Results are a convenience. */ }
}

export function savePineResult(scriptId: string, summary: PineTestSummary): void {
  write({ ...readPineResults(), [scriptId]: summary });
}

export function deletePineResult(scriptId: string): void {
  const results = readPineResults();
  delete results[scriptId];
  write(results);
}

/** Evenly spaced samples of a series, always keeping the last value. */
export function sampleEquity(values: number[], count = 40): number[] {
  if (values.length <= count) return values.slice();
  const step = (values.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, index) => values[Math.round(index * step)]!);
}

/** Largest fall from a peak, as a percentage of that peak. */
export function maxDrawdownPercent(values: number[]): number {
  let peak = -Infinity, worst = 0;
  for (const value of values) { peak = Math.max(peak, value); if (peak > 0) worst = Math.max(worst, (peak - value) / peak * 100); }
  return worst;
}
