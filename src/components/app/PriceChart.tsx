"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlignJustify,
  ArrowUpRight,
  CandlestickChart,
  Circle,
  Clock,
  Crosshair,
  Egg,
  Equal,
  Eye,
  EyeOff,
  Grid3X3,
  History,
  LineChart,
  LocateFixed,
  Magnet,
  Minus,
  MousePointer2,
  MoveDiagonal,
  MoveUpRight,
  MoveVertical,
  Pencil,
  RectangleHorizontal,
  Redo2,
  Ruler,
  Shapes,
  Spline,
  Star,
  Tag,
  Target,
  Trash2,
  Triangle,
  TrendingUp,
  Type,
  Undo2,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type BarData,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

import { DISPLAY_TIME_ZONE, formatNewYorkDateTime } from "@/lib/date-time";
import { aggregateCandles, candleBucketStart } from "@/lib/market-data/aggregation";
import {
  TIMEFRAMES,
  TIMEFRAME_MS,
  type Candle,
  type Timeframe,
} from "@/lib/market-data/types";
import type { OpenPosition } from "@/lib/backtest/types";
import { bollinger, ema, heikinAshi, sma, vwap, type OHLCV } from "@/lib/chart/indicators";
import { TOOL_LABELS, type MagnetMode, type ToolKind } from "@/lib/chart/drawing/types";
import type { DrawingEngine } from "@/lib/chart/drawing/engine";
import { DrawingLayer } from "./DrawingLayer";
import { PriceChartOscillator } from "./PriceChartOscillator";

export interface ChartMarker {
  time: number;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
}

type ChartType = "candles" | "hollow" | "heikin" | "bars" | "line" | "area";
type Oscillator = "none" | "rsi" | "macd";
type DrawTool = ToolKind | null;

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  candles: "Candles",
  hollow: "Hollow candles",
  heikin: "Heikin-Ashi",
  bars: "Bars (OHLC)",
  line: "Line",
  area: "Area",
};

interface OverlayDef {
  id: string;
  label: string;
  kind: "sma" | "ema" | "bb" | "vwap" | "volume";
  period?: number;
  color: string;
}

const OVERLAYS: OverlayDef[] = [
  { id: "ema-9", label: "EMA 9", kind: "ema", period: 9, color: "#fbbf24" },
  { id: "ema-21", label: "EMA 21", kind: "ema", period: 21, color: "#5b8bff" },
  { id: "sma-50", label: "SMA 50", kind: "sma", period: 50, color: "#c084fc" },
  { id: "sma-200", label: "SMA 200", kind: "sma", period: 200, color: "#f472b6" },
  { id: "bb", label: "Bollinger Bands (20, 2)", kind: "bb", period: 20, color: "#93a1b8" },
  { id: "vwap", label: "VWAP", kind: "vwap", color: "#22c3a0" },
  { id: "volume", label: "Volume", kind: "volume", color: "#5b8bff" },
];

function chartTimeMs(time: Time): number {
  if (typeof time === "number") return time * 1000;
  if (typeof time === "string") return Date.parse(time);
  return Date.UTC(time.year, time.month - 1, time.day, 12);
}

const chartTickFormatter = new Intl.DateTimeFormat("en", {
  timeZone: DISPLAY_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

interface PriceChartProps {
  initialCandles: Candle[];
  contextCandles: Candle[];
  lastCandle: Candle | null;
  lastCandles: Candle[];
  markers: ChartMarker[];
  positions: OpenPosition[];
  activePositionId: string | null;
  onEditPosition: (positionId: string) => void;
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
  onLoadHistory: (
    timeframe: Timeframe,
    before: number,
  ) => Promise<{ candles: Candle[]; hasMore: boolean }>;
  loading?: boolean;
  error?: string | null;
  storageKey?: string;
  /** Optional DOM node in the top header to portal the chart controls into. */
  headerSlot?: HTMLElement | null;
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

/** Custom "long position" glyph: green target on top, red stop below, up arrow. */
function LongPositionIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <line x1="4" y1="5" x2="20" y2="5" stroke="#22c3a0" />
      <line x1="4" y1="19" x2="20" y2="19" stroke="#f4646c" />
      <line x1="12" y1="18.5" x2="12" y2="5.5" stroke="currentColor" />
      <path d="M8.5 9.5 L12 6 L15.5 9.5" stroke="#22c3a0" />
    </svg>
  );
}

/** Custom "short position" glyph: red stop on top, green target below, down arrow. */
function ShortPositionIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <line x1="4" y1="5" x2="20" y2="5" stroke="#f4646c" />
      <line x1="4" y1="19" x2="20" y2="19" stroke="#22c3a0" />
      <line x1="12" y1="5.5" x2="12" y2="18.5" stroke="currentColor" />
      <path d="M8.5 14.5 L12 18 L15.5 14.5" stroke="#22c3a0" />
    </svg>
  );
}

/** Icon shown next to each drawing tool inside its flyout. */
const DRAW_ICONS: Record<ToolKind, LucideIcon> = {
  trend: TrendingUp,
  ray: MoveUpRight,
  extended: MoveDiagonal,
  arrow: ArrowUpRight,
  horizontal: Minus,
  vertical: MoveVertical,
  channel: Equal,
  fib: AlignJustify,
  rectangle: RectangleHorizontal,
  session: Clock,
  circle: Circle,
  ellipse: Egg,
  triangle: Triangle,
  path: Waypoints,
  long: LongPositionIcon as unknown as LucideIcon,
  short: ShortPositionIcon as unknown as LucideIcon,
  measure: Ruler,
  text: Type,
  label: Tag,
};

type DrawMenu = "lines" | "shapes" | "fib" | "trade" | "notes";

/** Grouping of drawing tools into toolbar flyouts. */
const DRAW_GROUPS: { key: DrawMenu; label: string; Icon: LucideIcon; tools: ToolKind[] }[] = [
  { key: "lines", label: "Lines & channels", Icon: Spline, tools: ["trend", "ray", "extended", "arrow", "horizontal", "vertical", "channel"] },
  { key: "shapes", label: "Shapes", Icon: Shapes, tools: ["rectangle", "session", "circle", "ellipse", "triangle", "path"] },
  { key: "fib", label: "Fibonacci", Icon: AlignJustify, tools: ["fib"] },
  { key: "trade", label: "Positions & measure", Icon: Target, tools: ["long", "short", "measure"] },
  { key: "notes", label: "Text & notes", Icon: Type, tools: ["text", "label"] },
];

const MAGNET_MODES: MagnetMode[] = ["off", "weak", "strong"];

function toOHLCV(candle: Candle): OHLCV {
  return {
    time: Math.floor(candle.timestamp / 1000),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: candle.volume ? Number(candle.volume) : undefined,
  };
}

function toOhlcBar(c: OHLCV): CandlestickData<Time> & BarData<Time> {
  return {
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

function candlesForDisplay(candles: Candle[], baseTimeframe: Timeframe, displayTimeframe: Timeframe) {
  return displayTimeframe === baseTimeframe
    ? candles
    : aggregateCandles(candles, baseTimeframe, displayTimeframe);
}

function addPriceSeries(chart: IChartApi, type: ChartType, palette: Palette, precision: number, context: boolean): ISeriesApi<SeriesType> {
  const priceFormat = { type: "price" as const, precision, minMove: 1 / 10 ** precision };
  const commonCandle = {
    priceLineVisible: !context,
    lastValueVisible: !context,
    priceFormat,
  };
  if (type === "line") {
    return chart.addLineSeries({ color: context ? palette.text : BULL, lineWidth: 2, priceFormat, priceLineVisible: !context, lastValueVisible: !context });
  }
  if (type === "area") {
    return chart.addAreaSeries({
      lineColor: BULL,
      topColor: "rgba(34,195,160,0.28)",
      bottomColor: "rgba(34,195,160,0.02)",
      lineWidth: 2,
      priceFormat,
      priceLineVisible: !context,
      lastValueVisible: !context,
    });
  }
  if (type === "bars") {
    return chart.addBarSeries({ upColor: BULL, downColor: BEAR, ...commonCandle });
  }
  if (type === "hollow") {
    return chart.addCandlestickSeries({
      upColor: "rgba(0,0,0,0)",
      downColor: BEAR,
      borderUpColor: BULL,
      borderDownColor: BEAR,
      wickUpColor: BULL,
      wickDownColor: BEAR,
      ...commonCandle,
    });
  }
  // candles + heikin (solid)
  return chart.addCandlestickSeries({
    upColor: BULL,
    downColor: BEAR,
    borderUpColor: BULL,
    borderDownColor: BEAR,
    wickUpColor: BULL,
    wickDownColor: BEAR,
    ...commonCandle,
  });
}

function applyData(series: ISeriesApi<SeriesType>, type: ChartType, candles: OHLCV[]) {
  if (type === "line" || type === "area") {
    (series as ISeriesApi<"Line">).setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })) as LineData<Time>[]);
    return;
  }
  const src = type === "heikin" ? heikinAshi(candles) : candles;
  (series as ISeriesApi<"Candlestick">).setData(src.map(toOhlcBar));
}

function ToolButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
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
  contextCandles,
  lastCandle,
  lastCandles,
  markers,
  positions,
  activePositionId,
  onEditPosition,
  stopLoss,
  takeProfit,
  baseTimeframe,
  pipSize,
  precision,
  theme,
  onStopLossChange,
  onTakeProfitChange,
  onLoadHistory,
  loading = false,
  error = null,
  storageKey,
  headerSlot = null,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const contextSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<SeriesType>[]>>(new Map());
  const positionLinesRef = useRef<IPriceLine[]>([]);
  const positionsRef = useRef<OpenPosition[]>(positions);
  const followLatestRef = useRef(true);
  const rawCandlesRef = useRef<Candle[]>(initialCandles);
  const syncedInitialCandlesRef = useRef<Candle[]>(initialCandles);
  const displayTimeframeRef = useRef<Timeframe>(baseTimeframe);
  const chartTypeRef = useRef<ChartType>("candles");
  const displayRef = useRef<OHLCV[]>([]);
  const draggingRef = useRef<"stop" | "target" | null>(null);
  const savedRangeRef = useRef<{ from: number; to: number } | null>(null);
  const historyCandlesRef = useRef<Candle[]>(contextCandles);
  const historyLoadingRef = useRef(false);
  const historyHasMoreRef = useRef(true);
  const loadOlderRef = useRef<() => void>(() => {});

  const [displayTimeframe, setDisplayTimeframe] = useState<Timeframe>(baseTimeframe);
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [gridVisible, setGridVisible] = useState(true);
  const [magnetCrosshair, setMagnetCrosshair] = useState(false);
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set(["ema-21"]));
  const [oscillator, setOscillator] = useState<Oscillator>("none");
  const [drawTool, setDrawTool] = useState<DrawTool>(null);
  const [favorites, setFavorites] = useState<Set<ToolKind>>(new Set());
  const [favBarPos, setFavBarPos] = useState<{ x: number; y: number } | null>(null);
  const favDragRef = useRef<{ sx: number; sy: number; bx: number; by: number; moved: boolean } | null>(null);
  const favMovedRef = useRef(false);
  const [drawMagnet, setDrawMagnet] = useState<MagnetMode>("off");
  const [drawCount, setDrawCount] = useState(0);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const drawingEngineRef = useRef<DrawingEngine | null>(null);
  const [menu, setMenu] = useState<"type" | "indicators" | DrawMenu | null>(null);
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  const [priceSeries, setPriceSeries] = useState<ISeriesApi<SeriesType> | null>(null);
  const [seriesEpoch, setSeriesEpoch] = useState(0);
  const [viewVersion, setViewVersion] = useState(0);
  const [displayCandles, setDisplayCandles] = useState<OHLCV[]>([]);
  const [legend, setLegend] = useState<
    { kind: "ohlc"; o: number; h: number; l: number; c: number } | { kind: "value"; value: number } | null
  >(null);

  const [stopDraft, setStopDraft] = useState<number | null>(stopLoss);
  const [targetDraft, setTargetDraft] = useState<number | null>(takeProfit);
  const [lineCoordinates, setLineCoordinates] = useState<{ stop: number | null; target: number | null }>({ stop: null, target: null });
  const [entryCoordinates, setEntryCoordinates] = useState<Record<string, number | null>>({});
  const [historyLoading, setHistoryLoading] = useState(contextCandles.length === 0);
  const [olderHistoryLoading, setOlderHistoryLoading] = useState(false);
  const [hasOlderHistory, setHasOlderHistory] = useState(true);
  positionsRef.current = positions;
  chartTypeRef.current = chartType;

  useEffect(() => {
    if (!historyLoading) return;
    const timeout = window.setTimeout(() => {
      historyLoadingRef.current = false;
      setHistoryLoading(false);
    }, 8_000);
    return () => window.clearTimeout(timeout);
  }, [historyLoading, displayTimeframe]);

  async function loadHistoryPage(replace: boolean) {
    if (historyLoadingRef.current || (!replace && !historyHasMoreRef.current)) return;
    const firstReplayTime = rawCandlesRef.current[0]?.timestamp;
    const earliest = historyCandlesRef.current[0]?.timestamp ?? firstReplayTime;
    if (!earliest) return;
    historyLoadingRef.current = true;
    if (replace) setHistoryLoading(true);
    else setOlderHistoryLoading(true);
    try {
      const page = await onLoadHistory(displayTimeframeRef.current, replace ? firstReplayTime ?? earliest : earliest);
      const existing = replace ? [] : historyCandlesRef.current;
      const byTime = new Map<number, Candle>();
      for (const candle of [...page.candles, ...existing]) byTime.set(candle.timestamp, candle);
      const merged = [...byTime.values()].sort((a, b) => a.timestamp - b.timestamp);
      historyCandlesRef.current = merged;
      historyHasMoreRef.current = page.hasMore;
      setHasOlderHistory(page.hasMore);
      if (contextSeriesRef.current) applyData(contextSeriesRef.current, chartTypeRef.current, merged.map(toOHLCV));
    } finally {
      historyLoadingRef.current = false;
      if (replace) setHistoryLoading(false);
      else setOlderHistoryLoading(false);
    }
  }
  loadOlderRef.current = () => void loadHistoryPage(false);

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
    setEntryCoordinates(
      Object.fromEntries(positionsRef.current.map((position) => [position.id, series.priceToCoordinate(Number(position.entryPrice))])),
    );
  }

  function renderOverlays(display: OHLCV[]) {
    const chart = chartRef.current;
    if (!chart) return;
    const map = overlaySeriesRef.current;
    // Remove series for overlays that are no longer active.
    for (const [id, seriesList] of map.entries()) {
      if (!activeOverlays.has(id)) {
        for (const s of seriesList) chart.removeSeries(s);
        map.delete(id);
      }
    }
    const closes = display.map((c) => c.close);
    const t = (i: number) => display[i]!.time as UTCTimestamp;
    for (const def of OVERLAYS) {
      if (!activeOverlays.has(def.id)) continue;
      let seriesList = map.get(def.id);
      if (def.kind === "bb") {
        if (!seriesList) {
          seriesList = [
            chart.addLineSeries({ color: def.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }),
            chart.addLineSeries({ color: def.color, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false }),
            chart.addLineSeries({ color: def.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }),
          ];
          map.set(def.id, seriesList);
        }
        const bands = bollinger(closes, def.period ?? 20, 2);
        const line = (pick: "upper" | "middle" | "lower") =>
          display.map((c, i) => (bands[i]![pick] == null ? { time: c.time as UTCTimestamp } : { time: c.time as UTCTimestamp, value: bands[i]![pick] as number }));
        (seriesList[0] as ISeriesApi<"Line">).setData(line("upper") as LineData<Time>[]);
        (seriesList[1] as ISeriesApi<"Line">).setData(line("middle") as LineData<Time>[]);
        (seriesList[2] as ISeriesApi<"Line">).setData(line("lower") as LineData<Time>[]);
        continue;
      }
      if (def.kind === "volume") {
        if (!seriesList) {
          const hist = chart.addHistogramSeries({ priceScaleId: "vol", priceLineVisible: false, lastValueVisible: false });
          chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
          seriesList = [hist];
          map.set(def.id, seriesList);
        }
        (seriesList[0] as ISeriesApi<"Histogram">).setData(
          display.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume ?? 0, color: c.close >= c.open ? "rgba(34,195,160,0.4)" : "rgba(244,100,108,0.4)" })),
        );
        continue;
      }
      // sma / ema / vwap — single line
      if (!seriesList) {
        seriesList = [chart.addLineSeries({ color: def.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false })];
        map.set(def.id, seriesList);
      }
      const values =
        def.kind === "sma" ? sma(closes, def.period ?? 20) : def.kind === "ema" ? ema(closes, def.period ?? 20) : vwap(display);
      (seriesList[0] as ISeriesApi<"Line">).setData(
        values.map((v, i) => (v == null ? { time: t(i) } : { time: t(i), value: v })) as LineData<Time>[],
      );
    }
  }

  function renderMain() {
    const series = seriesRef.current;
    if (!series) return;
    const display = candlesForDisplay(rawCandlesRef.current, baseTimeframe, displayTimeframeRef.current).map(toOHLCV);
    displayRef.current = display;
    applyData(series, chartTypeRef.current, display);
    renderOverlays(display);
    setDisplayCandles(display);
    requestAnimationFrame(updateLineCoordinates);
  }

  function createSeriesPair(type: ChartType) {
    const chart = chartRef.current;
    if (!chart) return;
    const palette = PALETTES[theme];
    const context = addPriceSeries(chart, type, palette, precision, true);
    applyData(context, type, historyCandlesRef.current.map(toOHLCV));
    contextSeriesRef.current = context;
    const main = addPriceSeries(chart, type, palette, precision, false);
    seriesRef.current = main;
    setPriceSeries(main);
    renderMain();
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const palette = PALETTES[theme];
    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: palette.background }, textColor: palette.text, fontFamily: "inherit" },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      rightPriceScale: { borderColor: palette.border, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: {
        borderColor: palette.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 10,
        tickMarkFormatter: (time: Time) => chartTickFormatter.format(chartTimeMs(time)),
      },
      localization: {
        timeFormatter: (time: Time) =>
          formatNewYorkDateTime(chartTimeMs(time), { weekday: "long", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
      autoSize: true,
    });
    chartRef.current = chart;
    setChartApi(chart);
    createSeriesPair(chartTypeRef.current);
    chart.timeScale().scrollToRealTime();

    if (storageKey) {
      try {
        const saved = JSON.parse(window.localStorage.getItem(`forextestlab:chart:${storageKey}`) ?? "{}") as {
          range?: { from: number; to: number };
          timeframe?: Timeframe;
          grid?: boolean;
          magnet?: boolean;
          chartType?: ChartType;
          overlays?: string[];
          oscillator?: Oscillator;
        };
        if (saved.timeframe && availableTimeframes.includes(saved.timeframe)) setDisplayTimeframe(saved.timeframe);
        if (typeof saved.grid === "boolean") setGridVisible(saved.grid);
        if (typeof saved.magnet === "boolean") setMagnetCrosshair(saved.magnet);
        if (saved.chartType) setChartType(saved.chartType);
        if (Array.isArray(saved.overlays)) setActiveOverlays(new Set(saved.overlays));
        if (saved.oscillator) setOscillator(saved.oscillator);
        if (saved.range) {
          followLatestRef.current = false;
          savedRangeRef.current = saved.range;
          chart.timeScale().setVisibleLogicalRange(saved.range);
        }
      } catch {
        // Ignore malformed local chart preferences.
      }
    }

    const coordinateUpdate = () => {
      updateLineCoordinates();
      setViewVersion((v) => v + 1);
      const visible = chart.timeScale().getVisibleLogicalRange();
      if (visible && visible.from < 100) loadOlderRef.current();
      if (!storageKey) return;
      const range = chart.timeScale().getVisibleLogicalRange();
      try {
        const existing = JSON.parse(window.localStorage.getItem(`forextestlab:chart:${storageKey}`) ?? "{}") as Record<string, unknown>;
        window.localStorage.setItem(`forextestlab:chart:${storageKey}`, JSON.stringify({ ...existing, range }));
      } catch {
        // Local persistence is a convenience; chart interaction must still work.
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(coordinateUpdate);

    const onCrosshair = (param: MouseEventParams<Time>) => {
      const series = seriesRef.current;
      if (!series || !param.time) {
        setLegend(null);
        return;
      }
      const point = param.seriesData.get(series) as CandlestickData<Time> | LineData<Time> | undefined;
      if (!point) {
        setLegend(null);
        return;
      }
      if ("close" in point) setLegend({ kind: "ohlc", o: point.open, h: point.high, l: point.low, c: point.close });
      else if ("value" in point) setLegend({ kind: "value", value: point.value });
    };
    chart.subscribeCrosshairMove(onCrosshair);

    const detachFromLatest = () => {
      followLatestRef.current = false;
    };
    container.addEventListener("pointerdown", detachFromLatest, true);
    container.addEventListener("wheel", detachFromLatest, { passive: true });
    const observer = new ResizeObserver(coordinateUpdate);
    observer.observe(container);

    return () => {
      observer.disconnect();
      container.removeEventListener("pointerdown", detachFromLatest, true);
      container.removeEventListener("wheel", detachFromLatest);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(coordinateUpdate);
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      contextSeriesRef.current = null;
      overlaySeriesRef.current = new Map();
      positionLinesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild the price series when the chart type changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !seriesRef.current) return;
    // Clear overlays so they re-attach cleanly on top of the new series.
    for (const seriesList of overlaySeriesRef.current.values()) for (const s of seriesList) chart.removeSeries(s);
    overlaySeriesRef.current = new Map();
    if (contextSeriesRef.current) chart.removeSeries(contextSeriesRef.current);
    if (seriesRef.current) chart.removeSeries(seriesRef.current);
    createSeriesPair(chartType);
    setSeriesEpoch((e) => e + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const palette = PALETTES[theme];
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: palette.background }, textColor: palette.text },
      grid: { vertLines: { color: gridVisible ? palette.grid : "transparent" }, horzLines: { color: gridVisible ? palette.grid : "transparent" } },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
      crosshair: { mode: magnetCrosshair ? CrosshairMode.Magnet : CrosshairMode.Normal },
    });
  }, [theme, gridVisible, magnetCrosshair]);

  // Re-render overlays when the active set changes.
  useEffect(() => {
    renderOverlays(displayRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOverlays, seriesEpoch]);

  useEffect(() => {
    const incoming = lastCandles.length > 0 ? lastCandles : lastCandle ? [lastCandle] : [];
    if (incoming.length === 0) return;
    for (const nextCandle of incoming) {
      const candles = rawCandlesRef.current;
      const existing = candles.findIndex((candle) => candle.timestamp === nextCandle.timestamp);
      rawCandlesRef.current = existing >= 0 ? candles.map((candle, index) => (index === existing ? nextCandle : candle)) : [...candles, nextCandle];
    }
    renderMain();
    if (followLatestRef.current) chartRef.current?.timeScale().scrollToRealTime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCandle, lastCandles]);

  useEffect(() => {
    if (syncedInitialCandlesRef.current === initialCandles) return;
    syncedInitialCandlesRef.current = initialCandles;
    rawCandlesRef.current = initialCandles;
    const scale = chartRef.current?.timeScale();
    const visibleRange = scale?.getVisibleLogicalRange() ?? null;
    renderMain();
    if (visibleRange) {
      followLatestRef.current = false;
      scale?.setVisibleLogicalRange(visibleRange);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCandles]);

  useEffect(() => {
    displayTimeframeRef.current = displayTimeframe;
    renderMain();
    if (displayTimeframe === baseTimeframe && contextCandles.length > 0) {
      historyCandlesRef.current = contextCandles;
      historyHasMoreRef.current = true;
      if (contextSeriesRef.current) applyData(contextSeriesRef.current, chartTypeRef.current, contextCandles.map(toOHLCV));
      setHistoryLoading(false);
    } else {
      historyCandlesRef.current = [];
      historyHasMoreRef.current = true;
      if (contextSeriesRef.current) applyData(contextSeriesRef.current, chartTypeRef.current, []);
      void loadHistoryPage(true);
    }
    const scale = chartRef.current?.timeScale();
    if (savedRangeRef.current) {
      followLatestRef.current = false;
      scale?.setVisibleLogicalRange(savedRangeRef.current);
      savedRangeRef.current = null;
    } else {
      followLatestRef.current = true;
      scale?.scrollToRealTime();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayTimeframe]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const existing = JSON.parse(window.localStorage.getItem(`forextestlab:chart:${storageKey}`) ?? "{}") as Record<string, unknown>;
      window.localStorage.setItem(
        `forextestlab:chart:${storageKey}`,
        JSON.stringify({
          ...existing,
          timeframe: displayTimeframe,
          grid: gridVisible,
          magnet: magnetCrosshair,
          chartType,
          overlays: [...activeOverlays],
          oscillator,
        }),
      );
    } catch {
      // Ignore local storage failures.
    }
  }, [displayTimeframe, gridVisible, magnetCrosshair, chartType, activeOverlays, oscillator, storageKey]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const mapped: SeriesMarker<Time>[] = markers.map((marker) => ({
      time: (Math.floor(candleBucketStart(marker.time, displayTimeframe)) / 1000) as UTCTimestamp,
      position: marker.position,
      color: marker.color,
      shape: marker.shape,
      text: marker.text,
    }));
    series.setMarkers(mapped);
  }, [markers, displayTimeframe, seriesEpoch]);

  useEffect(() => {
    if (draggingRef.current !== "stop") setStopDraft(stopLoss);
  }, [stopLoss]);

  useEffect(() => {
    if (draggingRef.current !== "target") setTargetDraft(takeProfit);
  }, [takeProfit]);

  useEffect(() => {
    requestAnimationFrame(updateLineCoordinates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopDraft, targetDraft]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of positionLinesRef.current) series.removePriceLine(line);
    positionLinesRef.current = [];
    for (const position of positions) {
      if (position.id === activePositionId) continue;
      if (position.stopLoss) {
        positionLinesRef.current.push(
          series.createPriceLine({ price: Number(position.stopLoss), color: BEAR, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "SL" }),
        );
      }
      if (position.takeProfit) {
        positionLinesRef.current.push(
          series.createPriceLine({ price: Number(position.takeProfit), color: BULL, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "TP" }),
        );
      }
    }
    requestAnimationFrame(updateLineCoordinates);
    return () => {
      if (!seriesRef.current) return;
      for (const line of positionLinesRef.current) seriesRef.current.removePriceLine(line);
      positionLinesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, activePositionId, seriesEpoch]);

  function goToLatest() {
    followLatestRef.current = true;
    chartRef.current?.timeScale().scrollToRealTime();
  }

  function selectTimeframe(timeframe: Timeframe) {
    if (timeframe === displayTimeframe) return;
    setHistoryLoading(true);
    setDisplayTimeframe(timeframe);
  }

  function beginLineDrag(kind: "stop" | "target", event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = kind;
  }

  function moveLine(kind: "stop" | "target", event: React.PointerEvent<HTMLButtonElement>) {
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

  function endLineDrag(kind: "stop" | "target", event: React.PointerEvent<HTMLButtonElement>) {
    if (draggingRef.current !== kind) return;
    draggingRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const price = kind === "stop" ? stopDraft : targetDraft;
    if (kind === "stop") onStopLossChange(price == null ? null : price.toFixed(precision));
    else onTakeProfitChange(price == null ? null : price.toFixed(precision));
  }

  // Favorite drawing tools — persisted globally and shown in a quick-access bar.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("forextestlab:fav-tools");
      if (raw) setFavorites(new Set(JSON.parse(raw) as ToolKind[]));
    } catch {
      // Ignore malformed favorites.
    }
  }, []);

  function toggleFavorite(tool: ToolKind) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      try {
        window.localStorage.setItem("forextestlab:fav-tools", JSON.stringify([...next]));
      } catch {
        // Best-effort.
      }
      return next;
    });
  }

  // Drag the favorites bar from anywhere on it (buttons still click if no drag).
  function startFavDrag(e: React.PointerEvent<HTMLDivElement>) {
    const cont = containerRef.current?.getBoundingClientRect();
    const bar = e.currentTarget.getBoundingClientRect();
    if (!cont) return;
    favDragRef.current = { sx: e.clientX, sy: e.clientY, bx: bar.left - cont.left, by: bar.top - cont.top, moved: false };
    favMovedRef.current = false;
    const onMove = (ev: PointerEvent) => {
      const d = favDragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.sx;
      const dy = ev.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      favMovedRef.current = true;
      setFavBarPos({ x: d.bx + dx, y: d.by + dy });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      favDragRef.current = null;
      // Clear after the click has fired so a real click still selects the tool.
      window.setTimeout(() => { favMovedRef.current = false; }, 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function toggleOverlay(id: string) {
    setActiveOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const legendChange = legend && legend.kind === "ohlc" ? legend.c - legend.o : null;
  // Portaled popovers live outside `.app-shell`, so the scoped CSS var doesn't
  // reach them — use an explicit solid colour keyed to the theme.
  const solidPanel = theme === "dark" ? "#111725" : "#ffffff";

  // Chart controls (timeframes + chart type + indicators). Rendered into the top
  // header via a portal when a slot is provided, otherwise docked above the chart.
  const chartControls = (
    <div className="flex items-center gap-1" role="toolbar" aria-label="Chart controls">
      <div className="flex items-center border-r app-border pr-1" aria-label="Display timeframe">
        {availableTimeframes.map((timeframe) => (
          <ToolButton key={timeframe} label={`Display ${timeframe} candles`} active={displayTimeframe === timeframe} onClick={() => selectTimeframe(timeframe)}>
            {timeframe}
          </ToolButton>
        ))}
      </div>

      {/* Chart type */}
      <div className="relative">
        <button
          type="button"
          aria-label="Chart type"
          title={CHART_TYPE_LABELS[chartType]}
          onClick={() => setMenu(menu === "type" ? null : "type")}
          className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors ${menu === "type" ? "bg-brand-400/15 text-brand-300" : "app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"}`}
        >
          {chartType === "line" || chartType === "area" ? <LineChart size={15} /> : <CandlestickChart size={15} />}
          <span className="hidden sm:inline">{CHART_TYPE_LABELS[chartType]}</span>
        </button>
        {menu === "type" && (
          <div className="absolute left-0 top-9 z-40 w-40 rounded-lg border app-border bg-[var(--app-panel-solid)] p-1 shadow-xl">
            {(Object.keys(CHART_TYPE_LABELS) as ChartType[]).map((t) => (
              <button key={t} type="button" onClick={() => { setChartType(t); setMenu(null); }} className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${chartType === t ? "bg-brand-400/15 text-brand-300" : "hover:bg-[var(--app-panel-2)]"}`}>
                {CHART_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Indicators */}
      <div className="relative">
        <button
          type="button"
          aria-label="Indicators"
          onClick={() => setMenu(menu === "indicators" ? null : "indicators")}
          className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors ${menu === "indicators" || activeOverlays.size > 0 || oscillator !== "none" ? "bg-brand-400/15 text-brand-300" : "app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"}`}
        >
          <Activity size={15} />
          <span className="hidden sm:inline">Indicators</span>
        </button>
        {menu === "indicators" && (
          <div className="absolute left-0 top-9 z-40 w-56 rounded-lg border app-border bg-[var(--app-panel-solid)] p-2 shadow-xl">
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide app-muted">Overlays</p>
            {OVERLAYS.map((def) => (
              <label key={def.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-[var(--app-panel-2)]">
                <input type="checkbox" checked={activeOverlays.has(def.id)} onChange={() => toggleOverlay(def.id)} className="accent-brand-400" />
                <span className="h-2 w-2 rounded-full" style={{ background: def.color }} />
                {def.label}
              </label>
            ))}
            <p className="px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide app-muted">Oscillator pane</p>
            {(["none", "rsi", "macd"] as Oscillator[]).map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-[var(--app-panel-2)]">
                <input type="radio" name="oscillator" checked={oscillator === o} onChange={() => setOscillator(o)} className="accent-brand-400" />
                {o === "none" ? "None" : o.toUpperCase()}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative flex h-full w-full flex-col">
      {headerSlot
        ? createPortal(chartControls, headerSlot)
        : <div className="flex flex-wrap items-center gap-1 border-b app-border bg-[var(--app-panel)] px-2 py-1">{chartControls}</div>}
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full" role="img" aria-label="Candlestick price chart" />

        <DrawingLayer
          chart={chartApi}
          series={priceSeries}
          tool={drawTool}
          magnet={drawMagnet}
          precision={precision}
          pipSize={pipSize}
          timeframe={displayTimeframe}
          timeframes={availableTimeframes}
          candles={displayRef.current}
          viewVersion={viewVersion}
          onToolConsumed={() => setDrawTool(null)}
          onCountChange={setDrawCount}
          engineRef={drawingEngineRef}
          storageKey={storageKey}
        />

        {legend && (
          <div className="pointer-events-none absolute left-14 top-2 z-10 rounded-md border app-border bg-[var(--app-panel)]/90 px-2 py-1 font-mono text-[10px] shadow backdrop-blur">
            {legend.kind === "ohlc" ? (
              <span className="flex gap-2">
                <span className="app-muted">O {legend.o.toFixed(precision)}</span>
                <span className="app-muted">H {legend.h.toFixed(precision)}</span>
                <span className="app-muted">L {legend.l.toFixed(precision)}</span>
                <span className="app-muted">C {legend.c.toFixed(precision)}</span>
                {legendChange != null && (
                  <span className={legendChange >= 0 ? "text-brand-300" : "text-bear"}>
                    {legendChange >= 0 ? "+" : ""}
                    {(legendChange / pipSize).toFixed(1)}p
                  </span>
                )}
              </span>
            ) : (
              <span className="app-muted">Price {legend.value.toFixed(precision)}</span>
            )}
          </div>
        )}

        {positions.map((position) => {
          const top = entryCoordinates[position.id];
          if (top == null) return null;
          const isLong = position.direction === "long";
          return (
            <div key={position.id} data-testid="position-entry-line" className="group pointer-events-auto absolute left-0 right-16 z-20 h-3 -translate-y-1/2" style={{ top }}>
              <span className={`pointer-events-none absolute left-0 right-0 top-1/2 border-t border-dashed ${isLong ? "border-brand-400/80" : "border-bear/80"}`} />
              <div className="absolute left-2 -top-9 flex items-center gap-2 rounded-md border app-border bg-[var(--app-panel)] px-2 py-1.5 text-[10px] opacity-0 shadow-xl transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <span className={`font-bold ${isLong ? "text-brand-300" : "text-bear"}`}>{isLong ? "BUY" : "SELL"} @ {position.entryPrice}</span>
                <span className="font-mono app-muted">{position.lots} lot</span>
                <span className={`font-mono ${Number(position.unrealizedPnl) >= 0 ? "text-brand-300" : "text-bear"}`}>{position.unrealizedPnl}</span>
                <button type="button" onClick={() => onEditPosition(position.id)} className="grid h-6 w-6 place-items-center rounded bg-white/[0.06] hover:bg-white/[0.12]" aria-label={`Edit ${isLong ? "buy" : "sell"} position at ${position.entryPrice}`}>
                  <Pencil size={12} aria-hidden />
                </button>
              </div>
            </div>
          );
        })}

        {/* Favorites quick-access bar — draggable from anywhere, opaque */}
        {favorites.size > 0 && (
          <div
            className="absolute z-30 flex cursor-move touch-none items-center gap-0.5 rounded-lg border app-border bg-[var(--app-panel-solid)] px-1 py-1 shadow-xl"
            style={favBarPos ? { left: favBarPos.x, top: favBarPos.y } : { left: "50%", top: 8, transform: "translateX(-50%)" }}
            role="toolbar"
            aria-label="Favorite tools (drag to move)"
            onPointerDown={startFavDrag}
          >
            <span className="mr-0.5 select-none text-[11px] leading-none app-muted" aria-hidden>⋮⋮</span>
            {DRAW_GROUPS.flatMap((g) => g.tools).filter((t) => favorites.has(t)).map((t) => {
              const Icon = DRAW_ICONS[t];
              return (
                <ToolButton key={t} label={TOOL_LABELS[t]} active={drawTool === t} onClick={() => { if (favMovedRef.current) return; setDrawTool(t); setMenu(null); }}>
                  <Icon size={18} aria-hidden />
                </ToolButton>
              );
            })}
          </div>
        )}

        {/* Click-away backdrop for open menus */}
        {menu && <div className="absolute inset-0 z-20" onClick={() => setMenu(null)} aria-hidden />}

        {/* Left tool rail: drawing tools + chart-view utilities (docked, full height) */}
        <div className="absolute left-0 top-0 bottom-0 z-30 flex w-12 flex-col items-center gap-1 overflow-y-auto border-r app-border bg-[var(--app-panel)] py-2" role="toolbar" aria-label="Drawing tools">
          <ToolButton label="Cursor (select & delete)" active={drawTool === null} onClick={() => { setDrawTool(null); setMenu(null); }}>
            <MousePointer2 size={18} aria-hidden />
          </ToolButton>

          {DRAW_GROUPS.map((grp) => {
            const active = menu === grp.key || grp.tools.includes(drawTool as ToolKind);
            return (
              <ToolButton
                key={grp.key}
                label={grp.label}
                active={active}
                onClick={(e) => {
                  if (menu === grp.key) { setMenu(null); return; }
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenuAnchor({ x: r.right + 6, y: r.top });
                  setMenu(grp.key);
                }}
              >
                <grp.Icon size={18} aria-hidden />
              </ToolButton>
            );
          })}

          <div className="mt-0.5 flex flex-col items-center gap-1 border-t app-border pt-1">
            <ToolButton
              label={`Magnet snapping: ${drawMagnet}`}
              active={drawMagnet !== "off"}
              onClick={() => setDrawMagnet((m) => MAGNET_MODES[(MAGNET_MODES.indexOf(m) + 1) % MAGNET_MODES.length]!)}
            >
              <span className="relative">
                <Magnet size={18} aria-hidden />
                {drawMagnet !== "off" && (
                  <span className="absolute -right-1 -top-1 text-[7px] font-bold uppercase text-brand-300">{drawMagnet[0]}</span>
                )}
              </span>
            </ToolButton>
            <ToolButton label="Undo (Ctrl+Z)" onClick={() => drawingEngineRef.current?.undo()}>
              <Undo2 size={18} aria-hidden />
            </ToolButton>
            <ToolButton label="Redo (Ctrl+Shift+Z)" onClick={() => drawingEngineRef.current?.redo()}>
              <Redo2 size={18} aria-hidden />
            </ToolButton>
            {drawCount > 0 && (
              <ToolButton
                label={drawingsHidden ? "Show all drawings" : "Hide all drawings"}
                active={drawingsHidden}
                onClick={() => { const next = !drawingsHidden; setDrawingsHidden(next); drawingEngineRef.current?.setHideAll(next); }}
              >
                {drawingsHidden ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              </ToolButton>
            )}
            {drawCount > 0 && (
              <ToolButton label={`Clear all drawings (${drawCount})`} onClick={() => drawingEngineRef.current?.clearAll()}>
                <Trash2 size={15} className="text-bear" aria-hidden />
              </ToolButton>
            )}
          </div>

          {/* Chart-view utilities */}
          <div className="mt-0.5 flex flex-col items-center gap-1 border-t app-border pt-1">
            {hasOlderHistory && (
              <ToolButton label={olderHistoryLoading ? "Loading older candles" : "Load older candles"} onClick={() => { if (!olderHistoryLoading) void loadHistoryPage(false); }}>
                {olderHistoryLoading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-brand-400/30 border-t-brand-400" aria-hidden /> : <History size={18} aria-hidden />}
              </ToolButton>
            )}
            <ToolButton label="Toggle magnet crosshair" active={magnetCrosshair} onClick={() => setMagnetCrosshair((value) => !value)}>
              <Crosshair size={18} aria-hidden />
            </ToolButton>
            <ToolButton label="Toggle chart grid" active={gridVisible} onClick={() => setGridVisible((value) => !value)}>
              <Grid3X3 size={18} aria-hidden />
            </ToolButton>
            <ToolButton label="Go to latest candle" onClick={goToLatest}>
              <LocateFixed size={18} aria-hidden />
            </ToolButton>
          </div>
        </div>

        {/* Tool-group flyout — portaled so the rail never needs to scroll to show it */}
        {(() => {
          const grp = DRAW_GROUPS.find((g) => g.key === menu);
          if (!grp || !menuAnchor) return null;
          return createPortal(
            <div
              className="fixed z-[60] w-44 rounded-lg border app-border p-1 shadow-xl"
              style={{ left: menuAnchor.x, top: menuAnchor.y, backgroundColor: solidPanel }}
            >
              {grp.tools.map((t) => {
                const Icon = DRAW_ICONS[t];
                const fav = favorites.has(t);
                return (
                  <div
                    key={t}
                    className={`group flex w-full items-center gap-2 rounded-md pr-1 text-xs ${drawTool === t ? "bg-brand-400/15 text-brand-300" : "hover:bg-[var(--app-panel-2)]"}`}
                  >
                    <button
                      type="button"
                      onClick={() => { setDrawTool(t); setMenu(null); }}
                      className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left"
                    >
                      <Icon size={17} aria-hidden /> {TOOL_LABELS[t]}
                    </button>
                    <button
                      type="button"
                      aria-label={fav ? `Unfavorite ${TOOL_LABELS[t]}` : `Favorite ${TOOL_LABELS[t]}`}
                      aria-pressed={fav}
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(t); }}
                      className={`shrink-0 rounded p-1 transition-opacity ${fav ? "text-amber-400 opacity-100" : "app-muted opacity-0 group-hover:opacity-100 hover:text-amber-400"}`}
                    >
                      <Star size={13} fill={fav ? "currentColor" : "none"} aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          );
        })()}

        {stopDraft != null && lineCoordinates.stop != null && (
          <button
            type="button"
            data-testid="stop-loss-line"
            aria-label={`Drag stop-loss line at ${stopDraft.toFixed(precision)}`}
            onPointerDown={(event) => beginLineDrag("stop", event)}
            onPointerMove={(event) => moveLine("stop", event)}
            onPointerUp={(event) => endLineDrag("stop", event)}
            onPointerCancel={(event) => endLineDrag("stop", event)}
            className="absolute left-0 right-16 z-20 h-5 -translate-y-1/2 touch-none cursor-ns-resize border-t border-dashed border-bear text-left"
            style={{ top: lineCoordinates.stop }}
          >
            <span className="absolute left-2 -top-3 rounded bg-bear px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">SL {stopDraft.toFixed(precision)}</span>
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
            className="absolute left-0 right-16 z-20 h-5 -translate-y-1/2 touch-none cursor-ns-resize border-t border-dashed border-brand-400 text-left"
            style={{ top: lineCoordinates.target }}
          >
            <span className="absolute left-2 -top-3 rounded bg-brand-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-surface-950">TP {targetDraft.toFixed(precision)}</span>
          </button>
        )}

        {(loading || historyLoading) && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-[var(--app-bg)]/95 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-400/25 border-t-brand-400" aria-hidden />
              <span className="app-muted text-sm">{loading ? "Loading market…" : `Loading ${displayTimeframe} chart history…`}</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center bg-[var(--app-bg)]/70">
            <span className="max-w-xs text-center text-sm text-bear">{error}</span>
          </div>
        )}
        {!loading && !historyLoading && !error && initialCandles.length === 0 && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="app-muted text-sm">No candles to display.</span>
          </div>
        )}
      </div>

      {oscillator !== "none" && (
        <PriceChartOscillator candles={displayCandles} type={oscillator} theme={theme} mainChart={chartApi} syncVersion={seriesEpoch} />
      )}
    </div>
  );
}
