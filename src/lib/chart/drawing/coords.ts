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

import { candleBucketStart } from "@/lib/market-data/aggregation";
import { nextTimeframeTimestamp, TIMEFRAMES, type Timeframe } from "@/lib/market-data/types";
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
  /**
   * Bar times the chart's time scale continues through after the last candle,
   * ascending. The chart draws its forward runway from a session-aware series
   * that skips the weekend closure, so the empty space to the right of price is
   * not a uniform ladder of `barSecs` steps. Extrapolating as if it were put a
   * drawing dropped "next Monday" on a Saturday timestamp no bar will ever
   * carry, and the drawing jumped back to the Friday close the moment replay
   * crossed the gap. Reading the same runway the chart uses keeps a released
   * anchor on the bar the trader aimed at.
   */
  private futureTimes: number[] = [];
  private timeframe: Timeframe | null = null;

  constructor(
    private chart: IChartApi,
    private series: ISeriesApi<SeriesType>,
  ) {}

  setCandles(candles: Candle[]): void {
    this.candles = candles;
    this.refreshBarSecs();
  }

  setTimeframe(timeframe: string): void {
    this.timeframe = TIMEFRAMES.includes(timeframe as Timeframe)
      ? timeframe as Timeframe
      : null;
  }

  /** The chart's forward runway, in seconds, ascending and after the last candle. */
  setFutureTimes(times: number[]): void {
    this.futureTimes = times;
    // A newly selected higher timeframe can have only one revealed candle. In
    // that case there is no real-candle gap to infer, but the chart's forward
    // runway still carries the timeframe interval. Without this, a 15m anchor
    // inside the single forming 4h candle cannot be projected and disappears.
    this.refreshBarSecs();
  }

  /** Smallest positive timeline gap, which ignores weekend/session closures. */
  private refreshBarSecs(): void {
    let best = 0;
    const consider = (gap: number) => {
      if (gap > 0 && (best === 0 || gap < best)) best = gap;
    };
    for (let i = 1; i < this.candles.length; i++) {
      consider(this.candles[i]!.time - this.candles[i - 1]!.time);
    }
    const lastCandle = this.candles[this.candles.length - 1]?.time;
    if (lastCandle != null && this.futureTimes[0] != null) {
      consider(this.futureTimes[0]! - lastCandle);
    }
    for (let i = 1; i < this.futureTimes.length; i++) {
      consider(this.futureTimes[i]! - this.futureTimes[i - 1]!);
    }
    this.barSecs = best;
  }

  timeToX(time: number): number | null {
    if (!time) return null;
    // Let the chart resolve real data times first. Its logical timeline can
    // contain context/history series that are not present in the replay-only
    // candle array, so a locally reconstructed index can drift as bars replay.
    // This must run before visible-axis inversion: when the chart is panned
    // away from a drawing, coordinateToTime at the viewport edges can clamp to
    // the drawing's anchor times. Treating those clamped values as the actual
    // edges stretches a small box across the full pane.
    const scale = this.chart.timeScale();
    const exact = this.ownedCoordinate(time);
    if (exact != null) return exact;

    // A saved fine-timeframe point is normally absent from a coarser chart's
    // time scale. Place it fractionally inside its current timeframe bucket.
    // This does not depend on the viewport and never accepts the spurious x=0
    // that Lightweight Charts can return for an unknown timestamp.
    const bucket = this.timeframeBucketCoordinate(time);
    if (bucket != null) return bucket;
    // A point created on a finer timeframe may sit between two bars after the
    // chart is changed to a coarser timeframe. Interpolate between coordinates
    // supplied by the chart itself. Rebuilding an x coordinate solely from the
    // candle-array index is unsafe because Lightweight Charts can also carry
    // context and whitespace series on the shared time scale.
    const bracket = this.bracketTime(time);
    if (bracket) {
      const x0 = this.ownedCoordinate(bracket.before.time);
      const x1 = this.ownedCoordinate(bracket.after.time);
      if (x0 != null && x1 != null) {
        const span = bracket.after.time - bracket.before.time;
        const fraction = span > 0 ? (time - bracket.before.time) / span : 0;
        return x0 + (x1 - x0) * fraction;
      }
    }
    // Fine-timeframe anchors inside the currently forming last candle have no
    // later real candle to bracket them. Project them through the chart's
    // logical timeline and published runway. Unlike coordinateToTime at the
    // viewport edges, this mapping remains stable while the user pans.
    const logical = this.timeToLogical(time);
    if (logical != null) {
      const x = scale.logicalToCoordinate(logical as Logical);
      if (typeof x === "number") return x;
    }
    return null;
  }

  /** Return a coordinate only when the chart owns the requested timestamp. */
  private ownedCoordinate(time: number): number | null {
    const scale = this.chart.timeScale();
    const x = scale.timeToCoordinate(time as UTCTimestamp);
    if (typeof x !== "number") return null;
    const resolved = scale.coordinateToTime(x) as Time | null | undefined;
    // Some chart states cannot invert an otherwise valid off-screen data
    // coordinate. A concrete, different timestamp proves clamping; null does
    // not, so retain the chart-owned forward coordinate in that case.
    if (typeof resolved !== "number") return x;
    return Math.abs(resolved - time) <= 1 ? x : null;
  }

  /** Project an arbitrary timestamp into the logical slot of its display bar. */
  private timeframeBucketCoordinate(time: number): number | null {
    const timeframe = this.timeframe;
    if (!timeframe) return null;
    const start = candleBucketStart(time * 1_000, timeframe) / 1_000;
    const end = nextTimeframeTimestamp(start * 1_000, timeframe) / 1_000;
    if (!(end > start) || time < start || time > end) return null;
    const fraction = (time - start) / (end - start);
    const scale = this.chart.timeScale();

    const startX = this.ownedCoordinate(start);
    if (startX != null) {
      const logical = scale.coordinateToLogical(startX);
      if (logical != null) {
        const x = scale.logicalToCoordinate((Number(logical) + fraction) as Logical);
        if (typeof x === "number") return x;
      }
    }

    // A partial first bar may not have its opening boundary loaded. The next
    // owned boundary still identifies the same logical slot.
    const endX = this.ownedCoordinate(end);
    if (endX != null) {
      const logical = scale.coordinateToLogical(endX);
      if (logical != null) {
        const x = scale.logicalToCoordinate((Number(logical) - (1 - fraction)) as Logical);
        if (typeof x === "number") return x;
      }
    }
    return null;
  }

  priceToY(price: number): number | null {
    const c = this.series.priceToCoordinate(price);
    return typeof c === "number" ? c : null;
  }

  /** Bar time for a pixel x — extrapolated past the data edges so drawings can
   * be placed in the empty future/past area (0 only when the interval is unknown). */
  xToTime(x: number): number {
    // The chart is authoritative wherever it can round-trip a coordinate. This
    // includes the explicit whitespace runway after the latest candle. Merely
    // checking whether x sits between the first/last replay candle is not
    // sufficient: a viewport can be showing mostly future whitespace, and its
    // global logical origin also includes context/history series.
    const first = this.candles[0];
    const last = this.candles[this.candles.length - 1];
    const scale = this.chart.timeScale();
    const chartTime = scale.coordinateToTime(x) as Time | null | undefined;
    if (typeof chartTime === "number") {
      const roundTripX = scale.timeToCoordinate(chartTime as UTCTimestamp);
      // coordinateToTime may clamp genuine empty space to the nearest candle.
      // A real bar maps back within half a logical slot of the pointer; a
      // clamped edge can be many slots away. Compare logical positions rather
      // than pixels so this remains correct at every zoom level.
      if (typeof roundTripX === "number") {
        const pointerLogical = scale.coordinateToLogical(x);
        const roundTripLogical = scale.coordinateToLogical(roundTripX);
        if (
          pointerLogical != null && roundTripLogical != null &&
          Math.abs(Number(pointerLogical) - Number(roundTripLogical)) <= 0.501
        ) {
          return chartTime;
        }
      }
      const firstX = first ? scale.timeToCoordinate(first.time as UTCTimestamp) : null;
      const lastX = last ? scale.timeToCoordinate(last.time as UTCTimestamp) : null;
      if (
        first && last &&
        typeof firstX === "number" && typeof lastX === "number" &&
        x >= Math.min(firstX, lastX) && x <= Math.max(firstX, lastX) &&
        chartTime >= first.time && chartTime <= last.time
      ) {
        return chartTime;
      }
    }
    // Outside real data, logical extrapolation remains necessary because
    // coordinateToTime clamps empty space to the nearest candle.
    const logical = scale.coordinateToLogical(x);
    if (logical != null && this.candles.length && this.barSecs > 0) {
      return this.logicalToTime(logical as number);
    }
    const t = this.chart.timeScale().coordinateToTime(x) as Time | null | undefined;
    return typeof t === "number" ? t : 0;
  }

  /** Adjacent displayed candles surrounding a timestamp not on this timeframe. */
  private bracketTime(time: number): { before: Candle; after: Candle } | null {
    const candles = this.candles;
    if (candles.length < 2 || time <= candles[0]!.time || time >= candles[candles.length - 1]!.time) {
      return null;
    }
    let low = 1;
    let high = candles.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (candles[mid]!.time < time) low = mid + 1;
      else high = mid;
    }
    return { before: candles[low - 1]!, after: candles[low]! };
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
    const firstLogical = this.logicalAtTime(first) ?? 0;
    const lastLogical = this.logicalAtTime(last) ?? lastIdx;
    if (time <= first) return firstLogical + (time - first) / this.barSecs;
    if (time >= last) return lastLogical + this.futureOffset(time, last);
    // Between bars: linear interpolation within the bracketing pair.
    for (let i = 1; i <= lastIdx; i++) {
      if (cs[i]!.time >= time) {
        const t0 = cs[i - 1]!.time;
        const t1 = cs[i]!.time;
        const frac = t1 > t0 ? (time - t0) / (t1 - t0) : 0;
        // Candle indexes are local to this drawing timeline. The chart's
        // logical origin is often non-zero once higher-timeframe history and
        // context series share the axis; dropping `firstLogical` projected an
        // August 2020 anchor near the far-left 2017 edge on monthly charts.
        return firstLogical + i - 1 + frac;
      }
    }
    return lastIdx;
  }

  /**
   * How many bar slots past the last candle a time sits, following the chart's
   * own forward runway. Falls back to uniform `barSecs` steps when no runway has
   * been published — a chart with no forward whitespace has none to follow.
   */
  private futureOffset(time: number, last: number): number {
    const ft = this.futureTimes;
    const end = ft[ft.length - 1];
    if (end == null) return (time - last) / this.barSecs;
    if (time > end) return ft.length + (time - end) / this.barSecs;
    // First runway index at or after `time`; the slot before it is either the
    // previous runway point or the last real candle.
    let low = 0;
    let high = ft.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (ft[mid]! < time) low = mid + 1;
      else high = mid;
    }
    const t1 = ft[low]!;
    const t0 = low === 0 ? last : ft[low - 1]!;
    return low + (t1 > t0 ? (time - t0) / (t1 - t0) : 0);
  }

  private logicalToTime(logical: number): number {
    const cs = this.candles;
    if (cs.length === 0 || this.barSecs === 0) return 0;
    const lastIdx = cs.length - 1;
    const firstLogical = this.logicalAtTime(cs[0]!.time) ?? 0;
    const lastLogical = this.logicalAtTime(cs[lastIdx]!.time) ?? lastIdx;
    if (logical <= firstLogical) {
      return Math.round(cs[0]!.time + (logical - firstLogical) * this.barSecs);
    }
    if (logical >= lastLogical) {
      const last = cs[lastIdx]!.time;
      const ahead = logical - lastLogical;
      const ft = this.futureTimes;
      if (!ft.length) return Math.round(last + ahead * this.barSecs);
      const slot = Math.floor(ahead);
      if (slot >= ft.length) {
        return Math.round(ft[ft.length - 1]! + (ahead - ft.length) * this.barSecs);
      }
      const t0 = slot === 0 ? last : ft[slot - 1]!;
      const t1 = ft[slot]!;
      return Math.round(t0 + (ahead - slot) * (t1 - t0));
    }
    const localLogical = logical - firstLogical;
    const i = Math.max(0, Math.min(lastIdx - 1, Math.floor(localLogical)));
    const frac = localLogical - i;
    const t0 = cs[i]!.time;
    const t1 = cs[i + 1]!.time;
    return Math.round(t0 + frac * (t1 - t0));
  }

  /** Logical index of a chart-owned timestamp, including context-series offset. */
  private logicalAtTime(time: number): number | null {
    const scale = this.chart.timeScale();
    const x = this.ownedCoordinate(time);
    if (x == null) return null;
    const logical = scale.coordinateToLogical(x);
    return logical == null ? null : Number(logical);
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
