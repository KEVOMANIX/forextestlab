"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import type { PineChartIndicator } from "@/lib/chart/pine-scripts";
import type { OHLCV } from "@/lib/chart/indicators";
import type { PineDiagnostic, PineIndicatorResult, PineSeriesInput } from "@/lib/chart/pine-runner";
import { PineRenderer, pineSignature, type PineReport } from "./pine-render";

export type { PineReport };

const MAX_BARS = 30_000;
/** A run that takes longer than this is treated as an endless loop and stopped. */
const RUN_TIMEOUT_MS = 8_000;

export type PineRunStatus = {
  state: "loading" | "ready" | "error";
  error?: string;
  diagnostics?: PineDiagnostic[];
  report?: PineReport;
  /** Code that produced this status, so the editor can tell when the chart is out of date. */
  code?: string;
  ranAt?: number;
};

type Batch = { id: number; items: { id: string; code: string }[]; times: Float64Array; timer: number };

function toSeriesInput(candles: OHLCV[]): PineSeriesInput {
  const rows = candles.length > MAX_BARS ? candles.slice(-MAX_BARS) : candles;
  const data = { time: new Float64Array(rows.length), open: new Float64Array(rows.length), high: new Float64Array(rows.length), low: new Float64Array(rows.length), close: new Float64Array(rows.length), volume: new Float64Array(rows.length) };
  rows.forEach((row, index) => {
    data.time[index] = Number(row.time) * 1000;
    data.open[index] = row.open; data.high[index] = row.high; data.low[index] = row.low; data.close[index] = row.close;
    data.volume[index] = row.volume ?? 0;
  });
  return data;
}

/**
 * Runs the chart's Pine indicators in a browser worker on exactly the candles
 * the chart shows (never past the replay time) and recalculates on every new
 * or changed candle, the way TradingView updates a script as price moves.
 */
export function usePineIndicators({
  chart,
  priceSeries,
  container,
  items,
  epoch,
  paneBase,
  getCandles,
  candleKey,
  symbol,
  timeframeMs,
  precision,
}: {
  chart: IChartApi | null;
  /** The candle series, which carries overlay markers and backgrounds. */
  priceSeries: ISeriesApi<SeriesType> | null;
  /** Chart host element, used to place legends inside script panes. */
  container: HTMLElement | null;
  items: PineChartIndicator[];
  /** Changes whenever the chart is rebuilt, so series are re-added to the new chart. */
  epoch: number;
  /** Number of panes built-in studies use; scripts' own panes follow them. */
  paneBase: number;
  /** The candles currently on the chart, oldest first. */
  getCandles: () => OHLCV[];
  /** Changes whenever the newest candle appears or moves. */
  candleKey: string;
  symbol: string;
  timeframeMs: number;
  precision: number;
}) {
  const [status, setStatus] = useState<Record<string, PineRunStatus>>({});
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [paneTops, setPaneTops] = useState<Record<string, number>>({});
  const workerRef = useRef<Worker | null>(null);
  const batchRef = useRef<Batch | null>(null);
  const dirtyRef = useRef(false);
  const nextIdRef = useRef(1);
  const hungCodeRef = useRef(new Set<string>());
  const latest = useRef({ items, getCandles, symbol, timeframeMs, precision });
  latest.current = { items, getCandles, symbol, timeframeMs, precision };

  const dispatchRef = useRef<() => void>(() => {});
  dispatchRef.current = () => {
    if (batchRef.current) { dirtyRef.current = true; return; }
    dirtyRef.current = false;
    const { items: current, getCandles: read, symbol: sym, timeframeMs: tf, precision: digits } = latest.current;
    const runnable = current.filter((item) => !hungCodeRef.current.has(item.code));
    if (runnable.length === 0) return;
    const data = toSeriesInput(read());
    if (data.time.length < 1) return;
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("./pine-chart.worker.ts", import.meta.url), { type: "module" });
      workerRef.current.onmessage = (event: MessageEvent<{ id: number; results: Record<string, PineIndicatorResult> }>) => finish(event.data.id, event.data.results);
      workerRef.current.onerror = () => fail("The script runner stopped unexpectedly.");
    }
    const id = nextIdRef.current++;
    const batchItems = runnable.map((item) => ({ id: item.id, code: item.code }));
    const timer = window.setTimeout(() => {
      // An endless loop never answers: stop the worker and leave that code alone until it is edited.
      for (const item of batchItems) hungCodeRef.current.add(item.code);
      fail(`The script took longer than ${RUN_TIMEOUT_MS / 1000} seconds and was stopped. Check for a loop that never ends.`);
    }, RUN_TIMEOUT_MS);
    batchRef.current = { id, items: batchItems, times: data.time.slice(), timer };
    setStatus((previous) => {
      const next = { ...previous };
      for (const item of batchItems) if (previous[item.id]?.code !== item.code) next[item.id] = { ...previous[item.id], state: "loading" };
      return next;
    });
    workerRef.current.postMessage({ id, items: batchItems, data, symbol: sym, timeframeMs: tf, precision: digits }, [data.time.buffer, data.open.buffer, data.high.buffer, data.low.buffer, data.close.buffer, data.volume.buffer]);
  };

  function finish(id: number, results: Record<string, PineIndicatorResult>) {
    const batch = batchRef.current;
    if (!batch || batch.id !== id) return;
    window.clearTimeout(batch.timer);
    batchRef.current = null;
    const now = Date.now();
    setStatus((previous) => {
      const next = { ...previous };
      for (const item of batch.items) {
        const result = results[item.id];
        if (!result) continue;
        next[item.id] = result.ok
          ? { state: "ready", code: item.code, ranAt: previous[item.id]?.code === item.code && previous[item.id]?.state === "ready" ? previous[item.id]!.ranAt : now, report: { overlay: result.overlay, plots: result.plots, hlines: result.hlines, fills: result.fills, backgrounds: result.backgrounds, markers: result.markers, skipped: result.skipped, converted: result.converted, times: batch.times } }
          : { state: "error", code: item.code, ranAt: now, error: result.error, diagnostics: result.diagnostics };
      }
      return next;
    });
    if (dirtyRef.current) dispatchRef.current();
  }

  function fail(message: string) {
    const batch = batchRef.current;
    if (batch) window.clearTimeout(batch.timer);
    batchRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    if (batch) {
      const now = Date.now();
      setStatus((previous) => {
        const next = { ...previous };
        for (const item of batch.items) next[item.id] = { state: "error", code: item.code, ranAt: now, error: message };
        return next;
      });
    }
    if (dirtyRef.current) dispatchRef.current();
  }

  // Recalculate whenever the scripts, the market or any candle changes.
  const codesKey = items.map((item) => `${item.id}:${item.code}`).join("\n");
  useEffect(() => {
    setStatus((previous) => {
      const live = new Set(items.map((item) => item.id));
      return Object.keys(previous).every((id) => live.has(id)) ? previous : Object.fromEntries(Object.entries(previous).filter(([id]) => live.has(id)));
    });
    dispatchRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codesKey, candleKey, symbol, timeframeMs, precision, epoch, refreshNonce]);

  useEffect(() => () => {
    if (batchRef.current) window.clearTimeout(batchRef.current.timer);
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  // Drawing. Each script's chart objects are rebuilt only when what it draws
  // changes shape (see pineSignature); a new candle just feeds them values.
  const renderersRef = useRef(new Map<string, PineRenderer>());
  const reportOf = (item: PineChartIndicator) => (status[item.id]?.code === item.code ? status[item.id]?.report : undefined);
  const layoutKey = [epoch, paneBase, ...items.map((item) => `${item.id}=${pineSignature(reportOf(item))}`)].join(";");

  useEffect(() => {
    if (!chart) return;
    const renderers = new Map<string, PineRenderer>();
    // Built-in studies own the panes directly under price; scripts follow them.
    let pane = chart.panes().length;
    for (const item of items) {
      const report = reportOf(item);
      if (!report) continue;
      renderers.set(item.id, new PineRenderer(chart, report.overlay ? 0 : pane++, priceSeries));
    }
    renderersRef.current = renderers;
    return () => {
      for (const renderer of renderers.values()) renderer.dispose();
      if (renderersRef.current === renderers) renderersRef.current = new Map();
    };
    // The layout key captures every input that changes the chart objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, priceSeries, layoutKey]);

  useEffect(() => {
    for (const item of items) {
      const report = reportOf(item);
      const renderer = renderersRef.current.get(item.id);
      if (report && renderer) {
        try { renderer.update(report, item.visible); } catch { /* A rebuilt chart drops its series; the next layout pass redraws. */ }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, status, layoutKey]);

  // Keep script-pane legends seated inside their panes.
  useEffect(() => {
    if (!chart || !container) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const host = container.getBoundingClientRect();
        const panes = chart.panes();
        const next: Record<string, number> = {};
        for (const [id, renderer] of renderersRef.current) {
          if (renderer.paneIndex === 0) continue;
          const box = panes[renderer.paneIndex]?.getHTMLElement()?.getBoundingClientRect();
          if (box) next[id] = box.top - host.top;
        }
        setPaneTops((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    chart.panes().forEach((pane) => { const element = pane.getHTMLElement(); if (element) observer.observe(element); });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [chart, container, layoutKey]);

  return {
    status,
    paneTops,
    refresh: () => { hungCodeRef.current.clear(); setRefreshNonce((value) => value + 1); },
  };
}

/** Value of each plot at a candle time (seconds), for the legend readout. */
export function pineValuesAt(report: { times: ArrayLike<number>; plots: { title: string; color: string; values: (number | null)[] }[] } | undefined, timeSeconds: number | null): { title: string; color: string; value: number | null }[] {
  if (!report) return [];
  let index = report.times.length - 1;
  if (timeSeconds != null) {
    const target = timeSeconds * 1000;
    let low = 0, high = report.times.length - 1;
    index = -1;
    while (low <= high) { const mid = (low + high) >> 1; if (report.times[mid]! <= target) { index = mid; low = mid + 1; } else high = mid - 1; }
  }
  return report.plots.map((plot) => ({ title: plot.title, color: plot.color, value: index >= 0 ? plot.values[index] ?? null : null }));
}
