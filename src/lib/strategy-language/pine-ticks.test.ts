import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { runPineWithTicks, type PineBarPath } from "./pine-ticks";

const root = process.cwd();
const HOUR = 3_600_000;
const T0 = Date.UTC(2022, 2, 25, 8);

/** Runs the real isolated worker the way systemd does (stdin → stdout). */
function worker(input: unknown) {
  const out = spawnSync(process.execPath, ["--import", pathToFileURL(path.join(root, "node_modules/@nullarch/resin/register.mjs")).href, path.join(root, "workers/pine-resin-worker.mjs")], { input: JSON.stringify(input), encoding: "utf8", timeout: 30_000 });
  return JSON.parse(out.stdout) as { ok: boolean; error?: string; report?: { trades: { exitPrice: number }[]; fillBars?: number[]; tickBars?: number } };
}

const code = `//@version=6
strategy("Both levels in one bar", overlay=true)
if bar_index == 0
    strategy.entry("L", strategy.long)
strategy.exit("X", "L", stop=1.0990, limit=1.1010)
`;
// Bar 1 holds the stop and the target. Its high is nearer the open, so OHLC alone
// says the target came first; the ticks went down to the stop first.
const candles = [
  { timestamp: T0, open: "1.10000", high: "1.10020", low: "1.09980", close: "1.10000" },
  { timestamp: T0 + HOUR, open: "1.10000", high: "1.10120", low: "1.09850", close: "1.10000" },
  { timestamp: T0 + 2 * HOUR, open: "1.10000", high: "1.10020", low: "1.09980", close: "1.10000" },
];
const base = { code, candles, symbol: "EURUSD", timeframe: "1h", startingBalance: 10_000, dataSource: "dukascopy" };
const downFirst: PineBarPath = { i: 1, t: [0, 600_000, 1_200_000, HOUR - 1], p: [1.1, 1.0985, 1.1012, 1.1] };

describe("Pine strategy tests on ticks", () => {
  it("the worker fills on the tick path when one is given, and reports the fill bars", () => {
    const plain = worker(base);
    expect(plain.ok).toBe(true);
    expect(plain.report!.trades[0]!.exitPrice).toBeCloseTo(1.101, 6);
    expect(plain.report!.fillBars).toEqual([1]);
    const ticked = worker({ ...base, paths: [downFirst] });
    expect(ticked.report!.trades[0]!.exitPrice).toBeCloseTo(1.099, 6);
    expect(ticked.report!.tickBars).toBe(1);
  });

  it("the worker rejects a path outside its bar", () => {
    expect(worker({ ...base, paths: [{ ...downFirst, t: [0, HOUR], p: [1.1, 1.1] }] }).error).toMatch(/tick paths/);
  });

  it("reruns with paths on the fill bars, and keeps the first result when there are no ticks", async () => {
    const seen: (PineBarPath[] | undefined)[] = [];
    const run = async (paths?: PineBarPath[]) => { seen.push(paths); return worker(paths ? { ...base, paths } : base); };
    const result = await runPineWithTicks(run, async (indexes) => new Map(indexes.map((i) => [i, downFirst])));
    expect(result.report!.trades[0]!.exitPrice).toBeCloseTo(1.099, 6);
    expect(result.report!.fillBars).toBeUndefined();
    expect(seen.length).toBe(2); // the rerun fills on the same bar, so no third run

    seen.length = 0;
    const none = await runPineWithTicks(run, async () => new Map());
    expect(none.report!.trades[0]!.exitPrice).toBeCloseTo(1.101, 6);
    expect(seen.length).toBe(1);
  });
});
