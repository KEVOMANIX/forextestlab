"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import type { PineChartIndicator } from "@/lib/chart/pine-scripts";
import { applyPineInputs } from "@/lib/chart/pine-inputs";
import type { OHLCV } from "@/lib/chart/indicators";
import type { PineDiagnostic, PineFeed, PineFeedNeed, PineIndicatorResult, PineSeriesInput } from "@/lib/chart/pine-runner";
import { pineFeedLoader } from "@/lib/chart/pine-feeds";
import type { Candle } from "@/lib/market-data/types";
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

/** `code` is the script as written; `run` is that code with the Inputs tab values applied. */
type Batch = { id: number; items: { id: string; code: string; run: string; timeframe?: string }[]; from: number; times: Float64Array; opens: Float64Array; highs: Float64Array; lows: Float64Array; closes: Float64Array; timer: number };

/** Candles loaded for a script's request.security() (another market or a lower timeframe). */
type FeedEntry = { need: PineFeedNeed; candles: Candle[]; loading: boolean; error?: string; checkedAt: number };

/** A feed trimmed to the candles that had closed by `until` (the chart's newest candle), so no script sees ahead of the replay. */
function feedUntil(entry: FeedEntry, until: number, timeframe: string): PineFeed {
  const rows = entry.candles.filter((candle) => candle.timestamp + entry.need.timeframeMs <= until);
  return {
    time: rows.map((row) => row.timestamp), open: rows.map((row) => Number(row.open)), high: rows.map((row) => Number(row.high)),
    low: rows.map((row) => Number(row.low)), close: rows.map((row) => Number(row.close)), volume: rows.map((row) => Number(row.volume ?? 0)), timeframe,
  };
}
const pineTf = (ms: number) => { const minutes = Math.round(ms / 60_000); return minutes % 10_080 === 0 ? `${minutes / 10_080}W` : minutes % 1440 === 0 ? `${minutes / 1440}D` : String(minutes); };

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
  theme = "dark",
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
  /** Chart theme, which scripts read as chart.fg_color / chart.bg_color. */
  theme?: "dark" | "light";
}) {
  const [status, setStatus] = useState<Record<string, PineRunStatus>>({});
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [paneTops, setPaneTops] = useState<Record<string, number>>({});
  const workerRef = useRef<Worker | null>(null);
  const batchRef = useRef<Batch | null>(null);
  const dirtyRef = useRef(false);
  const nextIdRef = useRef(1);
  const hungCodeRef = useRef(new Set<string>());
  const feedsRef = useRef(new Map<string, FeedEntry>());
  const feedSymbolRef = useRef(symbol);
  if (feedSymbolRef.current !== symbol) { feedSymbolRef.current = symbol; feedsRef.current.clear(); }

  /** Loads (or tops up) one feed, then recalculates. */
  function loadFeed(need: PineFeedNeed, from: number) {
    const load = pineFeedLoader();
    const known = feedsRef.current.get(need.key);
    if (known?.loading) return;
    const entry: FeedEntry = known ?? { need, candles: [], loading: false, checkedAt: 0 };
    feedsRef.current.set(need.key, entry);
    if (!load) { entry.error = "Other markets and lower timeframes load inside a replay session."; return; }
    entry.loading = true;
    entry.checkedAt = Date.now();
    const start = entry.candles.length ? entry.candles[entry.candles.length - 1]!.timestamp : from;
    load(need.symbol, need.timeframe, start).then((candles) => {
      if (feedsRef.current.get(need.key) !== entry) return;
      const merged = entry.candles.filter((candle) => candle.timestamp < (candles[0]?.timestamp ?? Infinity));
      entry.candles = [...merged, ...candles].slice(-MAX_BARS);
      entry.error = undefined;
    }).catch((error: unknown) => {
      entry.error = error instanceof Error ? error.message : `${need.symbol} data could not be loaded.`;
    }).finally(() => {
      entry.loading = false;
      dispatchRef.current();
    });
  }
  const latest = useRef({ items, getCandles, symbol, timeframeMs, precision, theme });
  latest.current = { items, getCandles, symbol, timeframeMs, precision, theme };

  const dispatchRef = useRef<() => void>(() => {});
  dispatchRef.current = () => {
    if (batchRef.current) { dirtyRef.current = true; return; }
    dirtyRef.current = false;
    const { items: current, getCandles: read, symbol: sym, timeframeMs: tf, precision: digits, theme: chartTheme } = latest.current;
    const runnable = current.map((item) => ({ item, run: applyPineInputs(item.code, item.inputs) })).filter(({ run }) => !hungCodeRef.current.has(run));
    if (runnable.length === 0) return;
    const data = toSeriesInput(read());
    if (data.time.length < 1) return;
    const until = data.time[data.time.length - 1]!;
    const feeds: Record<string, PineFeed> = {};
    for (const [key, entry] of feedsRef.current) {
      if (!entry.candles.length && entry.error) continue;
      if (entry.candles.length || !entry.loading) feeds[key] = feedUntil(entry, until, pineTf(entry.need.timeframeMs));
      // Replay moved past the loaded candles: fetch the newer ones (at most every few seconds).
      const last = entry.candles[entry.candles.length - 1]?.timestamp ?? -Infinity;
      if (!entry.loading && until > last + entry.need.timeframeMs && Date.now() - entry.checkedAt > 3_000) loadFeed(entry.need, data.time[0]!);
    }
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("./pine-chart.worker.ts", import.meta.url), { type: "module" });
      workerRef.current.onmessage = (event: MessageEvent<{ id: number; results: Record<string, PineIndicatorResult> }>) => finish(event.data.id, event.data.results);
      workerRef.current.onerror = () => fail("The script runner stopped unexpectedly.");
    }
    const id = nextIdRef.current++;
    const batchItems = runnable.map(({ item, run }) => ({ id: item.id, code: item.code, run, timeframe: item.timeframe }));
    const timer = window.setTimeout(() => {
      // An endless loop never answers: stop the worker and leave that code alone until it is edited.
      for (const item of batchItems) hungCodeRef.current.add(item.run);
      fail(`The script took longer than ${RUN_TIMEOUT_MS / 1000} seconds and was stopped. Check for a loop that never ends.`);
    }, RUN_TIMEOUT_MS);
    batchRef.current = { id, items: batchItems, from: data.time[0]!, times: data.time.slice(), opens: data.open.slice(), highs: data.high.slice(), lows: data.low.slice(), closes: data.close.slice(), timer };
    setStatus((previous) => {
      const next = { ...previous };
      for (const item of batchItems) if (previous[item.id]?.code !== item.code) next[item.id] = { ...previous[item.id], state: "loading" };
      return next;
    });
    workerRef.current.postMessage({ id, items: batchItems.map((item) => ({ id: item.id, code: item.run, timeframe: item.timeframe })), data, feeds, symbol: sym, timeframeMs: tf, precision: digits, theme: chartTheme }, [data.time.buffer, data.open.buffer, data.high.buffer, data.low.buffer, data.close.buffer, data.volume.buffer]);
  };

  function finish(id: number, results: Record<string, PineIndicatorResult>) {
    const batch = batchRef.current;
    if (!batch || batch.id !== id) return;
    window.clearTimeout(batch.timer);
    batchRef.current = null;
    const now = Date.now();
    // Scripts waiting for other markets: start those loads, and show a load failure instead of "Loading…".
    for (const [itemId, result] of Object.entries(results)) {
      if (result.ok || !result.needs) continue;
      for (const need of result.needs) if (!feedsRef.current.has(need.key)) loadFeed(need, batch.from);
      const failed = result.needs.map((need) => feedsRef.current.get(need.key)?.error).find(Boolean);
      results[itemId] = failed ? { ok: false, error: failed } : result;
    }
    setStatus((previous) => {
      const next = { ...previous };
      for (const item of batch.items) {
        const result = results[item.id];
        if (!result) continue;
        next[item.id] = result.ok
          ? { state: "ready", code: item.code, ranAt: previous[item.id]?.code === item.code && previous[item.id]?.state === "ready" ? previous[item.id]!.ranAt : now, report: { overlay: result.overlay, plots: result.plots, hlines: result.hlines, fills: result.fills, backgrounds: result.backgrounds, shapes: result.shapes, drawings: result.drawings, barcolors: result.barcolors, candles: result.candles, skipped: result.skipped, converted: result.converted, times: batch.times, opens: batch.opens, highs: batch.highs, lows: batch.lows, closes: batch.closes } }
          : result.needs ? { ...previous[item.id], state: "loading", code: item.code, error: result.error } : { state: "error", code: item.code, ranAt: now, error: result.error, diagnostics: result.diagnostics };
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
  const codesKey = items.map((item) => `${item.id}:${item.timeframe ?? ""}:${item.code}:${JSON.stringify(item.inputs ?? {})}`).join("\n");
  useEffect(() => {
    setStatus((previous) => {
      const live = new Set(items.map((item) => item.id));
      return Object.keys(previous).every((id) => live.has(id)) ? previous : Object.fromEntries(Object.entries(previous).filter(([id]) => live.has(id)));
    });
    dispatchRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codesKey, candleKey, symbol, timeframeMs, precision, theme, epoch, refreshNonce]);

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
        try { renderer.update(report, item.visible, item.style); } catch { /* A rebuilt chart drops its series; the next layout pass redraws. */ }
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
