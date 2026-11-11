import { describe, expect, it } from "vitest";
import { hlinePricesFromSource, pineTimeframe, runPineIndicator, runPineIndicatorOn, type PineSeriesInput } from "./pine-runner";

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
    expect(runPineIndicator('//@version=3\nstudy("X")\nplot(close)\n', series([1, 2]), options)).toMatchObject({ ok: false });
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
    expect(result.shapes[0]).toMatchObject({ kind: "shape", title: "Up", style: "triangleup", location: "bottom", text: "B", overlay: false });
    expect(result.shapes[0]!.points.length).toBeGreaterThan(0);
    expect(result.skipped).toContain("barcolor()");
  });

  it("reads hline prices the compiler leaves open", () => {
    const code = ['//@version=5', 'indicator("X")', 'upper = input.int(70, "Upper")', "lower = input.float(defval=-30.5)", "mid = 0", "hline(upper)", "hline(-20)", 'hline(lower, "Low")', "hline(mid)", "hline(-upper)", "hline(ta.sma(close, 2))"].join("\n");
    expect(hlinePricesFromSource(code)).toEqual([70, -20, -30.5, 0, -70, null]);
  });
});

describe("chart Pine drawings", () => {
  const closes = Array.from({ length: 40 }, (_, index) => 1 + index * 0.001);
  const data = () => {
    const f = (values: number[]) => Float64Array.from(values);
    return { time: f(closes.map((_, index) => Date.UTC(2024, 2, 4) + index * 900_000)), open: f(closes), high: f(closes.map((close) => close + 0.0005)), low: f(closes.map((close) => close - 0.0005)), close: f(closes), volume: f(closes.map(() => 0)) };
  };
  const options = { symbol: "EURUSD", timeframeMs: 900_000, precision: 5 };

  it("keeps live drawings, drops deleted ones, applies the count limit and records table cells", () => {
    const result = runPineIndicator(`//@version=5
indicator("D", overlay=true, max_lines_count=5)
var boxes = array.new_box()
if bar_index % 10 == 0
    boxes.unshift(box.new(bar_index, high, bar_index + 3, low, bgcolor=color.new(color.blue, 80)))
    if boxes.size() > 2
        boxes.pop().delete()
line.new(bar_index, high, bar_index + 1, high, color=color.red)
if barstate.islast
    label.new(bar_index, high, "Last", textcolor=chart.fg_color, color=#ffffff00)
    var t = table.new(position.top_right, 2, 2, bgcolor=chart.bg_color)
    table.cell(t, 0, 0, "Range")
    table.cell(t, 1, 0, "12%")
`, data(), { ...options, theme: "dark" });
    if (!result.ok) throw new Error(result.error);
    const count = (kind: string) => result.drawings.filter((drawing) => drawing.kind === kind).length;
    expect(count("box")).toBe(2);
    expect(count("line")).toBe(5);
    expect(count("label")).toBe(1);
    const label = result.drawings.find((drawing) => drawing.kind === "label")!;
    expect(label.state).toMatchObject({ text: "Last", textcolor: "#D1D4DC" });
    const table = result.drawings.find((drawing) => drawing.kind === "table")!;
    expect(table.state).toMatchObject({ position: "top_right", "cell:0,0": "Range", "cell:1,0": "12%" });
    expect(result.skipped).toEqual([]);
  });
});

describe("timeframe-limited scripts", () => {
  it("draws nothing above the script's own timeframe limit until the input is raised", async () => {
    const { applyPineInputs, parsePineInputs } = await import("./pine-inputs");
    const code = `//@version=6
indicator("KZP", "KZP [TFO]", true)
tf_limit = input.timeframe("30", "Timeframe Limit")
if timeframe.in_seconds("") <= timeframe.in_seconds(tf_limit)
    box.new(bar_index, high, bar_index + 1, low)
`;
    const closes = Array.from({ length: 30 }, (_, index) => 1 + index * 0.001);
    const f = (values: number[]) => Float64Array.from(values);
    const data = () => ({ time: f(closes.map((_, index) => Date.UTC(2024, 2, 4) + index * 3_600_000)), open: f(closes), high: f(closes.map((close) => close + 0.001)), low: f(closes.map((close) => close - 0.001)), close: f(closes), volume: f(closes.map(() => 0)) });
    const hourly = { symbol: "EURUSD", timeframeMs: 3_600_000, precision: 5 };
    const before = runPineIndicator(code, data(), hourly);
    expect(before.ok && before.drawings.length).toBe(0);
    const input = parsePineInputs(code)[0]!;
    expect(input).toMatchObject({ kind: "timeframe", title: "Timeframe Limit", defval: "30" });
    const after = runPineIndicator(applyPineInputs(code, { [input.key]: "240" }), data(), hourly);
    expect(after.ok && after.drawings.length).toBeGreaterThan(0);
  });
});

describe("request.security on the chart", () => {
  const bars = 96 * 3;
  const closes = Array.from({ length: bars }, (_, index) => 1.1 + Math.sin(index / 20) * 0.01);
  const f = (values: number[]) => Float64Array.from(values);
  const data = () => ({ time: f(closes.map((_, index) => Date.UTC(2024, 2, 4) + index * 900_000)), open: f(closes), high: f(closes.map((close) => close + 0.0005)), low: f(closes.map((close) => close - 0.0005)), close: f(closes), volume: f(closes.map(() => 1)) });
  const options = { symbol: "EURUSD", timeframeMs: 900_000, precision: 5 };
  const run = (line: string, extra = "") => runPineIndicator(`//@version=5\nindicator("S", overlay=true)\n${extra}v = ${line}\nplot(v)\n`, data(), options);

  it("builds higher timeframes of the chart's own market", () => {
    for (const [line, extra] of [
      ['request.security(syminfo.tickerid, "D", high)', ""],
      ['request.security(syminfo.ticker, "240", close)', ""],
      ['request.security(syminfo.tickerid, "D", high[1], lookahead = barmerge.lookahead_on)', ""],
      ["request.security(syminfo.tickerid, tf, close)", 'tf = input.timeframe("60", "TF")\n'],
      ['request.security(sym, "D", close)', 'sym = input.symbol("", "Symbol")\n'],
    ]) {
      const result = run(line!, extra);
      if (!result.ok) throw new Error(`${line}: ${result.error}`);
      expect(result.plots[0]!.values.some((value) => value != null)).toBe(true);
    }
  });

  it("refuses data the chart does not have", () => {
    expect(run('request.security("GBPUSD", "D", close)')).toMatchObject({ ok: false, error: expect.stringContaining("another market") });
    expect(run('request.security(syminfo.tickerid, "5", close)')).toMatchObject({ ok: false, error: expect.stringContaining("lower than the chart") });
    expect(run('request.financial(syminfo.tickerid, "EBITDA", "FQ")')).toMatchObject({ ok: false, error: expect.stringContaining("request.financial") });
  });
});

describe("chart Pine exchange time", () => {
  // Two days of 15m candles in January (New York is UTC-5) and two in July (UTC-4).
  const candles = (start: number) => {
    const f = (values: number[]) => Float64Array.from(values);
    const closes = Array.from({ length: 192 }, (_, index) => 1.1 + Math.sin(index / 7) * 0.002);
    return { time: f(closes.map((_, index) => start + index * 900_000)), open: f(closes), high: f(closes.map((close) => close + 0.0005)), low: f(closes.map((close) => close - 0.0005)), close: f(closes), volume: f(closes.map(() => 0)) };
  };
  const ASIA = [
    "//@version=5",
    'indicator("Asia", overlay=true)',
    'asia = input.session("1900-0001", "Asia")',
    "in_session(sess) => not na(time(timeframe.period, sess))",
    "var int start = na",
    "start := in_session(asia) and not in_session(asia)[1] ? time : start",
    "_box = box(na)",
    "if in_session(asia)",
    "    box.delete(_box[1])",
    "    _box := box.new(start, high, time, low, xloc=xloc.bar_time)",
    "plot(hour)",
  ].join("\n");
  const boxes = (start: number) => {
    const result = runPineIndicator(ASIA, candles(start), options);
    expect(result.ok).toBe(true);
    return result.ok ? result.drawings.filter((drawing) => drawing.kind === "box" && !drawing.state.__deleted && Number.isFinite(drawing.state.left)) : [];
  };

  it("reads sessions in New York time like TradingView's forex symbols", () => {
    const winter = boxes(Date.UTC(2026, 0, 5));
    expect(new Date(Number(winter[0]!.state.left)).toISOString()).toBe("2026-01-06T00:00:00.000Z");
    expect(winter.length).toBeGreaterThan(0);
    expect(new Date(Number(winter[0]!.state.right)).toISOString()).toBe("2026-01-06T05:00:00.000Z");
    const summer = boxes(Date.UTC(2026, 6, 6));
    expect(new Date(Number(summer[0]!.state.left)).toISOString()).toBe("2026-07-06T23:00:00.000Z");
  });

  it("gives hour in New York time", () => {
    const result = runPineIndicator(ASIA, candles(Date.UTC(2026, 0, 5)), options);
    expect(result.ok && result.plots[0]!.values[0]).toBe(19);
  });
});

describe("chart Pine trading day", () => {
  // 15m candles from Monday 2026-01-05 00:00 UTC; each candle's high is its own index.
  const start = Date.UTC(2026, 0, 5);
  const count = 4 * 24 * 2;
  const f = (values: number[]) => Float64Array.from(values);
  const index = Array.from({ length: count }, (_, i) => i);
  const data = { time: f(index.map((i) => start + i * 900_000)), open: f(index), high: f(index), low: f(index), close: f(index), volume: f(index.map(() => 0)) };
  const run = (line: string) => {
    const result = runPineIndicator(`//@version=5\nindicator("D", overlay=true)\nplot(${line})\n`, data, options);
    expect(result.ok).toBe(true);
    return result.ok ? result.plots[0]!.values : [];
  };
  const at = (hour: number) => (hour * 60) / 15; // candle index at that many hours after the start

  it("starts the forex day at 17:00 New York", () => {
    const opens = run("time('D')");
    expect(new Date(opens[at(21)]!).toISOString()).toBe("2026-01-04T22:00:00.000Z");
    expect(new Date(opens[at(22)]!).toISOString()).toBe("2026-01-05T22:00:00.000Z");
  });

  it("builds request.security daily candles on that day", () => {
    const low = run("request.security(syminfo.tickerid, 'D', low, lookahead=barmerge.lookahead_on)");
    expect(low[at(21)]).toBe(0);
    expect(low[at(22)]).toBe(at(22));
    expect(low[at(30)]).toBe(at(22));
  });
});

describe("indicator timeframe setting", () => {
  const CLOSE = '//@version=6\nindicator("C", overlay=true)\nplot(close, "C")\nplotshape(close > 5, "Up")\n';
  it("runs on higher-timeframe candles and spreads them over the chart", () => {
    const result = runPineIndicatorOn("60", CLOSE, series([1, 2, 3, 4, 5, 6, 7, 8]), options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plots[0]!.values).toEqual([4, 4, 4, 4, 8, 8, 8, 8]);
    expect(result.shapes[0]!.points.map((point) => point.index)).toEqual([7]);
  });
  it("leaves the chart timeframe as it is", () => {
    const result = runPineIndicatorOn("15", CLOSE, series([1, 2, 3]), options);
    expect(result.ok && result.plots[0]!.values).toEqual([1, 2, 3]);
  });
});
