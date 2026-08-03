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

  constructor(
    private chart: IChartApi,
    private series: ISeriesApi<SeriesType>,
  ) {}

  setCandles(candles: Candle[]): void {
    this.candles = candles;
    this.refreshBarSecs();
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
    // Invert the chart's visible UTC axis first. Lightweight Charts can resolve
    // coordinate -> time for a fine timestamp displayed inside a coarse candle
    // while time -> coordinate incorrectly clamps that same timestamp to x=0.
    // Binary inversion uses the direction that remains authoritative and also
    // follows non-uniform session gaps such as the weekend closure.
    const visibleX = this.visibleTimeToX(time);
    if (visibleX != null) return visibleX;
    // Let the chart resolve real data times first. Its logical timeline can
    // contain context/history series that are not present in the replay-only
    // candle array, so a locally reconstructed index can drift as bars replay.
    const scale = this.chart.timeScale();
    const c = scale.timeToCoordinate(time as UTCTimestamp);
    if (typeof c === "number") {
      const resolved = scale.coordinateToTime(c) as Time | null | undefined;
      // Lightweight Charts may return the left edge (0) for a timestamp that
      // does not exist on the newly selected coarse series. Treat a coordinate
      // as authoritative only when it round-trips to the requested UTC time;
      // lower-timeframe anchors otherwise need interpolation below.
      if (typeof resolved === "number" && Math.abs(resolved - time) <= 1) return c;
    }
    // A point created on a finer timeframe may sit between two bars after the
    // chart is changed to a coarser timeframe. Interpolate between coordinates
    // supplied by the chart itself. Rebuilding an x coordinate solely from the
    // candle-array index is unsafe because Lightweight Charts can also carry
    // context and whitespace series on the shared time scale.
    const bracket = this.bracketTime(time);
    if (bracket) {
      const x0 = scale.timeToCoordinate(bracket.before.time as UTCTimestamp);
      const x1 = scale.timeToCoordinate(bracket.after.time as UTCTimestamp);
      if (typeof x0 === "number" && typeof x1 === "number") {
        const span = bracket.after.time - bracket.before.time;
        const fraction = span > 0 ? (time - bracket.before.time) / span : 0;
        return x0 + (x1 - x0) * fraction;
      }
    }
    // Fall back to logical extrapolation only for empty future/past space.
    const logical = this.timeToLogical(time);
    if (logical != null) {
      const x = scale.logicalToCoordinate(logical as Logical);
      if (typeof x === "number") return x;
    }
    return null;
  }

  /** Invert the monotonic visible time axis without assuming uniform calendar gaps. */
  private visibleTimeToX(time: number): number | null {
    if (this.width <= 0) return null;
    const scale = this.chart.timeScale();
    const leftTime = scale.coordinateToTime(0);
    const rightTime = scale.coordinateToTime(this.width);
    if (
      typeof leftTime !== "number" || typeof rightTime !== "number" ||
      leftTime >= rightTime || time < leftTime || time > rightTime
    ) {
      return null;
    }
    if (time === leftTime) return 0;
    if (time === rightTime) return this.width;

    let lowX = 0;
    let highX = this.width;
    let lowTime = leftTime;
    let highTime = rightTime;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const midX = (lowX + highX) / 2;
      const midTime = scale.coordinateToTime(midX);
      if (typeof midTime !== "number") return null;
      if (midTime < time) {
        lowX = midX;
        lowTime = midTime;
      } else {
        highX = midX;
        highTime = midTime;
      }
    }
    const span = highTime - lowTime;
    if (span <= 0) return (lowX + highX) / 2;
    const fraction = (time - lowTime) / span;
    // coordinateToTime is stepwise on a coarse series: after the binary search
    // low/high collapse onto the boundary between two bar slots. Recover both
    // bar centres from that half-logical boundary, then place the fine anchor
    // proportionally inside the coarse interval. Interpolating the collapsed
    // pixel bounds would put every lower-timeframe point on the same edge.
    if (highX - lowX < 0.01 && span > 1) {
      const logicalRange = scale.getVisibleLogicalRange();
      const logicalSpan = logicalRange ? Number(logicalRange.to) - Number(logicalRange.from) : 0;
      if (logicalSpan > 0) {
        const barSpacing = scale.width() / logicalSpan;
        const boundaryX = (lowX + highX) / 2;
        return boundaryX - barSpacing / 2 + fraction * barSpacing;
      }
    }
    return lowX + (highX - lowX) * fraction;
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
        return i - 1 + frac;
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
    const x = scale.timeToCoordinate(time as UTCTimestamp);
    if (typeof x !== "number") return null;
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
