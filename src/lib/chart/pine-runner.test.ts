import { describe, expect, it } from "vitest";
import { pineTimeframe, runPineIndicator, type PineSeriesInput } from "./pine-runner";

function series(closes: number[]): PineSeriesInput {
  const f = (values: number[]) => Float64Array.from(values);
  return {
    time: f(closes.map((_, index) => 1_700_000_000_000 + index * 900_000)),
    open: f(closes), high: f(closes.map((close) => close + 0.0005)), low: f(closes.map((close) => close - 0.0005)), close: f(closes), volume: f(closes.map(() => 0)),
  };
}
const options = { symbol: "EURUSD", timeframeMs: 900_000, precision: 5 };
const SMA = '//@version=6\nindicator("Basis", overlay=true)\nplot(ta.sma(close, 3), "Basis", color=color.blue, linewidth=2)\n';

describe("chart Pine runner", () => {
  it("plots one value per candle", () => {
    const result = runPineIndicator(SMA, series([1, 2, 3, 4, 5]), options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overlay).toBe(true);
    expect(result.plots).toHaveLength(1);
    expect(result.plots[0]!.title).toBe("Basis");
    expect(result.plots[0]!.values.map((value) => (value == null ? null : Math.round(value * 1000) / 1000))).toEqual([null, null, 2, 3, 4]);
  });

  it("follows the forming candle as its price moves", () => {
    const first = runPineIndicator(SMA, series([1, 2, 3, 4, 5]), options);
    const moved = runPineIndicator(SMA, series([1, 2, 3, 4, 8]), options);
    expect(first.ok && moved.ok).toBe(true);
    if (!first.ok || !moved.ok) return;
    expect(moved.plots[0]!.values.at(-1)).toBeCloseTo(5);
    expect(first.plots[0]!.values.at(-1)).toBeCloseTo(4);
  });

  it("reports syntax errors with their line", () => {
    const result = runPineIndicator('//@version=6\nindicator("X")\nplot(ta.sma(close, ))\n', series([1, 2, 3]), options);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics?.[0]?.line).toBe(3);
  });

  it("keeps strategies and other feeds off the chart", () => {
    expect(runPineIndicator('//@version=6\nstrategy("S")\n', series([1, 2]), options)).toMatchObject({ ok: false, error: expect.stringContaining("Strategy Lab") });
    expect(runPineIndicator('//@version=6\nindicator("X")\nplot(request.security("GBPUSD", "60", close))\n', series([1, 2]), options)).toMatchObject({ ok: false });
    expect(runPineIndicator('indicator("X")\nplot(close)\n', series([1, 2]), options)).toMatchObject({ ok: false, error: expect.stringContaining("version=6") });
  });

  it("maps candle lengths to Pine timeframes", () => {
    expect(pineTimeframe(60_000)).toBe("1");
    expect(pineTimeframe(3_600_000)).toBe("60");
    expect(pineTimeframe(86_400_000)).toBe("D");
    expect(pineTimeframe(604_800_000)).toBe("W");
    expect(pineTimeframe(30 * 86_400_000)).toBe("M");
  });
});
