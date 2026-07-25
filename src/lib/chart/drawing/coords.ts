/**
 * Translates between chart space (time/price) and screen pixels.
 *
 * Wraps a lightweight-charts instance + price series. All drawing objects are
 * rendered by asking this mapper for pixel positions, so a single source of
 * truth keeps every object anchored to the data during pan/zoom/resize.
 *
 * Time mapping extrapolates through the time scale's *logical* coordinates so
 * points can live in the empty area to the right of the last candle (or before
 * the first) — where `timeToCoordinate` / `coordinateToTime` return null.
 */

import type { IChartApi, ISeriesApi, Logical, SeriesType, Time, UTCTimestamp } from "lightweight-charts";

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

  /** Data + inferred bar interval, used to extrapolate time past the edges. */
  private candles: Candle[] = [];
  private barSecs = 0;

  constructor(
    private chart: IChartApi,
    private series: ISeriesApi<SeriesType>,
  ) {}

  setCandles(candles: Candle[]): void {
    this.candles = candles;
    // Smallest positive gap = true bar interval (ignores weekend/session gaps).
    let best = 0;
    for (let i = 1; i < candles.length; i++) {
      const d = candles[i]!.time - candles[i - 1]!.time;
      if (d > 0 && (best === 0 || d < best)) best = d;
    }
    this.barSecs = best;
  }

  timeToX(time: number): number | null {
    if (!time) return null;
    const c = this.chart.timeScale().timeToCoordinate(time as UTCTimestamp);
    if (typeof c === "number") return c;
    // Off the data range (or between bars): go via logical index.
    const logical = this.timeToLogical(time);
    if (logical == null) return null;
    const x = this.chart.timeScale().logicalToCoordinate(logical as Logical);
    return typeof x === "number" ? x : null;
  }

  priceToY(price: number): number | null {
    const c = this.series.priceToCoordinate(price);
    return typeof c === "number" ? c : null;
  }

  /** Bar time for a pixel x — extrapolated past the data edges so drawings can
   * be placed in the empty future/past area (0 only when the interval is unknown). */
  xToTime(x: number): number {
    const t = this.chart.timeScale().coordinateToTime(x) as Time | null | undefined;
    if (typeof t === "number") return t;
    const logical = this.chart.timeScale().coordinateToLogical(x);
    if (logical == null) return 0;
    return this.logicalToTime(logical as number);
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

  // ---- logical <-> time extrapolation ----

  private timeToLogical(time: number): number | null {
    const cs = this.candles;
    if (cs.length === 0 || this.barSecs === 0) return null;
    const lastIdx = cs.length - 1;
    const first = cs[0]!.time;
    const last = cs[lastIdx]!.time;
    if (time <= first) return (time - first) / this.barSecs;
    if (time >= last) return lastIdx + (time - last) / this.barSecs;
    // Between bars: linear interpolation within the bracketing pair.
    for (let i = 1; i <= lastIdx; i++) {
      if (cs[i]!.time >= time) {
        const t0 = cs[i - 1]!.time;
        const t1 = cs[i]!.time;
        const frac = t1 > t0 ? (time - t0) / (t1 - t0) : 0;
        return i - 1 + frac;
      }
    }
    return lastIdx;
  }

  private logicalToTime(logical: number): number {
    const cs = this.candles;
    if (cs.length === 0 || this.barSecs === 0) return 0;
    const lastIdx = cs.length - 1;
    if (logical <= 0) return Math.round(cs[0]!.time + logical * this.barSecs);
    if (logical >= lastIdx) return Math.round(cs[lastIdx]!.time + (logical - lastIdx) * this.barSecs);
    const i = Math.floor(logical);
    const frac = logical - i;
    const t0 = cs[i]!.time;
    const t1 = cs[i + 1]!.time;
    return Math.round(t0 + frac * (t1 - t0));
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
