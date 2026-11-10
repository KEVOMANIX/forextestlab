import { describe, expect, it } from "vitest";
import { hlinePricesFromSource, pineTimeframe, runPineIndicator, type PineSeriesInput } from "./pine-runner";

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
    expect(runPineIndicator('indicator("X")\nplot(close)\n', series([1, 2]), options)).toMatchObject({ ok: false, error: expect.stringContaining("@version") });
    expect(runPineIndicator('//@version=4\nstudy("X")\nplot(close)\n', series([1, 2]), options)).toMatchObject({ ok: false });
  });

  it("maps candle lengths to Pine timeframes", () => {
    expect(pineTimeframe(60_000)).toBe("1");
    expect(pineTimeframe(3_600_000)).toBe("60");
    expect(pineTimeframe(86_400_000)).toBe("D");
    expect(pineTimeframe(604_800_000)).toBe("W");
    expect(pineTimeframe(30 * 86_400_000)).toBe("M");
  });

  it("runs version 5 scripts", () => {
    const result = runPineIndicator('//@version=5\nindicator("Basis", overlay=true)\nplot(ta.sma(close, 2))\n', series([1, 2, 3]), options);
    expect(result.ok).toBe(true);
  });

  it("returns styles, levels, fills, backgrounds and markers", () => {
    const closes = Array.from({ length: 80 }, (_, index) => 1 + Math.sin(index / 5) * 0.01);
    const result = runPineIndicator(`//@version=5
indicator("RSI", overlay=false)
r = ta.rsi(close, 14)
plot(r, "RSI", color = r > 50 ? color.green : color.red, style=plot.style_histogram, histbase=50)
h1 = hline(70, "Upper", linestyle=hline.style_dashed)
h2 = hline(30, "Lower")
fill(h1, h2, color=color.new(color.purple, 90))
bgcolor(r > 60 ? color.new(color.green, 85) : na)
plotshape(ta.crossover(r, 50), "Up", shape.triangleup, location.bottom, color.lime, text="B")
barcolor(color.red)
`, series(closes), options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overlay).toBe(false);
    expect(result.plots[0]).toMatchObject({ title: "RSI", style: "histogram", histbase: 50 });
    expect(result.plots[0]!.colors?.some((color) => color === "#4CAF50")).toBe(true);
    expect(result.hlines.map((line) => [line.price, line.linestyle])).toEqual([[70, "dashed"], [30, "solid"]]);
    expect(result.fills[0]).toMatchObject({ a: { kind: "hline", index: 0 }, b: { kind: "hline", index: 1 }, color: "#9C27B019" });
    expect(result.backgrounds[0]!.colors?.some((color) => color === "#4CAF5026")).toBe(true);
    expect(result.markers.length).toBeGreaterThan(0);
    expect(result.markers[0]).toMatchObject({ position: "belowBar", shape: "arrowUp", text: "B", overlay: false });
    expect(result.skipped).toContain("barcolor()");
  });

  it("reads hline prices the compiler leaves open", () => {
    const code = ['//@version=5', 'indicator("X")', 'upper = input.int(70, "Upper")', "lower = input.float(defval=-30.5)", "mid = 0", "hline(upper)", "hline(-20)", 'hline(lower, "Low")', "hline(mid)", "hline(-upper)", "hline(ta.sma(close, 2))"].join("\n");
    expect(hlinePricesFromSource(code)).toEqual([70, -20, -30.5, 0, -70, null]);
  });
});
