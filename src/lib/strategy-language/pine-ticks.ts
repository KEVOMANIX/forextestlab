import type { IntrabarPath } from "@/lib/backtest/intrabar";

/** A chart bar's tick path, as the isolated Pine worker takes it. */
export type PineBarPath = { i: number } & IntrabarPath;

type PineResult = { ok?: boolean; report?: Record<string, unknown> & { kind?: string; fillBars?: number[]; tickBars?: number } };

/** The worker's limits on a path feed. */
export const PINE_MAX_PATH_BARS = 20_000;
export const PINE_MAX_PATH_POINTS = 4_000;

/**
 * Runs a Pine strategy test, then attaches tick paths to the bars where orders
 * filled and runs it again, so a stop and a target inside one bar fill in the
 * order price really reached them (Resin's bar magnifier, fed with ticks).
 * Repeats while the corrected run fills on bars not yet given ticks. Any
 * failure after the first run keeps the last good result.
 */
export async function runPineWithTicks<R extends PineResult>(
  run: (paths?: PineBarPath[]) => Promise<R>,
  attach: (indexes: number[], budgetMs: number) => Promise<Map<number, IntrabarPath>>,
  options: { maxReruns?: number; budgetMs?: number; now?: () => number } = {},
): Promise<R> {
  const now = options.now ?? Date.now;
  const deadline = now() + (options.budgetMs ?? 15_000);
  let result = await run();
  const paths = new Map<number, IntrabarPath>();
  const tried = new Set<number>();
  for (let round = 0; round < (options.maxReruns ?? 2); round++) {
    if (!result.ok || result.report?.kind !== "strategy") break;
    const fresh = (result.report.fillBars ?? []).filter((index) => Number.isInteger(index) && !tried.has(index)).slice(0, PINE_MAX_PATH_BARS - tried.size);
    const budget = deadline - now();
    if (fresh.length === 0 || budget <= 0) break;
    for (const index of fresh) tried.add(index);
    let added = 0;
    try {
      for (const [index, path] of await attach(fresh, budget)) {
        if (path.p.length >= 2 && path.p.length <= PINE_MAX_PATH_POINTS) { paths.set(index, path); added++; }
      }
    } catch { break; }
    if (added === 0) break;
    try {
      const next = await run([...paths].sort((a, b) => a[0] - b[0]).map(([i, path]) => ({ i, t: path.t, p: path.p })));
      if (!next.ok) break;
      result = next;
    } catch { break; }
  }
  if (result.report) delete result.report.fillBars;
  return result;
}
