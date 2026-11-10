import { sendPine } from "./pine-sync";

/** The last Strategy Lab test of each saved script, kept with the script in the account. */
/** Where earlier versions kept results in the browser; moved into the account with the scripts. */
export const PINE_LEGACY_RESULTS_KEY = "forextestlab:pine-results:v1";

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

export function isPineSummary(value: unknown): value is PineTestSummary {
  const item = value as PineTestSummary | null;
  return Boolean(item && typeof item === "object" && finite(item.ranAt) && typeof item.symbol === "string" && typeof item.timeframe === "string"
    && typeof item.from === "string" && typeof item.through === "string" && finite(item.netPnl) && finite(item.netPercent)
    && (item.profitFactor === null || finite(item.profitFactor)) && finite(item.winRate) && finite(item.trades) && finite(item.maxDrawdownPercent)
    && Array.isArray(item.equity) && item.equity.length <= 200 && item.equity.every(finite));
}

let cache: Record<string, PineTestSummary> = {};

/** Filled by loadPineScripts() from the account. */
export function setPineResultsCache(value: Record<string, unknown>): void {
  cache = Object.fromEntries(Object.entries(value).filter(([, summary]) => isPineSummary(summary))) as Record<string, PineTestSummary>;
}

export function readPineResults(): Record<string, PineTestSummary> {
  return { ...cache };
}

export function savePineResult(scriptId: string, summary: PineTestSummary): Promise<boolean> {
  cache = { ...cache, [scriptId]: summary };
  return sendPine("PUT", { action: "result", id: scriptId, result: summary });
}

/** Deleting the script deletes its result in the account; this forgets it on the page. */
export function deletePineResult(scriptId: string): void {
  cache = { ...cache };
  delete cache[scriptId];
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
