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
