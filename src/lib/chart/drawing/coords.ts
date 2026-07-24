/**
 * Translates between chart space (time/price) and screen pixels.
 *
 * Wraps a lightweight-charts instance + price series. All drawing objects are
 * rendered by asking this mapper for pixel positions, so a single source of
 * truth keeps every object anchored to the data during pan/zoom/resize.
 */

import type { IChartApi, ISeriesApi, SeriesType, Time, UTCTimestamp } from "lightweight-charts";

import type { MagnetMode, Point } from "./types";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const WEAK_SNAP_PX = 8;

export class CoordinateMapper {
  /** Logical (CSS px) canvas size, kept in sync by the engine. */
  width = 0;
  height = 0;

  constructor(
    private chart: IChartApi,
    private series: ISeriesApi<SeriesType>,
  ) {}

  timeToX(time: number): number | null {
    if (!time) return null;
    const c = this.chart.timeScale().timeToCoordinate(time as UTCTimestamp);
    return typeof c === "number" ? c : null;
  }

  priceToY(price: number): number | null {
    const c = this.series.priceToCoordinate(price);
    return typeof c === "number" ? c : null;
  }

  /** Nearest bar time for a pixel x (0 when off the data range). */
  xToTime(x: number): number {
    const t = this.chart.timeScale().coordinateToTime(x) as Time | null | undefined;
    return typeof t === "number" ? t : 0;
  }

  yToPrice(y: number): number | null {
    const p = this.series.coordinateToPrice(y);
    return typeof p === "number" ? p : null;
  }

  /** Convert a raw pixel position to a chart point. */
  pixelToPoint(x: number, y: number): Point | null {
    const price = this.yToPrice(y);
    if (price == null) return null;
    return { time: this.xToTime(x), price };
  }

  /**
   * Apply magnet snapping to a point's price using nearby candle OHLC values.
   * Time is already bar-aligned by {@link xToTime}.
   */
  snapPrice(point: Point, mode: MagnetMode, candles: Candle[]): Point {
    if (mode === "off" || !candles.length || !point.time) return point;
    let candle = candles[0]!;
    let bestDT = Infinity;
    for (const c of candles) {
      const dt = Math.abs(c.time - point.time);
      if (dt < bestDT) {
        bestDT = dt;
        candle = c;
      }
    }
    let target = point.price;
    let bestDP = Infinity;
    for (const v of [candle.open, candle.high, candle.low, candle.close]) {
      const dp = Math.abs(v - point.price);
      if (dp < bestDP) {
        bestDP = dp;
        target = v;
      }
    }
    if (mode === "strong") return { time: point.time, price: target };
    // weak: only snap when the target sits within a small pixel radius.
    const y0 = this.priceToY(point.price);
    const y1 = this.priceToY(target);
    if (y0 != null && y1 != null && Math.abs(y0 - y1) <= WEAK_SNAP_PX) {
      return { time: point.time, price: target };
    }
    return point;
  }
}
