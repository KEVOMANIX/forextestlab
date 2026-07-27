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
});
