"use client";

import { useEffect, useRef } from "react";
import { ColorType, CrosshairMode, createChart, type IChartApi, type Time } from "lightweight-charts";
import { Eye, EyeOff, Settings2, Trash2 } from "lucide-react";

import { DISPLAY_TIME_ZONE, formatNewYorkDateTime } from "@/lib/date-time";
import { indicatorLabel, type IndicatorInstance } from "@/lib/chart/indicator-defs";
import { Indicator } from "@/lib/chart/indicator-runtime";
import type { OHLCV } from "@/lib/chart/indicators";

interface Props {
  instance: IndicatorInstance;
  candles: OHLCV[];
  theme: "dark" | "light";
  precision: number;
  mainChart: IChartApi | null;
  /** Bump to force a time-scale re-sync (e.g. main series rebuilt). */
  syncVersion: number;
  height: number;
  /** Only the bottom-most pane renders the shared time axis (TradingView-style). */
  showTimeAxis: boolean;
  onEdit: () => void;
  onToggleVisible: () => void;
  onRemove: () => void;
}

const GRID = { dark: "rgba(255,255,255,0.05)", light: "rgba(15,23,42,0.06)" };
const TEXT = { dark: "#93a1b8", light: "#566179" };
const BORDER = { dark: "rgba(255,255,255,0.10)", light: "#d9e0ec" };
const BG = { dark: "#0b0f1a", light: "#ffffff" };

// Match the main chart's New-York-timezone axis formatting exactly, so the
// shared bottom axis reads identically to the price pane.
const tickFmt = new Intl.DateTimeFormat("en", {
  timeZone: DISPLAY_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const timeMs = (t: Time): number => (typeof t === "number" ? t * 1000 : typeof t === "string" ? Date.parse(t) : Date.UTC(t.year, t.month - 1, t.day, 12));
const approxEq = (a: { from: number; to: number }, b: { from: number; to: number }) => Math.abs(a.from - b.from) < 0.01 && Math.abs(a.to - b.to) < 0.01;

export function IndicatorPane({ instance, candles, theme, precision, mainChart, syncVersion, height, showTimeAxis, onEdit, onToggleVisible, onRemove }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const indicatorRef = useRef<Indicator | null>(null);
  const syncingRef = useRef(false);

  // Create the sub-chart + indicator controller once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const chart = createChart(host, {
      layout: { background: { type: ColorType.Solid, color: BG[theme] }, textColor: TEXT[theme], fontFamily: "inherit" },
      grid: { vertLines: { color: GRID[theme] }, horzLines: { color: GRID[theme] } },
      rightPriceScale: { borderColor: BORDER[theme], scaleMargins: { top: 0.18, bottom: 0.12 } },
      timeScale: {
        borderColor: BORDER[theme],
        timeVisible: true,
        secondsVisible: false,
        visible: showTimeAxis,
        tickMarkFormatter: (t: Time) => tickFmt.format(timeMs(t)),
      },
      localization: {
        timeFormatter: (t: Time) => formatNewYorkDateTime(timeMs(t), { weekday: "long", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
      autoSize: true,
    });
    chartRef.current = chart;
    const indicator = new Indicator(chart, instance, precision);
    indicator.initialize();
    indicator.update(instance, candles);
    indicatorRef.current = indicator;
    return () => {
      indicator.destroy();
      chart.remove();
      chartRef.current = null;
      indicatorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme + axis-visibility updates.
  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: { background: { type: ColorType.Solid, color: BG[theme] }, textColor: TEXT[theme] },
      grid: { vertLines: { color: GRID[theme] }, horzLines: { color: GRID[theme] } },
      rightPriceScale: { borderColor: BORDER[theme] },
      timeScale: { borderColor: BORDER[theme], visible: showTimeAxis },
    });
  }, [theme, showTimeAxis]);

  // Re-run the indicator when its config or the candle data changes.
  useEffect(() => {
    indicatorRef.current?.update(instance, candles);
  }, [instance, candles]);

  // Two-way time-range sync with the main chart. Skip no-op sets so the two
  // charts can't feed each other into a jitter loop while panning / zooming.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mainChart) return;
    const mainScale = mainChart.timeScale();
    const subScale = chart.timeScale();
    const applyFromMain = () => {
      if (syncingRef.current) return;
      const r = mainScale.getVisibleLogicalRange();
      const cur = subScale.getVisibleLogicalRange();
      if (!r || (cur && approxEq(cur, r))) return;
      syncingRef.current = true;
      subScale.setVisibleLogicalRange(r);
      syncingRef.current = false;
    };
    const applyFromSub = () => {
      if (syncingRef.current) return;
      const r = subScale.getVisibleLogicalRange();
      const cur = mainScale.getVisibleLogicalRange();
      if (!r || (cur && approxEq(cur, r))) return;
      syncingRef.current = true;
      mainScale.setVisibleLogicalRange(r);
      syncingRef.current = false;
    };
    mainScale.subscribeVisibleLogicalRangeChange(applyFromMain);
    subScale.subscribeVisibleLogicalRangeChange(applyFromSub);
    applyFromMain();
    return () => {
      mainScale.unsubscribeVisibleLogicalRangeChange(applyFromMain);
      subScale.unsubscribeVisibleLogicalRangeChange(applyFromSub);
    };
  }, [mainChart, syncVersion]);

  return (
    <div className="group relative border-t app-border" style={{ height }}>
      <div className="pointer-events-none absolute left-2 top-1 z-10 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
        <span className={instance.visible ? "app-muted" : "app-muted line-through opacity-60"}>{indicatorLabel(instance)}</span>
        <span className="pointer-events-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" aria-label={instance.visible ? "Hide" : "Show"} onClick={onToggleVisible} className="app-muted hover:text-[var(--app-text)]">
            {instance.visible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
          <button type="button" aria-label="Settings" onClick={onEdit} className="app-muted hover:text-[var(--app-text)]">
            <Settings2 size={12} />
          </button>
          <button type="button" aria-label="Remove" onClick={onRemove} className="app-muted hover:text-bear">
            <Trash2 size={12} />
          </button>
        </span>
      </div>
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}
