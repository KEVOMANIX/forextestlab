"use client";

import { useEffect, useRef, useState } from "react";
import { LineSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { PineChartIndicator } from "@/lib/chart/pine-scripts";

export const PINE_TIMEFRAMES = ["15m", "1h", "4h", "1d"] as const;
type PineTimeframe = (typeof PINE_TIMEFRAMES)[number];
const MAX_BARS = 30_000;
const TIMEFRAME_MS: Record<PineTimeframe, number> = { "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };
/** Wait this long after the replay stops moving before recalculating, so playing a session does not fire a run per candle. */
const REFRESH_DELAY_MS = 2_500;

export type PineDiagnostic = { line: number; message: string };
type Plot = { title: string; color: string; linewidth?: number; values: (number | null)[] };
type Report = { kind: string; overlay: boolean; times: number[]; plots: Plot[] };
export type PineRunStatus = {
  state: "loading" | "ready" | "error";
  error?: string;
  diagnostics?: PineDiagnostic[];
  report?: Report;
  /** Code that produced `report`, so the editor can tell when the chart is out of date. */
  code?: string;
  ranAt?: number;
};

type Result = { ok: true; report: Report } | { ok: false; error: string; diagnostics?: PineDiagnostic[] };
const resultCache = new Map<string, Result>();
function remember(key: string, result: Result) {
  resultCache.delete(key);
  resultCache.set(key, result);
  while (resultCache.size > 24) resultCache.delete(resultCache.keys().next().value!);
}

async function runPine(input: { code: string; symbol: string; source: string; timeframe: PineTimeframe; startTime: number; endTime: number }, signal: AbortSignal): Promise<Result> {
  const key = JSON.stringify(input);
  const cached = resultCache.get(key);
  if (cached) return cached;
  const response = await fetch("/api/strategy-tests/pine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ ...input, startingBalance: 10_000, purpose: "chart" }),
  });
  const data = await response.json().catch(() => null) as { ok?: boolean; error?: string; diagnostics?: PineDiagnostic[]; report?: Report } | null;
  let result: Result;
  if (response.ok && data?.ok && data.report?.kind === "indicator") result = { ok: true, report: data.report };
  else if (response.ok && data?.ok && data.report) result = { ok: false, error: "This is a strategy script. Run strategies in Strategy Lab; the chart shows indicator() scripts." };
  else result = { ok: false, error: data?.error ?? "Could not run the script.", diagnostics: data?.diagnostics };
  // Rate limits and outages are transient; script errors and plots are worth keeping.
  if (result.ok || response.status === 400 || response.status === 422 || result.diagnostics?.length) remember(key, result);
  return result;
}

/**
 * Runs the chart's Pine indicators on the candles the chart has revealed so far
 * (never past the replay time) and draws their plot() output.
 */
export function usePineIndicators({
  chart,
  items,
  symbol,
  source,
  timeframe,
  epoch,
  paneBase,
  getRange,
  endTime,
  container,
}: {
  chart: IChartApi | null;
  items: PineChartIndicator[];
  symbol: string;
  source: string;
  timeframe: string;
  /** Changes whenever the chart is rebuilt, so series are re-added to the new chart. */
  epoch: number;
  /** First free pane index for scripts that are not overlays. */
  paneBase: number;
  /** First and last revealed candle times, in seconds. */
  getRange: () => { start: number; end: number } | null;
  /** Time of the newest revealed candle; a later value triggers a recalculation. */
  endTime: number | null;
  /** Chart host element, used to place legends inside script panes. */
  container: HTMLElement | null;
}) {
  const [status, setStatus] = useState<Record<string, PineRunStatus>>({});
  const [refreshNonce, setRefreshNonce] = useState(0);
  const requestedRef = useRef(new Map<string, string>());
  const controllersRef = useRef(new Map<string, AbortController>());
  const seriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const [settledEnd, setSettledEnd] = useState(endTime);
  const [paneTops, setPaneTops] = useState<Record<string, number>>({});

  useEffect(() => {
    if (settledEnd === endTime) return;
    const timer = window.setTimeout(() => setSettledEnd(endTime), REFRESH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [endTime, settledEnd]);

  // Calculation: run each script whose inputs changed.
  useEffect(() => {
    const live = new Set(items.map(item => item.id));
    for (const [id, controller] of controllersRef.current) if (!live.has(id)) { controller.abort(); controllersRef.current.delete(id); requestedRef.current.delete(id); }
    setStatus(current => Object.fromEntries(Object.entries(current).filter(([id]) => live.has(id))));
    const range = getRange();
    if (!range || !symbol) return;
    const supported = (PINE_TIMEFRAMES as readonly string[]).includes(timeframe);
    for (const item of items) {
      const runKey = JSON.stringify([item.code, symbol, source, timeframe, range.end, refreshNonce]);
      if (requestedRef.current.get(item.id) === runKey) continue;
      requestedRef.current.set(item.id, runKey);
      controllersRef.current.get(item.id)?.abort();
      if (!supported) {
        setStatus(current => ({ ...current, [item.id]: { state: "error", error: "Pine scripts run on 15m, 1H, 4H and 1D charts. Switch the chart timeframe to see this script.", code: item.code } }));
        continue;
      }
      const tf = timeframe as PineTimeframe;
      const endMs = range.end * 1000;
      const startMs = Math.max(range.start * 1000, endMs - TIMEFRAME_MS[tf] * (MAX_BARS - 1));
      const controller = new AbortController();
      controllersRef.current.set(item.id, controller);
      setStatus(current => ({ ...current, [item.id]: { ...current[item.id], state: "loading" } }));
      void runPine({ code: item.code, symbol, source, timeframe: tf, startTime: startMs, endTime: endMs }, controller.signal)
        .then(result => {
          if (controller.signal.aborted) return;
          setStatus(current => ({
            ...current,
            [item.id]: result.ok
              ? { state: "ready", report: result.report, code: item.code, ranAt: Date.now() }
              : { state: "error", error: result.error, diagnostics: result.diagnostics, code: item.code, ranAt: Date.now() },
          }));
        })
        .catch(error => {
          if (controller.signal.aborted) return;
          requestedRef.current.delete(item.id);
          setStatus(current => ({ ...current, [item.id]: { state: "error", error: error instanceof Error ? error.message : "Could not run the script.", code: item.code } }));
        })
        .finally(() => { if (controllersRef.current.get(item.id) === controller) controllersRef.current.delete(item.id); });
    }
    // getRange reads refs; settledEnd stands in for the revealed range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, symbol, source, timeframe, settledEnd, refreshNonce, epoch]);

  useEffect(() => () => { for (const controller of controllersRef.current.values()) controller.abort(); }, []);

  // Drawing: rebuild the plot series from the latest results.
  useEffect(() => {
    if (!chart) return;
    const removeAll = () => {
      for (const series of seriesRef.current) { try { chart.removeSeries(series); } catch { /* The chart was rebuilt. */ } }
      seriesRef.current = [];
    };
    removeAll();
    // Built-in studies own the panes directly under price; scripts follow them.
    let pane = chart.panes().length;
    const panesById = new Map<string, number>();
    for (const item of items) {
      const report = status[item.id]?.report;
      if (!report || status[item.id]?.code !== item.code) continue;
      const paneIndex = report.overlay ? 0 : pane++;
      if (paneIndex > 0) panesById.set(item.id, paneIndex);
      for (const plot of report.plots) {
        const series = chart.addSeries(LineSeries, { color: plot.color || "#2962FF", lineWidth: Math.min(4, Math.max(1, plot.linewidth ?? 2)) as 1 | 2 | 3 | 4, priceLineVisible: false, lastValueVisible: item.visible, visible: item.visible, crosshairMarkerVisible: item.visible, title: "" }, paneIndex);
        series.setData(plot.values.flatMap((value, index) => value == null || !Number.isFinite(value) || report.times[index] == null ? [] : [{ time: Math.floor(report.times[index]! / 1000) as UTCTimestamp, value }]));
        seriesRef.current.push(series);
      }
    }
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const host = container?.getBoundingClientRect();
        if (!host) return;
        const panes = chart.panes();
        const next: Record<string, number> = {};
        for (const [id, index] of panesById) {
          const box = panes[index]?.getHTMLElement()?.getBoundingClientRect();
          if (box) next[id] = box.top - host.top;
        }
        setPaneTops(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (container) observer.observe(container);
    chart.panes().forEach(item => { const element = item.getHTMLElement(); if (element) observer.observe(element); });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); removeAll(); };
  }, [chart, container, items, status, paneBase, epoch]);

  return { status, paneTops, refresh: () => { requestedRef.current.clear(); setRefreshNonce(value => value + 1); } };
}

/** Value of each plot at a candle time (seconds), for the legend readout. */
export function pineValuesAt(report: Report | undefined, timeSeconds: number | null): { title: string; color: string; value: number | null }[] {
  if (!report) return [];
  let index = report.times.length - 1;
  if (timeSeconds != null) {
    const target = timeSeconds * 1000;
    let low = 0, high = report.times.length - 1;
    index = -1;
    while (low <= high) { const mid = (low + high) >> 1; if (report.times[mid]! <= target) { index = mid; low = mid + 1; } else high = mid - 1; }
  }
  return report.plots.map(plot => ({ title: plot.title, color: plot.color, value: index >= 0 ? plot.values[index] ?? null : null }));
}
