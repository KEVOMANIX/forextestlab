import { describe, expect, it } from "vitest";
import { pineCandleKey, samePineScope } from "./pine-run-key";
import { runPineIndicator, type PineIndicatorResult, type PineSeriesInput } from "./pine-runner";

/**
 * Regression: a saved replay session opened straight on 1D showed almost none
 * of a daily-bias script's historical BUY/SELL labels and first-touch markers,
 * while 1D -> 15m -> 1D showed them all. The scripts re-ran only when the
 * newest candle moved, and the 1D history page arrived after the restored
 * script's first run without moving it.
 */

const DAY = 86_400_000;
type Bar = { timestamp: number; open: number; high: number; low: number; close: number };

// Daily-bias style script: yesterday's range sets the bias, a close beyond it
// prints BUY/SELL, and the first touch of yesterday's midpoint is marked.
const DAILY_BIAS = `//@version=6
indicator("ForexTestLab Daily Bias", overlay=true, max_labels_count=500)
pdh = high[1]
pdl = low[1]
mid = (pdh + pdl) / 2
if close > pdh
    label.new(bar_index, low, "BUY", style=label.style_label_up, color=color.green, textcolor=color.white)
if close < pdl
    label.new(bar_index, high, "SELL", style=label.style_label_down, color=color.red, textcolor=color.white)
plotshape(low <= mid and high >= mid, "First touch", shape.circle, location.abovebar, color.orange)
`;

/** Weekday EUR/USD-like daily candles, deterministic. */
function dailyBars(from: string, to: string): Bar[] {
  const bars: Bar[] = [];
  let price = 1.16;
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) {
    const weekday = new Date(t).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const step = Math.sin(t / DAY / 3.1) * 0.004 + Math.cos(t / DAY / 7.3) * 0.003;
    const open = price, close = price + step;
    bars.push({ timestamp: t, open, high: Math.max(open, close) + 0.0015, low: Math.min(open, close) - 0.0015, close });
    price = close;
  }
  return bars;
}

function series(bars: Bar[]): PineSeriesInput {
  const f = (pick: (bar: Bar) => number) => Float64Array.from(bars.map(pick));
  return { time: f((bar) => bar.timestamp), open: f((bar) => bar.open), high: f((bar) => bar.high), low: f((bar) => bar.low), close: f((bar) => bar.close), volume: f(() => 0) };
}

/** BUY/SELL labels and first-touch markers by candle time, which is what the chart draws. */
function signals(result: PineIndicatorResult, bars: Bar[]) {
  expect(result.ok).toBe(true);
  if (!result.ok) return { labels: [], touches: [] };
  const labels = result.drawings
    .filter((drawing) => drawing.kind === "label")
    .map((drawing) => `${bars[Number(drawing.state.x)]?.timestamp}:${drawing.state.text}`)
    .sort();
  const touches = result.shapes.flatMap((shape) => shape.points.map((point) => bars[point.index]!.timestamp)).sort((a, b) => a - b);
  return { labels, touches };
}

/**
 * The chart's script scheduling as PriceChart + usePineIndicators wire it: the
 * scripts run on history + revealed candles whenever the run key changes.
 */
class DailyChart {
  history: Bar[] = [];
  revision = 0;
  runs = 0;
  private key = "";
  result: PineIndicatorResult | null = null;
  constructor(private revealed: Bar[]) {}
  candles() { return [...this.history, ...this.revealed]; }
  setHistory(next: Bar[]) { if (next !== this.history) { this.history = next; this.revision++; } this.sync(); }
  sync() {
    const key = pineCandleKey(this.revealed.at(-1), this.revealed.length, this.revealed.length, this.revision);
    if (key === this.key) return;
    this.key = key;
    this.runs++;
    this.result = runPineIndicator(DAILY_BIAS, series(this.candles()), { symbol: "EURUSD", timeframeMs: DAY, precision: 5 });
  }
}

const history = dailyBars("2021-01-04T00:00:00Z", "2021-11-30T00:00:00Z");
// Dec 2021 session paused on 25 March 2022: the replay has revealed these days.
const revealed = dailyBars("2021-12-01T00:00:00Z", "2022-03-25T00:00:00Z");
const pausedAt = Date.parse("2022-03-25T00:00:00Z");

describe("Pine run key", () => {
  it("changes when older history arrives, even though the newest candle has not moved", () => {
    const newest = revealed.at(-1)!;
    expect(pineCandleKey(newest, 10, 10, 1)).not.toBe(pineCandleKey(newest, 10, 10, 0));
    expect(pineCandleKey(newest, 10, 10, 1)).toBe(pineCandleKey(newest, 10, 10, 1));
    expect(pineCandleKey(undefined, 0, 0, 3)).toBe("");
  });

  it("keeps a run's output to the market and timeframe it was calculated on", () => {
    expect(samePineScope({ symbol: "EURUSD", timeframeMs: DAY }, { symbol: "EURUSD", timeframeMs: DAY })).toBe(true);
    expect(samePineScope({ symbol: "EURUSD", timeframeMs: 900_000 }, { symbol: "EURUSD", timeframeMs: DAY })).toBe(false);
    expect(samePineScope({ symbol: "GBPUSD", timeframeMs: DAY }, { symbol: "EURUSD", timeframeMs: DAY })).toBe(false);
    expect(samePineScope(undefined, { symbol: "EURUSD", timeframeMs: DAY })).toBe(false);
  });
});

describe("saved session opened directly on 1D", () => {
  // After 1D -> 15m -> 1D the 1D history page is cached, so it is already on
  // the chart when the scripts run. This is the result the direct open must match.
  const switched = new DailyChart(revealed);
  switched.setHistory(history);
  const expected = signals(switched.result!, switched.candles());

  it("has historical signals to compare against", () => {
    expect(expected.labels.length).toBeGreaterThan(20);
    expect(expected.touches.length).toBeGreaterThan(20);
    expect(expected.labels.some((label) => label.endsWith("BUY"))).toBe(true);
    expect(expected.labels.some((label) => label.endsWith("SELL"))).toBe(true);
  });

  it("re-runs the restored script when the 1D history finishes loading afterwards", () => {
    const direct = new DailyChart(revealed);
    direct.sync(); // indicator restored before any history arrived
    const early = signals(direct.result!, direct.candles());
    expect(early.labels.length).toBeLessThan(expected.labels.length);

    direct.setHistory(history.slice(-60)); // opening page
    direct.setHistory(history); // an older page finishes later
    const loaded = signals(direct.result!, direct.candles());
    expect(direct.runs).toBe(3);
    expect(loaded).toEqual(expected);
  });

  it("does not run again, or duplicate markers, when nothing changed", () => {
    const direct = new DailyChart(revealed);
    direct.setHistory(history);
    direct.setHistory(direct.history);
    direct.sync();
    expect(direct.runs).toBe(1);
    const { labels } = signals(direct.result!, direct.candles());
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("never reads past the replay position", () => {
    const direct = new DailyChart(revealed);
    direct.setHistory(history);
    const { labels, touches } = signals(direct.result!, direct.candles());
    for (const label of labels) expect(Number(label.split(":")[0])).toBeLessThanOrEqual(pausedAt);
    for (const time of touches) expect(time).toBeLessThanOrEqual(pausedAt);
  });
});
