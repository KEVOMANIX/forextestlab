import { describe, expect, it, vi } from "vitest";

import { hydrateInstance } from "./indicator-defs";
import type { OHLCV } from "./indicators";
import { Indicator } from "./indicator-runtime";

/**
 * How much the runtime pushes into the chart on each replay candle.
 *
 * This is the flicker regression: every candle used to re-send the whole history
 * through `setData`, which rebuilds the series. The library is stubbed so the
 * calls can be counted without a DOM.
 */

vi.mock("@/lib/performance/replay-metrics", () => ({
  recordReplayMetric: () => {},
}));

interface StubSeries {
  setData: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  applyOptions: ReturnType<typeof vi.fn>;
  createPriceLine: ReturnType<typeof vi.fn>;
}

function stubChart() {
  const series: StubSeries[] = [];
  const chart = {
    addSeries: () => {
      const s: StubSeries = {
        setData: vi.fn(),
        update: vi.fn(),
        applyOptions: vi.fn(),
        createPriceLine: vi.fn(),
      };
      series.push(s);
      return s;
    },
    removeSeries: vi.fn(),
  };
  const totals = () => ({
    setData: series.reduce((n, s) => n + s.setData.mock.calls.length, 0),
    setDataPoints: series.reduce(
      (n, s) => n + s.setData.mock.calls.reduce((m, [d]) => m + (d as unknown[]).length, 0),
      0,
    ),
    update: series.reduce((n, s) => n + s.update.mock.calls.length, 0),
    applyOptions: series.reduce((n, s) => n + s.applyOptions.mock.calls.length, 0),
  });
  const reset = () => {
    for (const s of series) {
      s.setData.mockClear();
      s.update.mockClear();
      s.applyOptions.mockClear();
    }
  };
  // The stub only implements what `Indicator` touches.
  return { chart: chart as never, totals, reset, series };
}

function bars(count: number, from = 0): OHLCV[] {
  return Array.from({ length: count }, (_, i) => {
    const base = 100 + Math.sin((from + i) / 5) * 4;
    return {
      time: 1_700_000_000 + (from + i) * 60,
      open: base,
      high: base + 1,
      low: base - 1,
      close: base + 0.25,
      volume: 500 + i,
    };
  });
}

function make(kind: string, chart: never) {
  const inst = hydrateInstance({ id: `t-${kind}`, kind, visible: true })!;
  const indicator = new Indicator(chart, inst, 5, 0);
  indicator.initialize();
  return { indicator, inst };
}

describe("drawing during replay", () => {
  it("seeds with one setData and then appends without re-sending the history", () => {
    const { chart, totals, reset } = stubChart();
    const { indicator, inst } = make("ema", chart);
    const history = bars(300);

    indicator.update(inst, history);
    expect(totals().setData).toBeGreaterThan(0);
    expect(totals().setDataPoints).toBeGreaterThanOrEqual(300);

    // Ten more candles arrive, one at a time, exactly as replay delivers them.
    reset();
    for (let i = 1; i <= 10; i++) {
      indicator.update(inst, bars(300 + i));
    }
    const after = totals();
    expect(after.setData).toBe(0);
    expect(after.update).toBeGreaterThan(0);
  });

  it("revises the forming bar in place", () => {
    const { chart, totals, reset } = stubChart();
    const { indicator, inst } = make("ema", chart);
    const history = bars(120);
    indicator.update(inst, history);

    reset();
    // Same bar count, higher close — the live candle ticking up.
    const revised = history.map((c, i) =>
      i === history.length - 1 ? { ...c, close: c.close + 0.5, high: c.high + 0.5 } : c,
    );
    indicator.update(inst, revised);
    expect(totals().setData).toBe(0);
    expect(totals().update).toBeGreaterThan(0);
  });

  it("sends nothing at all when the data has not moved", () => {
    const { chart, totals, reset } = stubChart();
    const { indicator, inst } = make("rsi", chart);
    const history = bars(120);
    indicator.update(inst, history);

    reset();
    indicator.update(inst, history);
    const after = totals();
    expect(after.setData).toBe(0);
    expect(after.update).toBe(0);
    // Re-applying identical options is a redraw the chart does not need.
    expect(after.applyOptions).toBe(0);
  });

  it("falls back to a full replace when the series is rebuilt shorter", () => {
    const { chart, totals, reset } = stubChart();
    const { indicator, inst } = make("ema", chart);
    indicator.update(inst, bars(200));

    reset();
    // A timeframe change hands over a different, shorter series.
    indicator.update(inst, bars(50));
    expect(totals().setData).toBeGreaterThan(0);
  });

  it("replaces rather than appends when an input changes", () => {
    const { chart, totals, reset } = stubChart();
    const { indicator, inst } = make("ema", chart);
    const history = bars(200);
    indicator.update(inst, history);

    reset();
    indicator.update({ ...inst, inputs: { ...inst.inputs, length: 50 } }, history);
    // Every point moved, so a wholesale replace is the correct choice.
    expect(totals().setData).toBeGreaterThan(0);
  });

  it("keeps appending cheaply for a multi-plot oscillator", () => {
    const { chart, totals, reset } = stubChart();
    const { indicator, inst } = make("macd", chart);
    indicator.update(inst, bars(300));

    reset();
    for (let i = 1; i <= 5; i++) indicator.update(inst, bars(300 + i));
    const after = totals();
    expect(after.setData).toBe(0);
    // MACD draws three plots, so five candles cost a handful of points, not
    // 3 × 300 × 5.
    expect(after.update).toBeLessThan(60);
  });

  it("replaces for indicators that revise their history", () => {
    // A regression channel refits its whole window every bar, so its earlier
    // points genuinely change and `update` cannot express that.
    const { chart, totals, reset } = stubChart();
    const { indicator, inst } = make("lrc", chart);
    indicator.update(inst, bars(200));

    reset();
    indicator.update(inst, bars(201));
    expect(totals().setData).toBeGreaterThan(0);
  });
});

describe("history-wide calculation", () => {
  it("plots across the joined history, not only the revealed tail", () => {
    // The chart hands the runtime loaded history followed by the revealed
    // candles as one series. A 20-bar average must therefore have a value 25
    // bars in, not 25 bars after the replay boundary.
    const { chart, series } = stubChart();
    const { indicator, inst } = make("sma", chart);
    const timeline = bars(400);
    indicator.update(inst, timeline);

    const pushed = series[0]!.setData.mock.calls.at(-1)![0] as { value?: number }[];
    expect(pushed).toHaveLength(400);
    const firstWithValue = pushed.findIndex((p) => p.value != null);
    expect(firstWithValue).toBe(19);
    expect(pushed.at(-1)!.value).toBeTypeOf("number");
  });

  it("replaces wholesale when older history is prepended", () => {
    // Loading an earlier page shifts every index, so the incremental path must
    // stand down rather than append onto a timeline that no longer matches.
    const { chart, totals, reset } = stubChart();
    const { indicator, inst } = make("ema", chart);
    indicator.update(inst, bars(200, 100));

    reset();
    indicator.update(inst, bars(300, 0));
    expect(totals().setData).toBeGreaterThan(0);
  });
});

describe("every registered indicator", () => {
  it("initialises, draws and appends without throwing", () => {
    const kinds = [
      "sma", "ema", "wma", "hma", "vwap", "supertrend", "ichimoku", "bb",
      "keltner", "donchian", "atr", "stddev", "rsi", "macd", "stoch",
      "stochrsi", "cci", "williamsr", "roc", "adx", "volume", "obv", "mfi",
      "cmf", "avwap", "zigzag", "lrc", "pivots",
    ];
    for (const kind of kinds) {
      const { chart } = stubChart();
      const inst = hydrateInstance({ id: `t-${kind}`, kind, visible: true });
      expect(inst, `${kind} should hydrate`).not.toBeNull();
      const indicator = new Indicator(chart, inst!, 5, 0);
      expect(() => {
        indicator.initialize();
        indicator.update(inst!, bars(200));
        indicator.update(inst!, bars(201));
        indicator.destroy();
      }, `${kind} should draw`).not.toThrow();
    }
  });

  it("reports a finite latest value where one exists", () => {
    for (const kind of ["ema", "rsi", "macd", "atr", "bb"]) {
      const { chart } = stubChart();
      const inst = hydrateInstance({ id: `t-${kind}`, kind, visible: true })!;
      const indicator = new Indicator(chart, inst, 5, 0);
      indicator.initialize();
      indicator.update(inst, bars(200));
      const value = indicator.lastFiniteValue();
      expect(value, kind).not.toBeNull();
      expect(Number.isFinite(value as number), kind).toBe(true);
    }
  });
});
