"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickChart,
  Crosshair,
  Grid3X3,
  Maximize2,
  Minus,
  Target,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
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

import { aggregateCandles, candleBucketStart } from "@/lib/market-data/aggregation";
import {
  TIMEFRAMES,
  TIMEFRAME_MS,
  type Candle,
  type Timeframe,
} from "@/lib/market-data/types";

export interface ChartMarker {
  time: number;
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
  positionDirection: "long" | "short" | null;
  currentPrice: number | null;
  baseTimeframe: Timeframe;
  pipSize: number;
  precision: number;
  theme: "dark" | "light";
  onStopLossChange: (price: string | null) => void;
  onTakeProfitChange: (price: string | null) => void;
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

function toBar(candle: Candle): CandlestickData<Time> {
  return {
    time: Math.floor(candle.timestamp / 1000) as UTCTimestamp,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
  };
}

function candlesForDisplay(
  candles: Candle[],
  baseTimeframe: Timeframe,
  displayTimeframe: Timeframe,
) {
  return displayTimeframe === baseTimeframe
    ? candles
    : aggregateCandles(candles, baseTimeframe, displayTimeframe);
}

function ToolButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
        active
          ? "bg-brand-400/15 text-brand-300"
          : "app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"
      }`}
    >
      {children}
    </button>
  );
}

export default function PriceChart({
  initialCandles,
  lastCandle,
  markers,
  entryPrice,
  stopLoss,
  takeProfit,
  positionDirection,
  currentPrice,
  baseTimeframe,
  pipSize,
  precision,
  theme,
  onStopLossChange,
  onTakeProfitChange,
  loading = false,
  error = null,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const entryLineRef = useRef<IPriceLine | null>(null);
  const stopLineRef = useRef<IPriceLine | null>(null);
  const targetLineRef = useRef<IPriceLine | null>(null);
  const rawCandlesRef = useRef<Candle[]>(initialCandles);
  const displayTimeframeRef = useRef<Timeframe>(baseTimeframe);
  const draggingRef = useRef<"stop" | "target" | null>(null);
  const [legend, setLegend] = useState<CandlestickData<Time> | null>(null);
  const [displayTimeframe, setDisplayTimeframe] = useState<Timeframe>(baseTimeframe);
  const [gridVisible, setGridVisible] = useState(true);
  const [magnetCrosshair, setMagnetCrosshair] = useState(false);
  const [stopDraft, setStopDraft] = useState<number | null>(stopLoss);
  const [targetDraft, setTargetDraft] = useState<number | null>(takeProfit);
  const [lineCoordinates, setLineCoordinates] = useState<{
    stop: number | null;
    target: number | null;
  }>({ stop: null, target: null });

  const availableTimeframes = TIMEFRAMES.filter(
    (timeframe) =>
      TIMEFRAME_MS[timeframe] >= TIMEFRAME_MS[baseTimeframe] &&
      TIMEFRAME_MS[timeframe] % TIMEFRAME_MS[baseTimeframe] === 0,
  );

  function updateLineCoordinates() {
    const series = seriesRef.current;
    if (!series) return;
    setLineCoordinates({
      stop: stopDraft == null ? null : series.priceToCoordinate(stopDraft),
      target: targetDraft == null ? null : series.priceToCoordinate(targetDraft),
    });
  }

  function refreshSeries() {
    const series = seriesRef.current;
    if (!series) return;
    series.setData(
      candlesForDisplay(
        rawCandlesRef.current,
        baseTimeframe,
        displayTimeframeRef.current,
      ).map(toBar),
    );
    requestAnimationFrame(updateLineCoordinates);
  }

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
      rightPriceScale: {
        borderColor: palette.border,
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      timeScale: {
        borderColor: palette.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 10,
      },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
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
    seriesRef.current = series;
    chartRef.current = chart;
    refreshSeries();
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      const data = param.seriesData.get(series) as CandlestickData<Time> | undefined;
      setLegend(data ?? null);
    });

    const coordinateUpdate = () => updateLineCoordinates();
    chart.timeScale().subscribeVisibleLogicalRangeChange(coordinateUpdate);
    const observer = new ResizeObserver(coordinateUpdate);
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(coordinateUpdate);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      entryLineRef.current = null;
      stopLineRef.current = null;
      targetLineRef.current = null;
    };
    // The parent remounts this chart when a session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        vertLines: { color: gridVisible ? palette.grid : "transparent" },
        horzLines: { color: gridVisible ? palette.grid : "transparent" },
      },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
      crosshair: {
        mode: magnetCrosshair ? CrosshairMode.Magnet : CrosshairMode.Normal,
      },
    });
  }, [theme, gridVisible, magnetCrosshair]);

  useEffect(() => {
    if (!lastCandle) return;
    const candles = rawCandlesRef.current;
    const existing = candles.findIndex((candle) => candle.timestamp === lastCandle.timestamp);
    rawCandlesRef.current =
      existing >= 0
        ? candles.map((candle, index) => (index === existing ? lastCandle : candle))
        : [...candles, lastCandle];
    refreshSeries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCandle]);

  useEffect(() => {
    displayTimeframeRef.current = displayTimeframe;
    refreshSeries();
    chartRef.current?.timeScale().fitContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayTimeframe]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const mapped: SeriesMarker<Time>[] = markers.map((marker) => ({
      time: Math.floor(
        candleBucketStart(marker.time, displayTimeframe),
      ) / 1000 as UTCTimestamp,
      position: marker.position,
      color: marker.color,
      shape: marker.shape,
      text: marker.text,
    }));
    series.setMarkers(mapped);
  }, [markers, displayTimeframe]);

  useEffect(() => {
    if (draggingRef.current !== "stop") setStopDraft(stopLoss);
  }, [stopLoss]);

  useEffect(() => {
    if (draggingRef.current !== "target") setTargetDraft(takeProfit);
  }, [takeProfit]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (stopDraft == null && stopLineRef.current) {
      series.removePriceLine(stopLineRef.current);
      stopLineRef.current = null;
    } else if (stopDraft != null && stopLineRef.current) {
      stopLineRef.current.applyOptions({ price: stopDraft });
    } else if (stopDraft != null) {
      stopLineRef.current = series.createPriceLine({
            price: stopDraft,
            color: BEAR,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "SL",
          });
    }
    if (targetDraft == null && targetLineRef.current) {
      series.removePriceLine(targetLineRef.current);
      targetLineRef.current = null;
    } else if (targetDraft != null && targetLineRef.current) {
      targetLineRef.current.applyOptions({ price: targetDraft });
    } else if (targetDraft != null) {
      targetLineRef.current = series.createPriceLine({
            price: targetDraft,
            color: BULL,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "TP",
          });
    }
    requestAnimationFrame(updateLineCoordinates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopDraft, targetDraft]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (entryLineRef.current) {
      series.removePriceLine(entryLineRef.current);
      entryLineRef.current = null;
    }
    if (entryPrice != null && !Number.isNaN(entryPrice)) {
      entryLineRef.current = series.createPriceLine({
        price: entryPrice,
        color: "#5b8bff",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "ENTRY",
      });
    }
  }, [entryPrice]);

  function zoom(factor: number) {
    const scale = chartRef.current?.timeScale();
    const range = scale?.getVisibleLogicalRange();
    if (!scale || !range) return;
    const center = (range.from + range.to) / 2;
    const half = ((range.to - range.from) / 2) * factor;
    scale.setVisibleLogicalRange({ from: center - half, to: center + half });
  }

  function defaultProtection(kind: "stop" | "target") {
    if (currentPrice == null) return null;
    const direction = positionDirection ?? "long";
    const distance = pipSize * (kind === "stop" ? 20 : 40);
    const price =
      direction === "long"
        ? currentPrice + (kind === "stop" ? -distance : distance)
        : currentPrice + (kind === "stop" ? distance : -distance);
    return Number(price.toFixed(precision));
  }

  function toggleProtection(kind: "stop" | "target") {
    if (kind === "stop") {
      const next = stopDraft == null ? defaultProtection("stop") : null;
      setStopDraft(next);
      onStopLossChange(next == null ? null : next.toFixed(precision));
    } else {
      const next = targetDraft == null ? defaultProtection("target") : null;
      setTargetDraft(next);
      onTakeProfitChange(next == null ? null : next.toFixed(precision));
    }
  }

  function beginLineDrag(
    kind: "stop" | "target",
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = kind;
  }

  function moveLine(
    kind: "stop" | "target",
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    if (draggingRef.current !== kind) return;
    const container = containerRef.current;
    const series = seriesRef.current;
    if (!container || !series) return;
    const bounds = container.getBoundingClientRect();
    const price = series.coordinateToPrice(event.clientY - bounds.top);
    if (price == null) return;
    if (kind === "stop") setStopDraft(price);
    else setTargetDraft(price);
  }

  function endLineDrag(
    kind: "stop" | "target",
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    if (draggingRef.current !== kind) return;
    draggingRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const price = kind === "stop" ? stopDraft : targetDraft;
    if (kind === "stop") onStopLossChange(price == null ? null : price.toFixed(precision));
    else onTakeProfitChange(price == null ? null : price.toFixed(precision));
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="img"
        aria-label="Candlestick price chart"
      />

      <div
        className="absolute left-2 right-16 top-2 z-10 flex items-center gap-1 overflow-x-auto rounded-lg border app-border bg-[var(--app-panel)]/94 p-1 shadow-lg backdrop-blur"
        role="toolbar"
        aria-label="Chart tools"
      >
        <CandlestickChart size={16} className="mx-1 shrink-0 text-brand-300" aria-hidden />
        <div className="flex shrink-0 items-center border-r app-border pr-1" aria-label="Display timeframe">
          {availableTimeframes.map((timeframe) => (
            <ToolButton
              key={timeframe}
              label={`Display ${timeframe} candles`}
              active={displayTimeframe === timeframe}
              onClick={() => setDisplayTimeframe(timeframe)}
            >
              {timeframe}
            </ToolButton>
          ))}
        </div>
        <ToolButton
          label="Toggle magnet crosshair"
          active={magnetCrosshair}
          onClick={() => setMagnetCrosshair((value) => !value)}
        >
          <Crosshair size={15} aria-hidden />
        </ToolButton>
        <ToolButton
          label="Toggle chart grid"
          active={gridVisible}
          onClick={() => setGridVisible((value) => !value)}
        >
          <Grid3X3 size={15} aria-hidden />
        </ToolButton>
        <ToolButton label="Zoom in" onClick={() => zoom(0.75)}>
          <ZoomIn size={15} aria-hidden />
        </ToolButton>
        <ToolButton label="Zoom out" onClick={() => zoom(1.3)}>
          <ZoomOut size={15} aria-hidden />
        </ToolButton>
        <ToolButton label="Fit chart data" onClick={() => chartRef.current?.timeScale().fitContent()}>
          <Maximize2 size={15} aria-hidden />
        </ToolButton>
        <ToolButton
          label={stopDraft == null ? "Add stop-loss line" : "Remove stop-loss line"}
          active={stopDraft != null}
          onClick={() => toggleProtection("stop")}
        >
          <Minus size={15} aria-hidden />
          <span className="ml-1">SL</span>
        </ToolButton>
        <ToolButton
          label={targetDraft == null ? "Add take-profit line" : "Remove take-profit line"}
          active={targetDraft != null}
          onClick={() => toggleProtection("target")}
        >
          <Target size={15} aria-hidden />
          <span className="ml-1">TP</span>
        </ToolButton>
      </div>

      {legend && (
        <div className="pointer-events-none absolute left-3 top-14 rounded-md border app-border bg-[var(--app-panel-2)] px-3 py-1.5 font-mono text-xs">
          <span className="app-muted">O</span> {legend.open}{" "}
          <span className="app-muted">H</span> {legend.high}{" "}
          <span className="app-muted">L</span> {legend.low}{" "}
          <span className="app-muted">C</span> {legend.close}
        </div>
      )}

      {stopDraft != null && lineCoordinates.stop != null && (
        <button
          type="button"
          data-testid="stop-loss-line"
          aria-label={`Drag stop-loss line at ${stopDraft.toFixed(precision)}`}
          onPointerDown={(event) => beginLineDrag("stop", event)}
          onPointerMove={(event) => moveLine("stop", event)}
          onPointerUp={(event) => endLineDrag("stop", event)}
          onPointerCancel={(event) => endLineDrag("stop", event)}
          className="absolute left-0 right-16 z-10 h-5 -translate-y-1/2 touch-none cursor-ns-resize border-t border-dashed border-bear text-left"
          style={{ top: lineCoordinates.stop }}
        >
          <span className="absolute left-2 -top-3 rounded bg-bear px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
            SL {stopDraft.toFixed(precision)}
          </span>
        </button>
      )}

      {targetDraft != null && lineCoordinates.target != null && (
        <button
          type="button"
          data-testid="take-profit-line"
          aria-label={`Drag take-profit line at ${targetDraft.toFixed(precision)}`}
          onPointerDown={(event) => beginLineDrag("target", event)}
          onPointerMove={(event) => moveLine("target", event)}
          onPointerUp={(event) => endLineDrag("target", event)}
          onPointerCancel={(event) => endLineDrag("target", event)}
          className="absolute left-0 right-16 z-10 h-5 -translate-y-1/2 touch-none cursor-ns-resize border-t border-dashed border-brand-400 text-left"
          style={{ top: lineCoordinates.target }}
        >
          <span className="absolute left-2 -top-3 rounded bg-brand-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-surface-950">
            TP {targetDraft.toFixed(precision)}
          </span>
        </button>
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
          <span className="app-muted text-sm">No candles to display.</span>
        </div>
      )}
    </div>
  );
}
