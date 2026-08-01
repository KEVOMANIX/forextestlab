export type ReplayMetricName =
  | "replay-engine"
  | "state-publication"
  | "indicator-calculation"
  | "indicator-create"
  | "indicator-destroy"
  | "candle-aggregation"
  | "chart-update"
  | "react-commit"
  | "session-save"
  | "workspace-save";

export interface ReplayMetricSummary {
  count: number;
  totalMs: number;
  maxMs: number;
  units: number;
  msPerUnit: number;
}

type MetricBucket = {
  count: number;
  totalMs: number;
  maxMs: number;
  units: number;
};

type ReplayMetricStore = Partial<Record<ReplayMetricName, MetricBucket>>;

declare global {
  interface Window {
    __FOREXTESTLAB_REPLAY_METRICS__?: ReplayMetricStore;
  }
}

function metricStore(): ReplayMetricStore | null {
  if (typeof window === "undefined") return null;
  window.__FOREXTESTLAB_REPLAY_METRICS__ ??= {};
  return window.__FOREXTESTLAB_REPLAY_METRICS__;
}

export function recordReplayMetric(
  name: ReplayMetricName,
  durationMs: number,
  units = 1,
): void {
  const store = metricStore();
  if (!store || !Number.isFinite(durationMs)) return;
  const bucket = store[name] ?? {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    units: 0,
  };
  bucket.count += 1;
  bucket.totalMs += Math.max(0, durationMs);
  bucket.maxMs = Math.max(bucket.maxMs, durationMs);
  bucket.units += Math.max(0, units);
  store[name] = bucket;
}

export function replayMetricSnapshot(
  reset = false,
): Partial<Record<ReplayMetricName, ReplayMetricSummary>> {
  const store = metricStore();
  if (!store) return {};
  const result: Partial<Record<ReplayMetricName, ReplayMetricSummary>> = {};
  for (const [name, bucket] of Object.entries(store) as [
    ReplayMetricName,
    MetricBucket,
  ][]) {
    result[name] = {
      count: bucket.count,
      totalMs: Math.round(bucket.totalMs * 10) / 10,
      maxMs: Math.round(bucket.maxMs * 10) / 10,
      units: bucket.units,
      msPerUnit:
        bucket.units > 0
          ? Math.round((bucket.totalMs / bucket.units) * 1_000) / 1_000
          : 0,
    };
  }
  if (reset) window.__FOREXTESTLAB_REPLAY_METRICS__ = {};
  return result;
}
