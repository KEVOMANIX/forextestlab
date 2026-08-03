import { describe, expect, it } from "vitest";
import type {
  IChartApi,
  ISeriesApi,
  SeriesType,
  Time,
} from "lightweight-charts";

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
