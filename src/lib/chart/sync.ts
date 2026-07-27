import type { IChartApi, ISeriesApi, SeriesType, Time, UTCTimestamp } from "lightweight-charts";

/**
 * Cross-chart synchronisation for multi-chart layouts.
 *
 * Lightweight Charts has panes but no multi-chart layout, so a grid is N
 * independent chart instances. This registry is what makes them feel like one
 * workspace: scrolling any cell moves the others to the same moment, and the
 * crosshair is mirrored everywhere. Zoom stays per chart — see [alignedFrom].
 *
 * Sync is by *timestamp*, never by logical index — cells can be on different
 * timeframes, where bar 200 means a different moment on each chart.
 */

export interface SyncMember {
  chart: IChartApi;
  /** Resolved late: the series is rebuilt whenever the chart type changes. */
  series: () => ISeriesApi<SeriesType> | null;
}

/** Seconds-based UTC timestamps, matching the series `time` values we feed. */
export interface TimeRange {
  from: number;
  to: number;
}

function timeToSeconds(time: Time): number | null {
  if (typeof time === "number") return time;
  if (typeof time === "string") {
    const parsed = Date.parse(time);
    return Number.isNaN(parsed) ? null : parsed / 1000;
  }
  return Date.UTC(time.year, time.month - 1, time.day) / 1000;
}

/**
 * Closest bar at or before `seconds` in an ascending series. The crosshair on a
 * peer chart has to land on one of *its* bars, which for a higher timeframe is
 * the bucket containing the source time.
 */
function valueAt(series: ISeriesApi<SeriesType>, seconds: number): { time: Time; price: number } | null {
  const data = series.data();
  if (data.length === 0) return null;
  let low = 0;
  let high = data.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const midTime = timeToSeconds(data[mid]!.time);
    if (midTime == null) return null;
    if (midTime <= seconds) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (found < 0) return null;
  const bar = data[found] as { time: Time; close?: number; value?: number };
  const price = bar.close ?? bar.value;
  if (price == null) return null;
  return { time: bar.time, price };
}

/**
 * How long a chart ignores its own range-change events after a peer moved it.
 * Lightweight Charts reports the applied range on a later frame, and clamps it
 * to whole bars, so a pushed range never echoes back byte-identical — a value
 * comparison would oscillate where a short quiet window simply converges.
 */
const ECHO_WINDOW_MS = 200;

/**
 * Where a peer's view should start so that it ends at the same moment as the
 * source while keeping the span — the zoom level — it already had.
 *
 * Scrolling is shared, zooming is not: aligning the right edge puts every cell
 * on the same point in time, but a chart held at a wide higher-timeframe view
 * stays wide when another cell zooms into a few minutes.
 */
export function alignedFrom(peerVisible: { from: Time; to: Time } | null, source: TimeRange): number {
  if (!peerVisible) return source.from;
  const from = timeToSeconds(peerVisible.from);
  const to = timeToSeconds(peerVisible.to);
  if (from == null || to == null) return source.from;
  const span = to - from;
  return span > 0 ? source.to - span : source.from;
}

export class ChartSync {
  private readonly members = new Map<string, SyncMember>();
  /** Per-member timestamp until which its range events are peer-induced echoes. */
  private readonly echoUntil = new Map<string, number>();
  /** Re-entrancy guard: applying a range to a peer re-fires its own listener. */
  private applying = false;
  /** Crosshair and time sync are independent options, as they are in TradingView. */
  private modes = { crosshair: true, time: true };

  register(id: string, member: SyncMember): () => void {
    this.members.set(id, member);
    return () => {
      if (this.members.get(id) !== member) return;
      this.members.delete(id);
      this.echoUntil.delete(id);
    };
  }

  setModes(modes: { crosshair: boolean; time: boolean }) {
    this.modes = modes;
  }

  /** True while a peer update is being applied — callers skip their own work. */
  get busy(): boolean {
    return this.applying;
  }

  broadcastRange(sourceId: string, visible: { from: Time; to: Time } | null) {
    if (!this.modes.time || this.applying || !visible || this.members.size < 2) return;
    const from = timeToSeconds(visible.from);
    const to = timeToSeconds(visible.to);
    if (from == null || to == null) return;
    const range: TimeRange = { from, to };
    const now = performance.now();
    // This chart is only echoing a move a peer just pushed onto it.
    if (now < (this.echoUntil.get(sourceId) ?? 0)) return;
    this.applying = true;
    try {
      for (const [id, member] of this.members) {
        if (id === sourceId) continue;
        try {
          const scale = member.chart.timeScale();
          scale.setVisibleRange({
            from: alignedFrom(scale.getVisibleRange(), range) as UTCTimestamp,
            to: range.to as UTCTimestamp,
          });
          this.echoUntil.set(id, now + ECHO_WINDOW_MS);
        } catch {
          // A peer without data covering the range simply keeps its own view.
        }
      }
    } finally {
      this.applying = false;
    }
  }

  broadcastCrosshair(sourceId: string, time: Time | null) {
    if (!this.modes.crosshair || this.applying || this.members.size < 2) return;
    const seconds = time == null ? null : timeToSeconds(time);
    this.applying = true;
    try {
      for (const [id, member] of this.members) {
        if (id === sourceId) continue;
        const series = member.series();
        if (!series) continue;
        if (seconds == null) {
          member.chart.clearCrosshairPosition();
          continue;
        }
        const point = valueAt(series, seconds);
        if (!point) {
          member.chart.clearCrosshairPosition();
          continue;
        }
        member.chart.setCrosshairPosition(point.price, point.time, series);
      }
    } finally {
      this.applying = false;
    }
  }
}
