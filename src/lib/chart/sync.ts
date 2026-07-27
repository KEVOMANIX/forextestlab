import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";

/**
 * Cross-chart synchronisation for multi-chart layouts.
 *
 * Lightweight Charts has panes but no multi-chart layout, so a grid is N
 * independent chart instances. This registry is what makes them feel like one
 * workspace: the crosshair is mirrored by timestamp while every chart keeps its
 * own viewport. A 1D chart and a 1m chart have fundamentally different useful
 * zoom levels, so pan and zoom are deliberately never broadcast.
 *
 * Sync is by *timestamp*, never by logical index — cells can be on different
 * timeframes, where bar 200 means a different moment on each chart.
 */

export interface SyncMember {
  chart: IChartApi;
  /** Resolved late: the series is rebuilt whenever the chart type changes. */
  series: () => ISeriesApi<SeriesType> | null;
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

export class ChartSync {
  private readonly members = new Map<string, SyncMember>();
  /** Re-entrancy guard for mirrored crosshair updates. */
  private applying = false;
  private crosshairEnabled = true;

  register(id: string, member: SyncMember): () => void {
    this.members.set(id, member);
    return () => {
      if (this.members.get(id) !== member) return;
      this.members.delete(id);
    };
  }

  setCrosshairEnabled(enabled: boolean) {
    this.crosshairEnabled = enabled;
  }

  /** True while a peer update is being applied — callers skip their own work. */
  get busy(): boolean {
    return this.applying;
  }

  broadcastCrosshair(sourceId: string, time: Time | null) {
    if (!this.crosshairEnabled || this.applying || this.members.size < 2) return;
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
