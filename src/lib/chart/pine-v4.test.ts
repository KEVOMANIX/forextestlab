import { describe, expect, it } from "vitest";
import { convertPineV4, isPineV4 } from "./pine-v4";
import { runPineIndicator, type PineSeriesInput } from "./pine-runner";

function series(length: number): PineSeriesInput {
  const closes = Array.from({ length }, (_, index) => 1.1 + Math.sin(index / 7) * 0.01 + index * 0.00005);
  const f = (values: number[]) => Float64Array.from(values);
  return {
    time: f(closes.map((_, index) => Date.UTC(2024, 2, 4) + index * 900_000)),
    open: f(closes.map((close, index) => closes[index - 1] ?? close)), high: f(closes.map((close) => close + 0.0006)),
    low: f(closes.map((close) => close - 0.0006)), close: f(closes), volume: f(closes.map((_, index) => 100 + (index % 7) * 10)),
  };
}
const options = { symbol: "EURUSD", timeframeMs: 900_000, precision: 5 };

const SCRIPTS: Record<string, string> = {
  macd: `//@version=4
study(title="MACD", shorttitle="MACD", resolution="")
fast_length = input(title="Fast Length", type=input.integer, defval=12)
slow_length = input(title="Slow Length", type=input.integer, defval=26)
src = input(title="Source", type=input.source, defval=close)
signal_length = input(title="Signal Smoothing", type=input.integer, minval = 1, maxval = 50, defval = 9)
sma_source = input(title="Simple MA (Oscillator)", type=input.bool, defval=false)
fast_ma = sma_source ? sma(src, fast_length) : ema(src, fast_length)
slow_ma = sma_source ? sma(src, slow_length) : ema(src, slow_length)
macd = fast_ma - slow_ma
signal = ema(macd, signal_length)
hist = macd - signal
plot(hist, title="Histogram", style=plot.style_columns, color=(hist>=0 ? (hist[1] < hist ? #26A69A : #B2DFDB) : (hist[1] < hist ? #FFCDD2 : #EF5350) ), transp=0)
plot(macd, title="MACD", color=#0094ff, transp=0)
plot(signal, title="Signal", color=#ff6a00, transp=0)
`,
  supertrend: `//@version=4
study("Supertrend", overlay = true)
Periods = input(title="ATR Period", type=input.integer, defval=10)
src = input(hl2, title="Source")
Multiplier = input(title="ATR Multiplier", type=input.float, step=0.1, defval=3.0)
changeATR= input(title="Change ATR Calculation Method ?", type=input.bool, defval=true)
atr2 = sma(tr, Periods)
atr= changeATR ? atr(Periods) : atr2
up=src-(Multiplier*atr)
up1 = nz(up[1],up)
up := close[1] > up1 ? max(up,up1) : up
dn=src+(Multiplier*atr)
dn1 = nz(dn[1], dn)
dn := close[1] < dn1 ? min(dn, dn1) : dn
trend = 1
trend := nz(trend[1], trend)
trend := trend == -1 and close > dn1 ? 1 : trend == 1 and close < up1 ? -1 : trend
upPlot = plot(trend == 1 ? up : na, title="Up Trend", style=plot.style_linebr, linewidth=2, color=color.green)
buySignal = trend == 1 and trend[1] == -1
plotshape(buySignal ? up : na, title="UpTrend Begins", location=location.absolute, style=shape.circle, size=size.tiny, color=color.green, transp=0)
dnPlot = plot(trend == 1 ? na : dn, title="Down Trend", style=plot.style_linebr, linewidth=2, color=color.red)
mPlot = plot(ohlc4, title="", style=plot.style_circles, linewidth=0)
longFillColor = trend == 1 ? color.green : color.white
fill(mPlot, upPlot, title="UpTrend Highligter", color=longFillColor, transp=90)
`,
  bollinger: `//@version=4
study(shorttitle="BB", title="Bollinger Bands", overlay=true)
length = input(20, minval=1)
src = input(close, title="Source")
mult = input(2.0, minval=0.001, maxval=50, title="StdDev")
basis = sma(src, length)
dev = mult * stdev(src, length)
upper = basis + dev
lower = basis - dev
plot(basis, "Basis", color=#872323)
p1 = plot(upper, "Upper", color=color.teal)
p2 = plot(lower, "Lower", color=color.teal)
fill(p1, p2, title = "Background", color=#198787, transp=95)
`,
  rsi: `//@version=4
study(title="Relative Strength Index", shorttitle="RSI")
len = input(14, minval=1, title="Length")
src = input(close, "Source", type = input.source)
up = rma(max(change(src), 0), len)
down = rma(-min(change(src), 0), len)
rsi = down == 0 ? 100 : up == 0 ? 0 : 100 - (100 / (1 + up / down))
plot(rsi, "RSI", color=#8E1599)
band1 = hline(70, "Upper Band", color=#C0C0C0)
band0 = hline(30, "Lower Band", color=#C0C0C0)
fill(band1, band0, color=#9915FF, transp=90, title="Background")
bgcolor(rsi > 70 ? color.red : na, transp=85)
label = iff(crossover(rsi, 50), 1, iff(crossunder(rsi, 50), -1, 0))
plotarrow(label)
`,
  ownNames: `//@version=4
study("Own names")
tr = high - low // the script's own "tr", not the built-in
max(a, b) => a > b ? a : b
x = max(tr, 0.0001)
plot(sma(x, 5), "Range")
plot(abs(change(close)), "Move") // sma( in a comment stays
label_text = "sma(close, 10)"
`,
  vwapBands: `//@version=4
study("VWAP band", overlay=true)
v = vwap
dist = atr(14)
plot(v, color=color.orange)
plot(v + dist, color=color.gray, transp=50)
plot(v - dist, color=color.gray, transp=50)
`,
};

describe("Pine v4 conversion", () => {
  it("detects v4 scripts", () => {
    expect(isPineV4(SCRIPTS.macd!)).toBe(true);
    expect(isPineV4('//@version=5\nindicator("X")')).toBe(false);
  });

  it("rewrites the v4 surface to v5", () => {
    const macd = convertPineV4(SCRIPTS.macd!);
    expect(macd).toContain("//@version=5");
    expect(macd).toContain('indicator(title="MACD", shorttitle="MACD", timeframe="")');
    expect(macd).toContain('input.int(title="Fast Length", defval=12)');
    expect(macd).toContain('input.source(title="Source", defval=close)');
    expect(macd).toContain("ta.ema(src, fast_length)");
    expect(macd).toContain("color=color.new(#0094ff, 0)");
    expect(macd).not.toContain("transp");

    const rsi = convertPineV4(SCRIPTS.rsi!);
    expect(rsi).toContain('input.source(close, "Source")');
    expect(rsi).toContain("ta.rma(math.max(ta.change(src), 0), len)");
    expect(rsi).toContain("(ta.crossover(rsi, 50) ? 1 : (ta.crossunder(rsi, 50) ? -1 : 0))");
    expect(rsi).toContain("bgcolor(color.new(rsi > 70 ? color.red : na, 85))");

    const own = convertPineV4(SCRIPTS.ownNames!);
    expect(own).toContain("x = max(tr, 0.0001)");
    expect(own).toContain("ta.sma(x, 5)");
    expect(own).toContain("math.abs(ta.change(close))");
    expect(own).toContain("// sma( in a comment stays");
    expect(own).toContain('"sma(close, 10)"');

    expect(convertPineV4(SCRIPTS.supertrend!)).toContain("ta.sma(ta.tr, Periods)");
    // v4 fill()/bgcolor() default to 90% transparency.
    expect(convertPineV4('//@version=4\nstudy("X")\np1 = plot(close)\np2 = plot(open)\nfill(p1, p2, color=c)\nbgcolor(color.red)\nbgcolor(color.new(color.red, 50))\nfill(p1, p2, #FF000080)\n'))
      .toMatch(/fill\(p1, p2, color=color\.new\(c, 90\)\)\nbgcolor\(color\.new\(color\.red, 90\)\)\nbgcolor\(color\.new\(color\.red, 50\)\)\nfill\(p1, p2, #FF000080\)/);
    expect(convertPineV4(SCRIPTS.vwapBands!)).toContain("v = ta.vwap");
  });

  for (const [name, code] of Object.entries(SCRIPTS)) {
    it(`runs the converted ${name} script`, () => {
      const result = runPineIndicator(code, series(300), options);
      if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.diagnostics)}\n${convertPineV4(code)}`);
      expect(result.converted).toBe(true);
      expect(result.plots.some((plot) => plot.values.some((value) => value != null))).toBe(true);
    });
  }
});
