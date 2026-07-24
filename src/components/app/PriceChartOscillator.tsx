"use client";

import { useEffect, useRef } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type HistogramData,
  type Time,
  type UTCTimestamp,
  type WhitespaceData,
} from "lightweight-charts";

import { macd, rsi, type OHLCV } from "@/lib/chart/indicators";

type LinePoint = LineData<Time> | WhitespaceData<Time>;

interface Props {
  candles: OHLCV[];
  type: "rsi" | "macd";
  theme: "dark" | "light";
  mainChart: IChartApi | null;
  syncVersion: number;
}

const GRID = { dark: "rgba(255,255,255,0.05)", light: "rgba(15,23,42,0.06)" };
const TEXT = { dark: "#93a1b8", light: "#566179" };
const BORDER = { dark: "rgba(255,255,255,0.10)", light: "#d9e0ec" };
const BG = { dark: "#0b0f1a", light: "#ffffff" };
const BULL = "#22c3a0";
const BEAR = "#f4646c";
const ACCENT = "#5b8bff";
const AMBER = "#fbbf24";

export function PriceChartOscillator({ candles, type, theme, mainChart, syncVersion }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Record<string, ISeriesApi<"Line"> | ISeriesApi<"Histogram">>>({});
  const syncingRef = useRef(false);

  // Create the sub-chart once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const chart = createChart(host, {
      layout: { background: { type: ColorType.Solid, color: BG[theme] }, textColor: TEXT[theme], fontFamily: "inherit" },
      grid: { vertLines: { color: GRID[theme] }, horzLines: { color: GRID[theme] } },
      rightPriceScale: { borderColor: BORDER[theme], scaleMargins: { top: 0.15, bottom: 0.12 } },
      timeScale: { borderColor: BORDER[theme], timeVisible: true, secondsVisible: false, visible: true },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
      autoSize: true,
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme updates.
  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: { background: { type: ColorType.Solid, color: BG[theme] }, textColor: TEXT[theme] },
      grid: { vertLines: { color: GRID[theme] }, horzLines: { color: GRID[theme] } },
      rightPriceScale: { borderColor: BORDER[theme] },
      timeScale: { borderColor: BORDER[theme] },
    });
  }, [theme]);

  // (Re)build series when the oscillator type changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const s of Object.values(seriesRef.current)) chart.removeSeries(s);
    seriesRef.current = {};
    if (type === "rsi") {
      const line = chart.addLineSeries({ color: ACCENT, lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
      line.createPriceLine({ price: 70, color: BEAR, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "70" });
      line.createPriceLine({ price: 30, color: BULL, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "30" });
      seriesRef.current.rsi = line;
    } else {
      seriesRef.current.hist = chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
      seriesRef.current.macd = chart.addLineSeries({ color: ACCENT, lineWidth: 2, priceLineVisible: false });
      seriesRef.current.signal = chart.addLineSeries({ color: AMBER, lineWidth: 1, priceLineVisible: false });
    }
  }, [type]);

  // Feed data whenever candles or type change.
  useEffect(() => {
    const closes = candles.map((c) => c.close);
    if (type === "rsi") {
      const values = rsi(closes, 14);
      const data: LinePoint[] = candles.map((c, i) =>
        values[i] == null ? { time: c.time as UTCTimestamp } : { time: c.time as UTCTimestamp, value: values[i] as number },
      );
      seriesRef.current.rsi?.setData(data as LineData<Time>[]);
    } else {
      const points = macd(closes, 12, 26, 9);
      const macdLine: LinePoint[] = [];
      const signalLine: LinePoint[] = [];
      const hist: (HistogramData<Time> | WhitespaceData<Time>)[] = [];
      candles.forEach((c, i) => {
        const t = c.time as UTCTimestamp;
        const p = points[i]!;
        macdLine.push(p.macd == null ? { time: t } : { time: t, value: p.macd });
        signalLine.push(p.signal == null ? { time: t } : { time: t, value: p.signal });
        hist.push(
          p.hist == null
            ? { time: t }
            : { time: t, value: p.hist, color: p.hist >= 0 ? "rgba(34,195,160,0.5)" : "rgba(244,100,108,0.5)" },
        );
      });
      (seriesRef.current.macd as ISeriesApi<"Line">)?.setData(macdLine as LineData<Time>[]);
      (seriesRef.current.signal as ISeriesApi<"Line">)?.setData(signalLine as LineData<Time>[]);
      (seriesRef.current.hist as ISeriesApi<"Histogram">)?.setData(hist as HistogramData<Time>[]);
    }
  }, [candles, type]);

  // Two-way time-range sync with the main chart.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mainChart) return;
    const mainScale = mainChart.timeScale();
    const subScale = chart.timeScale();

    const applyFromMain = () => {
      if (syncingRef.current) return;
      const r = mainScale.getVisibleLogicalRange();
      if (!r) return;
      syncingRef.current = true;
      subScale.setVisibleLogicalRange(r);
      syncingRef.current = false;
    };
    const applyFromSub = () => {
      if (syncingRef.current) return;
      const r = subScale.getVisibleLogicalRange();
      if (!r) return;
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
    <div className="relative border-t app-border" style={{ height: 132 }}>
      <span className="pointer-events-none absolute left-2 top-1 z-10 text-[10px] font-semibold uppercase tracking-wide app-muted">
        {type === "rsi" ? "RSI (14)" : "MACD (12, 26, 9)"}
      </span>
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}
