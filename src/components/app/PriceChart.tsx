"use client";

import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

import type { Candle } from "@/lib/market-data/types";

export interface ChartMarker {
  time: number; // epoch ms
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
}

interface PriceChartProps {
  initialCandles: Candle[];
  lastCandle: Candle | null;
  markers: ChartMarker[];
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  precision: number;
  theme: "dark" | "light";
  loading?: boolean;
  error?: string | null;
}

interface Palette {
  background: string;
  text: string;
  grid: string;
  border: string;
}

const PALETTES: Record<"dark" | "light", Palette> = {
  dark: {
    background: "#0b0f1a",
    text: "#93a1b8",
    grid: "rgba(255,255,255,0.05)",
    border: "rgba(255,255,255,0.10)",
  },
  light: {
    background: "#ffffff",
    text: "#566179",
    grid: "rgba(15,23,42,0.06)",
    border: "#d9e0ec",
  },
};

const BULL = "#22c3a0";
const BEAR = "#f4646c";

function toBar(c: Candle): CandlestickData<Time> {
  return {
    time: (Math.floor(c.timestamp / 1000) as UTCTimestamp),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
  };
}

export default function PriceChart({
  initialCandles,
  lastCandle,
  markers,
  entryPrice,
  stopLoss,
  takeProfit,
  precision,
  theme,
  loading = false,
  error = null,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const [legend, setLegend] = useState<CandlestickData<Time> | null>(null);

  // Create the chart once. initialCandles is read at mount; the parent remounts
  // (via React key) when the session changes, so setData runs per session.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const palette = PALETTES[theme];
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: { borderColor: palette.border },
      timeScale: {
        borderColor: palette.border,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });

    const series = chart.addCandlestickSeries({
      upColor: BULL,
      downColor: BEAR,
      borderUpColor: BULL,
      borderDownColor: BEAR,
      wickUpColor: BULL,
      wickDownColor: BEAR,
      priceLineVisible: true,
      priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision },
    });
    series.setData(initialCandles.map(toBar));
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      const data = param.seriesData.get(series) as
        | CandlestickData<Time>
        | undefined;
      setLegend(data ?? null);
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-theme without recreating the chart.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const palette = PALETTES[theme];
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
    });
  }, [theme]);

  // Reveal the newest candle without resetting the series.
  useEffect(() => {
    if (!seriesRef.current || !lastCandle) return;
    seriesRef.current.update(toBar(lastCandle));
  }, [lastCandle]);

  // Update trade markers.
  useEffect(() => {
    if (!seriesRef.current) return;
    const mapped: SeriesMarker<Time>[] = markers.map((m) => ({
      time: (Math.floor(m.time / 1000) as UTCTimestamp),
      position: m.position,
      color: m.color,
      shape: m.shape,
      text: m.text,
    }));
    seriesRef.current.setMarkers(mapped);
  }, [markers]);

  // Redraw stop-loss / take-profit / entry price lines.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = [];

    const add = (price: number | null, color: string, title: string) => {
      if (price == null || Number.isNaN(price)) return;
      const line = series.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title,
      });
      priceLinesRef.current.push(line);
    };
    add(entryPrice, "#5b8bff", "Entry");
    add(stopLoss, BEAR, "SL");
    add(takeProfit, BULL, "TP");
  }, [entryPrice, stopLoss, takeProfit]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="img"
        aria-label="Candlestick price chart"
      />

      {/* OHLC tooltip / legend */}
      {legend && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border app-border bg-[var(--app-panel-2)] px-3 py-1.5 font-mono text-xs">
          <span className="app-muted">O</span> {legend.open}{" "}
          <span className="app-muted">H</span> {legend.high}{" "}
          <span className="app-muted">L</span> {legend.low}{" "}
          <span className="app-muted">C</span> {legend.close}
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--app-bg)]/60">
          <span className="app-muted text-sm">Loading candles…</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--app-bg)]/70">
          <span className="max-w-xs text-center text-sm text-bear">{error}</span>
        </div>
      )}

      {!loading && !error && initialCandles.length === 0 && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="app-muted text-sm">
            No candles to display. Start a session to load data.
          </span>
        </div>
      )}
    </div>
  );
}
