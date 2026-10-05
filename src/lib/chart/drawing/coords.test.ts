import { describe, expect, it } from "vitest";
import type {
  IChartApi,
  ISeriesApi,
  SeriesType,
  Time,
} from "lightweight-charts";

import { candleBucketStart } from "@/lib/market-data/aggregation";
import { nextTimeframeTimestamp, type Timeframe } from "@/lib/market-data/types";
import { CoordinateMapper } from "./coords";

describe("CoordinateMapper", () => {
  it("uses chart coordinates for candles from the context series", () => {
    const timeScale = {
      timeToCoordinate: (time: Time) => (time === 200 ? 42 : null),
      logicalToCoordinate: (logical: number) => logical * 10,
      coordinateToTime: (x: number) => (x === 42 ? 200 : null),
      coordinateToLogical: (x: number) => x / 10,
    };
    const chart = {
      timeScale: () => timeScale,
    } as unknown as IChartApi;
    const series = {
      priceToCoordinate: (price: number) => price,
      coordinateToPrice: (coordinate: number) => coordinate,
    } as unknown as ISeriesApi<SeriesType>;
    const mapper = new CoordinateMapper(chart, series);

    // The replay-only reconstruction puts time 200 at logical index 1, but
    // the complete chart timeline (including context) puts it at pixel 42.
    mapper.setCandles([
      { time: 100, open: 1, high: 1, low: 1, close: 1 },
      { time: 200, open: 1, high: 1, low: 1, close: 1 },
    ]);

    expect(mapper.timeToX(200)).toBe(42);
  });

  it("does not clamp a dragged anchor back to the last candle", () => {
    const timeScale = {
      timeToCoordinate: () => null,
      logicalToCoordinate: (logical: number) => logical * 42,
      // Simulate Lightweight Charts clamping empty right-side space.
      coordinateToTime: () => 200,
      coordinateToLogical: (x: number) => x / 42,
    };
    const chart = {
      timeScale: () => timeScale,
    } as unknown as IChartApi;
    const series = {
      priceToCoordinate: (price: number) => price,
      coordinateToPrice: (coordinate: number) => coordinate,
    } as unknown as ISeriesApi<SeriesType>;
    const mapper = new CoordinateMapper(chart, series);
    mapper.setCandles([
      { time: 100, open: 1, high: 1, low: 1, close: 1 },
      { time: 200, open: 1, high: 1, low: 1, close: 1 },
    ]);

    expect(mapper.xToTime(42)).toBe(200);
    expect(mapper.xToTime(84)).toBe(300);
  });

  it("stores the chart's real timestamp inside the plotted range", () => {
    const timeScale = {
      timeToCoordinate: (time: Time) => time === 100 ? 10 : time === 150 ? 15 : time === 200 ? 20 : null,
      logicalToCoordinate: (logical: number) => logical * 100,
      coordinateToTime: (x: number) => x === 15 ? 150 : null,
      coordinateToLogical: (x: number) => x / 100,
    };
    const chart = { timeScale: () => timeScale } as unknown as IChartApi;
    const series = {
      priceToCoordinate: (price: number) => price,
      coordinateToPrice: (coordinate: number) => coordinate,
    } as unknown as ISeriesApi<SeriesType>;
    const mapper = new CoordinateMapper(chart, series);
    mapper.setCandles([
      { time: 100, open: 1, high: 1, low: 1, close: 1 },
      { time: 200, open: 1, high: 1, low: 1, close: 1 },
    ]);

    // Logical reconstruction would incorrectly produce 115 here.
    expect(mapper.xToTime(15)).toBe(150);
  });

  it("stores a chart-owned whitespace timestamp instead of rebuilding it from a local logical origin", () => {
    const timeScale = {
      timeToCoordinate: (time: Time) => time === 100 ? 110 : time === 200 ? 120 : time === 300 ? 130 : null,
      logicalToCoordinate: (logical: number) => logical * 10,
      coordinateToTime: (x: number) => x === 130 ? 300 : null,
      coordinateToLogical: (x: number) => x / 10,
    };
    const chart = { timeScale: () => timeScale } as unknown as IChartApi;
    const series = {
      priceToCoordinate: (price: number) => price,
      coordinateToPrice: (coordinate: number) => coordinate,
    } as unknown as ISeriesApi<SeriesType>;
    const mapper = new CoordinateMapper(chart, series);
    mapper.setCandles([
      { time: 100, open: 1, high: 1, low: 1, close: 1 },
      { time: 200, open: 1, high: 1, low: 1, close: 1 },
    ]);
    mapper.setFutureTimes([300]);

    // Local logical index 13 would have produced time 1,400. The chart's
    // whitespace series says this coordinate is the next real bar at 300.
    expect(mapper.xToTime(130)).toBe(300);
  });

  it("interpolates a fine-timeframe anchor with chart-owned coordinates", () => {
    const timeScale = {
      timeToCoordinate: (time: Time) => time === 0 ? 30 : time === 14_400 ? 50 : null,
      logicalToCoordinate: (logical: number) => logical * 100,
      coordinateToTime: () => null,
      coordinateToLogical: (x: number) => x / 100,
    };
    const chart = { timeScale: () => timeScale } as unknown as IChartApi;
    const series = {
      priceToCoordinate: (price: number) => price,
      coordinateToPrice: (coordinate: number) => coordinate,
    } as unknown as ISeriesApi<SeriesType>;
    const mapper = new CoordinateMapper(chart, series);
    mapper.setCandles([
      { time: 0, open: 1, high: 1, low: 1, close: 1 },
      { time: 14_400, open: 1, high: 1, low: 1, close: 1 },
    ]);

    // 01:00 is one quarter of the way through a 4h bar interval.
    expect(mapper.timeToX(3_600)).toBe(35);
  });

  it("rejects a clamped zero coordinate for a fine-timeframe anchor", () => {
    const timeScale = {
      // The coarse chart incorrectly answers 0 for the missing 01:00 point.
      timeToCoordinate: (time: Time) => time === 0 ? 30 : time === 3_600 ? 0 : time === 14_400 ? 50 : null,
      logicalToCoordinate: (logical: number) => logical * 100,
      coordinateToTime: (x: number) => x === 30 ? 0 : x === 50 ? 14_400 : -14_400,
      coordinateToLogical: (x: number) => x / 100,
    };
    const chart = { timeScale: () => timeScale } as unknown as IChartApi;
    const series = {
      priceToCoordinate: (price: number) => price,
      coordinateToPrice: (coordinate: number) => coordinate,
    } as unknown as ISeriesApi<SeriesType>;
    const mapper = new CoordinateMapper(chart, series);
    mapper.setCandles([
      { time: 0, open: 1, high: 1, low: 1, close: 1 },
      { time: 14_400, open: 1, high: 1, low: 1, close: 1 },
    ]);

    expect(mapper.timeToX(3_600)).toBe(35);
  });

  it("inverts the visible time axis when the coarse chart clamps timeToCoordinate", () => {
    const timeScale = {
      timeToCoordinate: (time: Time) => time === 0 ? 0 : time === 14_400 ? 100 : 0,
      logicalToCoordinate: (logical: number) => logical * 100,
      coordinateToTime: (x: number) => Math.round(x * 144),
      coordinateToLogical: (x: number) => x / 100,
    };
    const chart = { timeScale: () => timeScale } as unknown as IChartApi;
    const series = {
      priceToCoordinate: (price: number) => price,
      coordinateToPrice: (coordinate: number) => coordinate,
    } as unknown as ISeriesApi<SeriesType>;
    const mapper = new CoordinateMapper(chart, series);
    mapper.width = 100;
    mapper.setCandles([
      { time: 0, open: 1, high: 1, low: 1, close: 1 },
      { time: 14_400, open: 1, high: 1, low: 1, close: 1 },
    ]);

    expect(mapper.timeToX(3_600)).toBeCloseTo(25, 1);
  });

  it("keeps off-screen anchors at their chart coordinates when viewport edge times are clamped", () => {
    const timeScale = {
      timeToCoordinate: (time: Time) => time === 100 ? 800 : time === 200 ? 820 : null,
      logicalToCoordinate: (logical: number) => logical,
      // A pan to older history makes the library report the later drawing
      // anchors at the viewport edges even though their real coordinates are
      // beyond the right edge.
      coordinateToTime: (x: number) => x <= 0 || x === 800 ? 100 : x >= 500 || x === 820 ? 200 : 150,
      coordinateToLogical: (x: number) => x,
      getVisibleLogicalRange: () => ({ from: 0, to: 500 }),
      width: () => 500,
    };
    const chart = { timeScale: () => timeScale } as unknown as IChartApi;
    const series = {
      priceToCoordinate: (price: number) => price,
      coordinateToPrice: (coordinate: number) => coordinate,
    } as unknown as ISeriesApi<SeriesType>;
    const mapper = new CoordinateMapper(chart, series);
    mapper.width = 500;
    mapper.setCandles([
      { time: 100, open: 1, high: 1, low: 1, close: 1 },
      { time: 200, open: 1, high: 1, low: 1, close: 1 },
    ]);

    expect(mapper.timeToX(100)).toBe(800);
    expect(mapper.timeToX(200)).toBe(820);
  });

  it("keeps fine-timeframe anchors stable while panning on every coarser timeframe", () => {
    for (const interval of [300, 900, 3_600, 14_400, 86_400, 604_800, 2_592_000]) {
      const firstAnchor = interval + 60;
      const secondAnchor = interval + 120;
      const timeScale = {
        timeToCoordinate: (time: Time) => time === 0 ? 100 : time === interval ? 200 : null,
        logicalToCoordinate: (logical: number) => logical * 100,
        // This mimics the unstable edge answers seen after panning left. They
        // must not be used to position either fine-timeframe anchor.
        coordinateToTime: (x: number) => x <= 0 ? firstAnchor : x >= 500 ? secondAnchor : null,
        coordinateToLogical: (x: number) => x / 100,
      };
      const chart = { timeScale: () => timeScale } as unknown as IChartApi;
      const series = {
        priceToCoordinate: (price: number) => price,
        coordinateToPrice: (coordinate: number) => coordinate,
      } as unknown as ISeriesApi<SeriesType>;
      const mapper = new CoordinateMapper(chart, series);
      mapper.width = 500;
      mapper.setCandles([
        { time: 0, open: 1, high: 1, low: 1, close: 1 },
        { time: interval, open: 1, high: 1, low: 1, close: 1 },
      ]);
      mapper.setFutureTimes([interval * 2, interval * 3]);

      expect(mapper.timeToX(firstAnchor)).toBeCloseTo(200 + 60 / interval * 100, 3);
      expect(mapper.timeToX(secondAnchor)).toBeCloseTo(200 + 120 / interval * 100, 3);
    }
  });

  it("adds the chart logical origin when higher-timeframe context shifts the timeline", () => {
    const timeScale = {
      // The middle monthly candle has not been attached to the price series,
      // forcing the mapper through logical reconstruction.
      timeToCoordinate: (time: Time) => time === 100 ? 100 : time === 300 ? 120 : null,
      logicalToCoordinate: (logical: number) => logical * 10,
      coordinateToTime: () => null,
      coordinateToLogical: (x: number) => x / 10,
    };
    const chart = { timeScale: () => timeScale } as unknown as IChartApi;
    const series = {
      priceToCoordinate: (price: number) => price,
      coordinateToPrice: (coordinate: number) => coordinate,
    } as unknown as ISeriesApi<SeriesType>;
    const mapper = new CoordinateMapper(chart, series);
    mapper.setCandles([
      { time: 100, open: 1, high: 1, low: 1, close: 1 },
      { time: 200, open: 1, high: 1, low: 1, close: 1 },
      { time: 300, open: 1, high: 1, low: 1, close: 1 },
    ]);

    // 250 is halfway between local bars 1 and 2. They sit at logical 11 and 12
    // because the shared chart timeline begins at logical 10.
    expect(mapper.timeToX(250)).toBe(115);
  });

  it("does not stretch a 1m rectangle to the left edge after switching to 15m", () => {
    const minute = 60;
    const start = Date.UTC(2020, 7, 17, 20, 44) / 1_000;
    const end = Date.UTC(2020, 7, 17, 22, 10) / 1_000;
    const firstBucket = Date.UTC(2020, 7, 17, 20, 30) / 1_000;
    const logicalOrigin = 500;
    const owned = new Map<number, number>();
    for (let i = 0; i < 9; i++) owned.set(firstBucket + i * 15 * minute, logicalOrigin + i);
    const timeScale = {
      // This is the production failure: unknown fine timestamps are clamped
      // to the far-left coordinate instead of returning null.
      timeToCoordinate: (time: Time) => owned.has(Number(time)) ? owned.get(Number(time))! * 12 : 0,
      coordinateToTime: (x: number) => {
        for (const [time, logical] of owned) if (logical * 12 === x) return time;
        return firstBucket - 86_400;
      },
      coordinateToLogical: (x: number) => x / 12,
      logicalToCoordinate: (logical: number) => Number.isInteger(logical) ? logical * 12 : 0,
    };
    const chart = { timeScale: () => timeScale } as unknown as IChartApi;
    const series = {
      priceToCoordinate: (price: number) => price,
      coordinateToPrice: (coordinate: number) => coordinate,
    } as unknown as ISeriesApi<SeriesType>;
    const mapper = new CoordinateMapper(chart, series);
    mapper.setTimeframe("15m");
    mapper.setCandles([...owned.keys()].map((time) => ({ time, open: 1, high: 1, low: 1, close: 1 })));

    const x0 = mapper.timeToX(start)!;
    const x1 = mapper.timeToX(end)!;
    expect(x0).toBeCloseTo((logicalOrigin + 14 / 15) * 12, 5);
    expect(x1).toBeCloseTo((logicalOrigin + 6 + 10 / 15) * 12, 5);
    expect(x0).toBeGreaterThan(0);
    expect(x1 - x0).toBeCloseTo((86 / 15) * 12, 5);
  });

  it("projects fine anchors inside their bar on every supported higher timeframe", () => {
    const higher: Timeframe[] = ["3m", "5m", "10m", "15m", "30m", "45m", "1h", "2h", "4h", "6h", "12h", "1d", "1w", "1M", "3M", "4M", "6M", "1yr"];
    const sampleMs = Date.UTC(2020, 7, 17, 20, 44, 30);

    for (const timeframe of higher) {
      const start = candleBucketStart(sampleMs, timeframe) / 1_000;
      const end = nextTimeframeTimestamp(start * 1_000, timeframe) / 1_000;
      const anchor = start + (end - start) * 0.4;
      const timeScale = {
        timeToCoordinate: (time: Time) => Number(time) === start ? 6_000 : Number(time) === end ? 6_012 : 0,
        coordinateToTime: (x: number) => x === 6_000 ? start : x === 6_012 ? end : start - 60,
        coordinateToLogical: (x: number) => x / 12,
        logicalToCoordinate: (logical: number) => Number.isInteger(logical) ? logical * 12 : 0,
      };
      const chart = { timeScale: () => timeScale } as unknown as IChartApi;
      const series = {
        priceToCoordinate: (price: number) => price,
        coordinateToPrice: (coordinate: number) => coordinate,
      } as unknown as ISeriesApi<SeriesType>;
      const mapper = new CoordinateMapper(chart, series);
      mapper.setTimeframe(timeframe);
      mapper.setCandles([
        { time: start, open: 1, high: 1, low: 1, close: 1 },
        { time: end, open: 1, high: 1, low: 1, close: 1 },
      ]);

      expect(mapper.timeToX(anchor), timeframe).toBeCloseTo(6_004.8, 5);
    }
  });

  describe("the forward runway", () => {
    const HOUR = 3_600;
    /** Friday 21:00 UTC — the last bar of the week on a 1h chart. */
    const FRIDAY_CLOSE = Date.UTC(2025, 0, 10, 21) / 1000;
    /** Sunday 21:00 UTC, where the chart's runway resumes. */
    const SUNDAY_OPEN = Date.UTC(2025, 0, 12, 21) / 1000;

    /**
     * A chart whose logical axis is one pixel per bar, with no time resolvable
     * past the last candle — exactly the empty space right of price.
     */
    function futureChart() {
      const timeScale = {
        timeToCoordinate: () => null,
        logicalToCoordinate: (logical: number) => logical,
        coordinateToTime: () => null,
        coordinateToLogical: (x: number) => x,
      };
      const chart = { timeScale: () => timeScale } as unknown as IChartApi;
      const series = {
        priceToCoordinate: (price: number) => price,
        coordinateToPrice: (coordinate: number) => coordinate,
      } as unknown as ISeriesApi<SeriesType>;
      const mapper = new CoordinateMapper(chart, series);
      // Two revealed bars, so the last candle sits at logical index 1.
      mapper.setCandles([
        { time: FRIDAY_CLOSE - HOUR, open: 1, high: 1, low: 1, close: 1 },
        { time: FRIDAY_CLOSE, open: 1, high: 1, low: 1, close: 1 },
      ]);
      return mapper;
    }

    it("drops an anchor on a real bar time rather than inside the weekend", () => {
      const mapper = futureChart();
      // The chart's own runway steps Friday 21:00 → Sunday 21:00 → Sunday 22:00.
      mapper.setFutureTimes([SUNDAY_OPEN, SUNDAY_OPEN + HOUR, SUNDAY_OPEN + 2 * HOUR]);

      // One slot right of the last candle is the session's reopen, not Saturday.
      expect(mapper.xToTime(2)).toBe(SUNDAY_OPEN);
      expect(mapper.xToTime(3)).toBe(SUNDAY_OPEN + HOUR);
    });

    it("projects a lower-timeframe anchor when only one higher-timeframe candle exists", () => {
      const timeScale = {
        timeToCoordinate: (time: Time) => time === FRIDAY_CLOSE ? 10 : null,
        logicalToCoordinate: (logical: number) => 10 + logical * 20,
        coordinateToTime: () => null,
        coordinateToLogical: (x: number) => (x - 10) / 20,
      };
      const chart = { timeScale: () => timeScale } as unknown as IChartApi;
      const series = {
        priceToCoordinate: (price: number) => price,
        coordinateToPrice: (coordinate: number) => coordinate,
      } as unknown as ISeriesApi<SeriesType>;
      const mapper = new CoordinateMapper(chart, series);
      mapper.setCandles([
        { time: FRIDAY_CLOSE, open: 1, high: 1, low: 1, close: 1 },
      ]);
      mapper.setFutureTimes([SUNDAY_OPEN, SUNDAY_OPEN + HOUR, SUNDAY_OPEN + 2 * HOUR]);

      // Halfway from the last real candle to the first runway point remains
      // projectable even though there is no second real candle yet.
      expect(mapper.timeToX((FRIDAY_CLOSE + SUNDAY_OPEN) / 2)).toBe(20);
    });

    it("keeps a future anchor on the same pixel once replay reaches it", () => {
      const mapper = futureChart();
      mapper.setFutureTimes([SUNDAY_OPEN, SUNDAY_OPEN + HOUR, SUNDAY_OPEN + 2 * HOUR]);
      const dropped = mapper.xToTime(3);
      expect(mapper.timeToX(dropped)).toBe(3);

      // Replay crosses the weekend: the two runway bars are now real candles and
      // the runway starts after them. The anchor must not slide back towards the
      // Friday close, which is what uniform extrapolation used to do.
      mapper.setCandles([
        { time: FRIDAY_CLOSE - HOUR, open: 1, high: 1, low: 1, close: 1 },
        { time: FRIDAY_CLOSE, open: 1, high: 1, low: 1, close: 1 },
        { time: SUNDAY_OPEN, open: 1, high: 1, low: 1, close: 1 },
        { time: SUNDAY_OPEN + HOUR, open: 1, high: 1, low: 1, close: 1 },
      ]);
      mapper.setFutureTimes([SUNDAY_OPEN + 2 * HOUR, SUNDAY_OPEN + 3 * HOUR]);

      expect(mapper.timeToX(dropped)).toBe(3);
    });

    it("falls back to uniform steps past the end of the runway", () => {
      const mapper = futureChart();
      mapper.setFutureTimes([SUNDAY_OPEN, SUNDAY_OPEN + HOUR]);
      // Logical 5 is three slots past the runway's last point.
      expect(mapper.xToTime(5)).toBe(SUNDAY_OPEN + HOUR + 2 * HOUR);
      expect(mapper.timeToX(SUNDAY_OPEN + 3 * HOUR)).toBe(5);
    });

    it("extrapolates uniformly when the chart publishes no runway", () => {
      const mapper = futureChart();
      expect(mapper.xToTime(4)).toBe(FRIDAY_CLOSE + 3 * HOUR);
    });
  });
});
