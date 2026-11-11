import { describe, expect, it } from "vitest";
import { positionalDrawingArgs, runPineIndicator, type PineSeriesInput } from "./pine-runner";

function series(closes: number[]): PineSeriesInput {
  const f = (values: number[]) => Float64Array.from(values);
  return {
    time: f(closes.map((_, index) => 1_700_000_000_000 + index * 900_000)),
    open: f(closes.map((close) => close - 0.1)), high: f(closes.map((close) => close + 0.5)), low: f(closes.map((close) => close - 0.5)), close: f(closes), volume: f(closes.map(() => 0)),
  };
}
const options = { symbol: "EURUSD", timeframeMs: 900_000, precision: 5 };
const run = (body: string) => runPineIndicator(`//@version=6\nindicator("V", overlay=true)\n${body}`, series([1, 2, 3, 4, 5, 6]), options);

describe("chart Pine visuals", () => {
  it("returns barcolor() per candle", () => {
    const result = run("barcolor(close > 3 ? color.green : color.red)\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual([]);
    expect(result.barcolors).toHaveLength(1);
    expect(result.barcolors![0]!.colors?.length).toBe(6);
  });
  it("returns plotcandle() and plotbar() values", () => {
    const result = run("plotcandle(open, high, low, close, \"C\", color=color.teal)\nplotbar(open, high, low, close, \"B\")\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candles?.map((item) => item.kind)).toEqual(["candle", "bar"]);
    expect(result.candles![0]!.close).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("draws polylines from chart points", () => {
    const result = run("if barstate.islast\n    pts = array.from(chart.point.from_index(bar_index - 2, low), chart.point.from_index(bar_index, high))\n    polyline.new(pts, line_color = color.red, line_width = 2)\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const poly = result.drawings.find((drawing) => drawing.kind === "polyline");
    expect(poly).toBeTruthy();
    expect(JSON.parse(String(poly!.state.points))).toEqual([[3, null, 5.5], [5, null, 6.5]]);
    expect(poly!.state.line_width).toBe(2);
    expect(result.drawings.some((drawing) => drawing.kind === "label")).toBe(false);
  });
  it("fills between two lines", () => {
    const result = run("if barstate.islast\n    a = line.new(bar_index - 3, high, bar_index, high)\n    b = line.new(bar_index - 3, low, bar_index, low)\n    linefill.new(a, b, color.new(color.blue, 80))\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fill = result.drawings.find((drawing) => drawing.kind === "linefill");
    expect(fill?.state).toMatchObject({ ax1: 2, ax2: 5, ay1: 6.5, by1: 5.5 });
  });
  it("rewrites named drawing arguments as positional ones", () => {
    expect(positionalDrawingArgs("polyline.new(pts, line_color = color.red, closed = true)")).toBe("polyline.new(pts, na, true, na, color.red)");
  });
});

describe("request.security on other markets and lower timeframes", () => {
  const t0 = Date.UTC(2024, 0, 2);
  const hourly = (() => { const f = (values: number[]) => Float64Array.from(values); const c = [1, 2, 3, 4]; return { time: f(c.map((_, i) => t0 + i * 3_600_000)), open: f(c), high: f(c), low: f(c), close: f(c), volume: f(c.map(() => 0)) }; })();
  const hourOptions = { symbol: "EURUSD", timeframeMs: 3_600_000, precision: 5 };
  const feed = (offset: number) => { const times = Array.from({ length: 16 }, (_, i) => t0 + i * 900_000); const values = times.map((_, i) => offset + i); return { time: times, open: values, high: values, low: values, close: values, volume: values.map(() => 0), timeframe: "15" }; };
  const code = '//@version=6\nindicator("S")\nplot(request.security("OANDA:GBPUSD", "15", close))\nplot(request.security(syminfo.tickerid, "15", close))\n';
  it("asks for the candles it needs", () => {
    const result = runPineIndicator(code, hourly, hourOptions);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.needs?.map((need) => [need.key, need.symbol, need.timeframe])).toEqual([["OANDA:GBPUSD:15", "GBPUSD", "15m"], ["FTL:EURUSD:15", "EURUSD", "15m"]]);
  });
  it("reads them once loaded", () => {
    const result = runPineIndicator(code, hourly, { ...hourOptions, feeds: { "OANDA:GBPUSD:15": feed(1000), "FTL:EURUSD:15": feed(100) } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plots[0]!.values).toEqual([1003, 1007, 1011, 1015]);
    expect(result.plots[1]!.values).toEqual([103, 107, 111, 115]);
  });
  it("still reads this market's higher timeframes from the chart", () => {
    const result = runPineIndicator('//@version=6\nindicator("S")\nplot(request.security(syminfo.tickerid, "240", close))\n', hourly, hourOptions);
    expect(result.ok).toBe(true);
  });
});
