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
  Settings2,
  Shapes,
  Spline,
  Star,
  Tag,
  Trash2,
  Triangle,
  TrendingUp,
  Type,
  Undo2,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type BarData,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
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
import { heikinAshi, type OHLCV } from "@/lib/chart/indicators";
import { TOOL_LABELS, type MagnetMode, type ToolKind } from "@/lib/chart/drawing/types";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  defsByCategory,
  getDef,
  hydrateInstance,
  indicatorLabel,
  makeInstance,
  type IndCategory,
  type IndicatorInstance,
} from "@/lib/chart/indicator-defs";
import { Indicator } from "@/lib/chart/indicator-runtime";
import type { DrawingEngine } from "@/lib/chart/drawing/engine";
import type { ChartSync } from "@/lib/chart/sync";
import { DrawingLayer } from "./DrawingLayer";
import { IndicatorSettingsDialog } from "./IndicatorSettingsDialog";
import { VolumeProfileOverlay } from "./VolumeProfileOverlay";

export interface ChartMarker {
  time: number;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
}

type ChartType = "candles" | "hollow" | "heikin" | "bars" | "line" | "area";
type DrawTool = ToolKind | null;

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  candles: "Candles",
  hollow: "Hollow candles",
  heikin: "Heikin-Ashi",
  bars: "Bars (OHLC)",
  line: "Line",
  area: "Area",
};

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
  /**
   * Identifies the *instrument*: drawings are stored under it, so the same
   * trendlines appear in any grid cell showing this symbol.
   */
  storageKey?: string;
  /**
   * Identifies the *grid cell*: timeframe, chart type, indicators and visible
   * range are stored under it. Defaults to `storageKey` for a lone chart; a
   * multi-chart layout must pass a distinct key per cell or the cells overwrite
   * each other's view state.
   */
  viewKey?: string;
  /** Timeframe for a cell with no saved view state yet. */
  initialTimeframe?: Timeframe;
  /** Cross-chart crosshair + time-range sync, when this chart is in a grid. */
  sync?: ChartSync | null;
  /** Stable id within the sync registry; required when `sync` is set. */
  cellId?: string;
  /** Called when the user interacts with this cell, so the grid can focus it. */
  onFocus?: () => void;
  /** Instrument name shown at the head of the cell's own toolbar, in a grid. */
  instrumentLabel?: string;
  /** Optional DOM node in the top header to portal the chart controls into. */
  headerSlot?: HTMLElement | null;
  /** Buy/Sell order ticket, floated over the chart's top-left (TradingView-style). */
  orderTicket?: React.ReactNode;
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

/** How long after a pan/zoom gesture this chart still drives its peers. */
const INTERACTION_WINDOW_MS = 600;

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
  { key: "trade", label: "Positions & measure", Icon: LongPositionIcon as unknown as LucideIcon, tools: ["long", "short", "measure"] },
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

/**
 * Context candles followed by revealed candles. Both are ascending, and the
 * revealed side wins wherever it overlaps history's last bucket. Used for the
 * one-off joins (mount, history page load); playback goes through the cached
 * path inside the component.
 */
function joinTimeline(history: Candle[], replay: OHLCV[]): OHLCV[] {
  const boundary = replay[0]?.time;
  const prefix = history.map(toOHLCV);
  return (boundary == null ? prefix : prefix.filter((candle) => candle.time < boundary)).concat(replay);
}

function addPriceSeries(chart: IChartApi, type: ChartType, palette: Palette, precision: number, context: boolean): ISeriesApi<SeriesType> {
  const priceFormat = { type: "price" as const, precision, minMove: 1 / 10 ** precision };
  const commonCandle = {
    priceLineVisible: !context,
    lastValueVisible: !context,
    priceFormat,
  };
  if (type === "line") {
    return chart.addSeries(LineSeries, { color: context ? palette.text : BULL, lineWidth: 2, priceFormat, priceLineVisible: !context, lastValueVisible: !context });
  }
  if (type === "area") {
    return chart.addSeries(AreaSeries, {
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
    return chart.addSeries(BarSeries, { upColor: BULL, downColor: BEAR, ...commonCandle });
  }
  if (type === "hollow") {
    return chart.addSeries(CandlestickSeries, {
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
  return chart.addSeries(CandlestickSeries, {
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

function updateData(series: ISeriesApi<SeriesType>, type: ChartType, candle: OHLCV) {
  if (type === "line" || type === "area") {
    (series as ISeriesApi<"Line">).update({
      time: candle.time as UTCTimestamp,
      value: candle.close,
    });
    return;
  }
  (series as ISeriesApi<"Candlestick">).update(toOhlcBar(candle));
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
  viewKey,
  initialTimeframe,
  sync = null,
  cellId,
  onFocus,
  instrumentLabel,
  headerSlot = null,
  orderTicket = null,
}: PriceChartProps) {
  // Drawings belong to the instrument; the rest of the view belongs to the cell.
  const viewStorageKey = viewKey ?? storageKey;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const contextSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const renderRafRef = useRef<number | null>(null);
  const lineCoordRafRef = useRef<number | null>(null);
  const priceIndicatorsRef = useRef<Map<string, Indicator>>(new Map());
  const ownIndicatorsRef = useRef<Map<string, Indicator>>(new Map());
  const ownOrderRef = useRef<string>("");
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const positionLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const positionsRef = useRef<OpenPosition[]>(positions);
  const stopLineElRef = useRef<HTMLButtonElement | null>(null);
  const targetLineElRef = useRef<HTMLButtonElement | null>(null);
  const entryLineElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const stopDraftRef = useRef<number | null>(stopLoss);
  const targetDraftRef = useRef<number | null>(takeProfit);
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  /** When the user last drove this chart, gating outbound range sync. */
  const userInteractionRef = useRef(0);
  /** Bumped whenever the candle series is replaced, invalidating render caches. */
  const dataGenerationRef = useRef(0);
  const drawingPrefixRef = useRef<{ history: Candle[]; boundary: number | null; prefix: OHLCV[] }>({
    history: [],
    boundary: null,
    prefix: [],
  });
  const aggregateCacheRef = useRef<{
    timeframe: Timeframe | null;
    generation: number;
    stable: Candle[];
    stableCount: number;
    anchorTime: number;
  }>({ timeframe: null, generation: -1, stable: [], stableCount: 0, anchorTime: 0 });
  const ohlcvCacheRef = useRef<{
    timeframe: Timeframe | null;
    generation: number;
    mapped: OHLCV[];
    anchorTime: number;
  }>({ timeframe: null, generation: -1, mapped: [], anchorTime: 0 });
  /** This chart has drawings on it, or a tool armed to create one. */
  const drawingsActiveRef = useRef(false);
  /** Something on this chart is positioned in React from the viewport. */
  const viewportOverlaysRef = useRef(false);
  const followLatestRef = useRef(true);
  const rawCandlesRef = useRef<Candle[]>(initialCandles);
  const syncedInitialCandlesRef = useRef<Candle[]>(initialCandles);
  const displayTimeframeRef = useRef<Timeframe>(initialTimeframe ?? baseTimeframe);
  const chartTypeRef = useRef<ChartType>("candles");
  const displayRef = useRef<OHLCV[]>([]);
  // Lazily: React evaluates a useRef argument on every render, so building this
  // timeline inline re-converted the whole series on each replay tick, per cell,
  // to produce an initial value that is used exactly once.
  const drawingCandlesRef = useRef<OHLCV[] | null>(null);
  if (drawingCandlesRef.current === null) {
    drawingCandlesRef.current = joinTimeline(contextCandles, initialCandles.map(toOHLCV));
  }
  const draggingRef = useRef<"stop" | "target" | null>(null);
  const savedRangeRef = useRef<{ from: number; to: number } | null>(null);
  const historyCandlesRef = useRef<Candle[]>(contextCandles);
  const historyLoadingRef = useRef(false);
  const historyHasMoreRef = useRef(true);
  const loadOlderRef = useRef<() => void>(() => {});

  const [displayTimeframe, setDisplayTimeframe] = useState<Timeframe>(initialTimeframe ?? baseTimeframe);
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [gridVisible, setGridVisible] = useState(true);
  const [magnetCrosshair, setMagnetCrosshair] = useState(false);
  const [indicators, setIndicators] = useState<IndicatorInstance[]>([]);
  const [indicatorSearch, setIndicatorSearch] = useState("");
  const [indicatorEditing, setIndicatorEditing] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Set<IndCategory>>(() => new Set(CATEGORY_ORDER));
  const [anchorPick, setAnchorPick] = useState<{ id: string; key: string } | null>(null);
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
  const [historyLoading, setHistoryLoading] = useState(contextCandles.length === 0);
  const [olderHistoryLoading, setOlderHistoryLoading] = useState(false);
  const [hasOlderHistory, setHasOlderHistory] = useState(true);
  positionsRef.current = positions;
  chartTypeRef.current = chartType;
  stopDraftRef.current = stopDraft;
  targetDraftRef.current = targetDraft;

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
      drawingCandlesRef.current = joinTimeline(merged, displayRef.current);
      drawingEngineRef.current?.setEnv({
        candles: drawingCandlesRef.current,
      });
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

  /** Pixel row for a price, or null when it is off-scale / the chart isn't ready. */
  function priceCoordinate(price: number | null): number | null {
    const series = seriesRef.current;
    if (!series || price == null || !Number.isFinite(price)) return null;
    return series.priceToCoordinate(price);
  }

  /** Park an overlay line on a pixel row, hiding it while the row is unknown. */
  function placeLine(element: HTMLElement | null, coordinate: number | null) {
    if (!element) return;
    if (coordinate == null) {
      element.style.visibility = "hidden";
      return;
    }
    element.style.top = `${coordinate}px`;
    element.style.visibility = "visible";
  }

  /**
   * Drive the SL/TP/entry overlays straight from the DOM. They used to live in
   * React state, which meant every pan frame and every replay tick queued a
   * render of the whole chart: the lines landed a commit behind the canvas, and
   * the pan listener (registered once) fed them a stale drag draft, so they
   * strobed between the old and new price. Reading refs and writing style.top
   * inside the same frame that redraws the chart keeps them glued to the scale.
   */
  function updateLineCoordinates() {
    if (!seriesRef.current) return;
    placeLine(stopLineElRef.current, priceCoordinate(stopDraftRef.current));
    placeLine(targetLineElRef.current, priceCoordinate(targetDraftRef.current));
    for (const position of positionsRef.current) {
      placeLine(entryLineElsRef.current.get(position.id) ?? null, priceCoordinate(Number(position.entryPrice)));
    }
  }

  /**
   * Context candles and revealed candles as one timeline for the drawing engine.
   *
   * The context part runs to thousands of candles and only changes when history
   * loads, so it is mapped once and reused. Rebuilding it — a map, a Map insert
   * per candle and a full sort — on every replay frame, in every cell, was the
   * single most expensive thing the chart did during playback.
   */
  function drawingTimelineCached(history: Candle[], display: OHLCV[]): OHLCV[] {
    const boundary = display[0]?.time ?? null;
    const cache = drawingPrefixRef.current;
    if (cache.history !== history || cache.boundary !== boundary) {
      const mapped = history.map(toOHLCV);
      cache.history = history;
      cache.boundary = boundary;
      // Revealed data wins wherever it overlaps history's last bucket.
      cache.prefix = boundary == null ? mapped : mapped.filter((candle) => candle.time < boundary);
    }
    // Both halves are ascending and disjoint, so the join needs no sort.
    return cache.prefix.concat(display);
  }

  /**
   * Revealed candles at the cell's display timeframe.
   *
   * Aggregation runs through decimal.js, so re-aggregating the whole series each
   * frame is costly on a higher-timeframe cell. Only the bucket still being
   * filled can change: everything before it is aggregated once, as it completes,
   * and kept. The fingerprint check (length + the candle at the boundary) resets
   * the cache whenever the underlying series is replaced or rewound.
   */
  function aggregatedForDisplay(raw: Candle[], timeframe: Timeframe): Candle[] {
    if (timeframe === baseTimeframe) return raw;
    const last = raw[raw.length - 1];
    if (!last) return [];
    const cache = aggregateCacheRef.current;
    const anchorTime = cache.stableCount > 0 ? raw[cache.stableCount - 1]?.timestamp : 0;
    if (
      cache.timeframe !== timeframe ||
      cache.generation !== dataGenerationRef.current ||
      raw.length < cache.stableCount ||
      anchorTime !== cache.anchorTime
    ) {
      cache.timeframe = timeframe;
      cache.generation = dataGenerationRef.current;
      cache.stable = [];
      cache.stableCount = 0;
      cache.anchorTime = 0;
    }
    // First candle of the bucket still being filled.
    const lastBucket = candleBucketStart(last.timestamp, timeframe);
    let tailStart = raw.length - 1;
    while (tailStart > 0 && (raw[tailStart - 1]?.timestamp ?? 0) >= lastBucket) tailStart -= 1;
    if (tailStart > cache.stableCount) {
      cache.stable = cache.stable.concat(
        aggregateCandles(raw.slice(cache.stableCount, tailStart), baseTimeframe, timeframe),
      );
      cache.stableCount = tailStart;
      cache.anchorTime = raw[tailStart - 1]?.timestamp ?? 0;
    }
    return cache.stable.concat(aggregateCandles(raw.slice(tailStart), baseTimeframe, timeframe));
  }

  /**
   * Display candles in the chart's numeric form.
   *
   * Converting the whole series each frame means thousands of allocations and
   * string-to-number parses per cell per tick. Only the newest bar changes as
   * the replay ticks, so previously converted bars are kept; the last one is
   * always redone because it is still forming (and, on a higher timeframe, the
   * bar before it finalises as a new bucket opens).
   */
  function displayOHLCV(candles: Candle[]): OHLCV[] {
    const cache = ohlcvCacheRef.current;
    const reusable =
      cache.generation === dataGenerationRef.current &&
      cache.timeframe === displayTimeframeRef.current &&
      cache.mapped.length > 0 &&
      cache.mapped.length <= candles.length &&
      candles[cache.mapped.length - 1]?.timestamp === cache.anchorTime;
    if (!reusable) {
      cache.mapped = candles.map(toOHLCV);
    } else {
      for (let index = cache.mapped.length - 1; index < candles.length; index += 1) {
        cache.mapped[index] = toOHLCV(candles[index]!);
      }
    }
    cache.generation = dataGenerationRef.current;
    cache.timeframe = displayTimeframeRef.current;
    cache.anchorTime = candles[candles.length - 1]?.timestamp ?? 0;
    // A copy: renderMain compares this frame's array against the previous one.
    return cache.mapped.slice();
  }

  /**
   * Reconcile indicator controllers with the current instance list. Price-pane
   * indicators live on pane 0 (incremental create/update/destroy); own-pane
   * indicators each get a native lightweight-charts pane (rebuilt only when the
   * set/order changes, so one chart drives a single crosshair + shared axis).
   */
  function syncIndicators(display: OHLCV[]) {
    const chart = chartRef.current;
    if (!chart) return;

    // Pane 0 — price overlays.
    const priceMap = priceIndicatorsRef.current;
    const priceInsts = indicators.filter((i) => {
      const d = getDef(i.kind);
      return d?.pane === "price" && d.render !== "overlay";
    });
    const priceLive = new Set(priceInsts.map((i) => i.id));
    for (const [id, ind] of priceMap.entries()) {
      if (!priceLive.has(id)) {
        ind.destroy();
        priceMap.delete(id);
      }
    }
    for (const inst of priceInsts) {
      let ind = priceMap.get(inst.id);
      if (!ind) {
        ind = new Indicator(chart, inst, precision, 0);
        ind.initialize();
        priceMap.set(inst.id, ind);
      }
      ind.update(inst, display);
    }

    // Panes 1..N — oscillators. Rebuild only on structural change.
    const ownInsts = indicators.filter((i) => getDef(i.kind)?.pane === "own");
    const ownKey = ownInsts.map((i) => i.id).join("|");
    const ownMap = ownIndicatorsRef.current;
    if (ownKey !== ownOrderRef.current) {
      for (const ind of ownMap.values()) ind.destroy();
      ownMap.clear();
      try {
        while (chart.panes().length > 1) chart.removePane(chart.panes().length - 1);
      } catch {
        // Panes not ready yet — recreated below.
      }
      ownInsts.forEach((inst, i) => {
        const paneIndex = i + 1;
        const ind = new Indicator(chart, inst, inst.precision ?? 2, paneIndex);
        ind.initialize();
        ind.update(inst, display);
        ownMap.set(inst.id, ind);
        try {
          chart.panes()[paneIndex]?.setHeight(getDef(inst.kind)?.paneHeight ?? 130);
        } catch {
          // Pane height applied on the next resize.
        }
      });
      ownOrderRef.current = ownKey;
    } else {
      for (const inst of ownInsts) ownMap.get(inst.id)?.update(inst, display);
    }
  }

  function renderMain(force = false) {
    const series = seriesRef.current;
    if (!series) return;
    const display = displayOHLCV(aggregatedForDisplay(rawCandlesRef.current, displayTimeframeRef.current));
    const previous = displayRef.current;
    const scale = chartRef.current?.timeScale();
    const preservedRange = !followLatestRef.current
      ? scale?.getVisibleLogicalRange() ?? null
      : null;
    displayRef.current = display;
    // Joining thousands of context candles onto the timeline is only worth doing
    // for a chart that has drawings on it, or is about to.
    if (drawingsActiveRef.current) {
      drawingCandlesRef.current = drawingTimelineCached(
        historyCandlesRef.current,
        display,
      );
      drawingEngineRef.current?.setEnv({
        candles: drawingCandlesRef.current,
      });
    }
    const renderedDisplay =
      chartTypeRef.current === "heikin" ? heikinAshi(display) : display;

    // Replaying normally changes only the last aggregate bar and/or appends
    // bars. Feeding the entire history through setData on every frame is both
    // expensive and lets the time scale repeatedly recalculate its range,
    // which causes stuttering and apparent gaps while the user is dragging.
    const shared = Math.max(0, previous.length - 1);
    let canUpdateTail = !force && previous.length > 0 && display.length >= previous.length;
    for (let index = 0; canUpdateTail && index < shared; index += 1) {
      if (display[index]?.time !== previous[index]?.time) canUpdateTail = false;
    }
    if (canUpdateTail) {
      for (let index = shared; index < renderedDisplay.length; index += 1) {
        updateData(series, chartTypeRef.current, renderedDisplay[index]!);
      }
    } else {
      applyData(series, chartTypeRef.current, display);
    }
    syncIndicators(display);
    // `displayCandles` only feeds the Volume Profile overlay; skipping this state
    // update otherwise avoids a full React re-render on every replay tick (which
    // made panning/zooming janky during fast playback).
    if (indicators.some((i) => getDef(i.kind)?.render === "overlay")) setDisplayCandles(display);
    if (preservedRange) scale?.setVisibleLogicalRange(preservedRange);
    else if (followLatestRef.current) scale?.scrollToRealTime();
    scheduleLineCoordinates();
  }

  /**
   * Coalesce renderMain to at most once per animation frame. Fast replay can
   * emit new candles far faster than the screen refreshes; without this each
   * tick re-aggregates history + re-feeds the series + recomputes indicators,
   * saturating the main thread and making pan/zoom stutter.
   */
  function scheduleRender() {
    if (renderRafRef.current != null) return;
    renderRafRef.current = requestAnimationFrame(() => {
      renderRafRef.current = null;
      renderMain();
    });
  }

  function scheduleLineCoordinates() {
    if (lineCoordRafRef.current != null) return;
    lineCoordRafRef.current = requestAnimationFrame(() => {
      lineCoordRafRef.current = null;
      updateLineCoordinates();
    });
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
    renderMain(true);
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

    if (viewStorageKey) {
      try {
        const saved = JSON.parse(window.localStorage.getItem(`forextestlab:chart:${viewStorageKey}`) ?? "{}") as {
          range?: { from: number; to: number };
          timeframe?: Timeframe;
          grid?: boolean;
          magnet?: boolean;
          chartType?: ChartType;
          indicators?: unknown[];
        };
        if (saved.timeframe && availableTimeframes.includes(saved.timeframe)) setDisplayTimeframe(saved.timeframe);
        if (typeof saved.grid === "boolean") setGridVisible(saved.grid);
        if (typeof saved.magnet === "boolean") setMagnetCrosshair(saved.magnet);
        if (saved.chartType) setChartType(saved.chartType);
        if (Array.isArray(saved.indicators)) {
          setIndicators(saved.indicators.map(hydrateInstance).filter((i): i is IndicatorInstance => i != null));
        }
        if (saved.range) {
          followLatestRef.current = false;
          savedRangeRef.current = saved.range;
          chart.timeScale().setVisibleLogicalRange(saved.range);
        }
      } catch {
        // Ignore malformed local chart preferences.
      }
    }

    // Coalesce range-change bursts (e.g. auto-scroll during fast replay fires
    // this per tick) into at most one update per animation frame, so React
    // re-renders and localStorage writes don't storm and choke panning.
    const syncId = cellId ?? "solo";
    const unregisterSync = sync?.register(syncId, {
      chart,
      series: () => seriesRef.current,
    });

    let coordScheduled = false;
    const coordinateUpdate = () => {
      if (coordScheduled) return;
      coordScheduled = true;
      requestAnimationFrame(() => {
        coordScheduled = false;
        updateLineCoordinates();
        // Only overlays positioned in React care about the viewport. With none
        // on the chart this would be a full re-render per replay tick, per cell.
        if (viewportOverlaysRef.current) setViewVersion((v) => v + 1);
        // Move the peer cells to the same slice of time. By timestamp, not by
        // logical index — a peer on another timeframe has different bar counts.
        //
        // Only a chart the user is actually driving may push. Range changes also
        // come from replay auto-scroll and from data arriving, and broadcasting
        // those lets a cell that has revealed only a handful of bars drag every
        // other cell down to its two-minute window.
        if (sync && performance.now() - userInteractionRef.current < INTERACTION_WINDOW_MS) {
          sync.broadcastRange(syncId, chart.timeScale().getVisibleRange());
        }
        const visible = chart.timeScale().getVisibleLogicalRange();
        if (visible && visible.from < 100) loadOlderRef.current();
        if (!viewStorageKey) return;
        const range = chart.timeScale().getVisibleLogicalRange();
        try {
          const existing = JSON.parse(window.localStorage.getItem(`forextestlab:chart:${viewStorageKey}`) ?? "{}") as Record<string, unknown>;
          window.localStorage.setItem(`forextestlab:chart:${viewStorageKey}`, JSON.stringify({ ...existing, range }));
        } catch {
          // Local persistence is a convenience; chart interaction must still work.
        }
      });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(coordinateUpdate);

    const onCrosshair = (param: MouseEventParams<Time>) => {
      scheduleLineCoordinates();
      const series = seriesRef.current;
      // Mirror onto the peers, but only for a crosshair this cell owns —
      // otherwise the position a peer just pushed here bounces straight back.
      if (sync && !sync.busy) sync.broadcastCrosshair(syncId, param.time ?? null);
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
    const markInteraction = (event: Event) => {
      // Hovering is not driving: only presses, drags and wheel gestures count.
      if (event.type === "pointermove" && (event as PointerEvent).buttons === 0) return;
      userInteractionRef.current = performance.now();
    };
    const focusCell = () => onFocusRef.current?.();
    container.addEventListener("pointerdown", focusCell, true);
    container.addEventListener("pointerdown", markInteraction, true);
    container.addEventListener("pointermove", markInteraction, { passive: true });
    container.addEventListener("wheel", markInteraction, { passive: true });
    container.addEventListener("pointerdown", detachFromLatest, true);
    container.addEventListener("wheel", detachFromLatest, { passive: true });
    container.addEventListener("pointermove", scheduleLineCoordinates, { passive: true });
    const observer = new ResizeObserver(coordinateUpdate);
    observer.observe(container);

    return () => {
      observer.disconnect();
      unregisterSync?.();
      container.removeEventListener("pointerdown", focusCell, true);
      container.removeEventListener("pointerdown", markInteraction, true);
      container.removeEventListener("pointermove", markInteraction);
      container.removeEventListener("wheel", markInteraction);
      container.removeEventListener("pointerdown", detachFromLatest, true);
      container.removeEventListener("wheel", detachFromLatest);
      container.removeEventListener("pointermove", scheduleLineCoordinates);
      if (lineCoordRafRef.current != null) cancelAnimationFrame(lineCoordRafRef.current);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(coordinateUpdate);
      chart.unsubscribeCrosshairMove(onCrosshair);
      if (renderRafRef.current != null) cancelAnimationFrame(renderRafRef.current);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      contextSeriesRef.current = null;
      for (const ind of priceIndicatorsRef.current.values()) ind.destroy();
      for (const ind of ownIndicatorsRef.current.values()) ind.destroy();
      priceIndicatorsRef.current = new Map();
      ownIndicatorsRef.current = new Map();
      ownOrderRef.current = "";
      markersRef.current = null;
      positionLinesRef.current = new Map();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild the price series when the chart type changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !seriesRef.current) return;
    // Destroy all indicators so they re-attach cleanly on the rebuilt series/panes.
    for (const ind of priceIndicatorsRef.current.values()) ind.destroy();
    for (const ind of ownIndicatorsRef.current.values()) ind.destroy();
    priceIndicatorsRef.current = new Map();
    ownIndicatorsRef.current = new Map();
    ownOrderRef.current = "";
    markersRef.current = null;
    try {
      while (chart.panes().length > 1) chart.removePane(chart.panes().length - 1);
    } catch {
      // No extra panes to remove.
    }
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

  // Re-sync indicator controllers (both panes) when the active set changes.
  useEffect(() => {
    syncIndicators(displayRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators, seriesEpoch]);

  useEffect(() => {
    const incoming = lastCandles.length > 0 ? lastCandles : lastCandle ? [lastCandle] : [];
    if (incoming.length === 0) return;
    for (const nextCandle of incoming) {
      const candles = rawCandlesRef.current;
      const existing = candles.findIndex((candle) => candle.timestamp === nextCandle.timestamp);
      rawCandlesRef.current = existing >= 0 ? candles.map((candle, index) => (index === existing ? nextCandle : candle)) : [...candles, nextCandle];
    }
    scheduleRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCandle, lastCandles]);

  useEffect(() => {
    if (syncedInitialCandlesRef.current === initialCandles) return;
    syncedInitialCandlesRef.current = initialCandles;
    rawCandlesRef.current = initialCandles;
    dataGenerationRef.current += 1;
    const scale = chartRef.current?.timeScale();
    // Preserve the user's view across a data swap — but only if there was a view
    // to preserve. A grid cell whose series arrives after mount would otherwise
    // inherit the empty chart's logical range and open zoomed onto a few bars.
    const hadData = displayRef.current.length > 0;
    const visibleRange = hadData ? scale?.getVisibleLogicalRange() ?? null : null;
    renderMain(true);
    if (visibleRange) {
      followLatestRef.current = false;
      scale?.setVisibleLogicalRange(visibleRange);
    } else {
      followLatestRef.current = true;
      scale?.scrollToRealTime();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCandles]);

  useEffect(() => {
    displayTimeframeRef.current = displayTimeframe;
    dataGenerationRef.current += 1;
    renderMain(true);
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
    if (!viewStorageKey) return;
    try {
      const existing = JSON.parse(window.localStorage.getItem(`forextestlab:chart:${viewStorageKey}`) ?? "{}") as Record<string, unknown>;
      window.localStorage.setItem(
        `forextestlab:chart:${viewStorageKey}`,
        JSON.stringify({
          ...existing,
          timeframe: displayTimeframe,
          grid: gridVisible,
          magnet: magnetCrosshair,
          chartType,
          indicators,
        }),
      );
    } catch {
      // Ignore local storage failures.
    }
  }, [displayTimeframe, gridVisible, magnetCrosshair, chartType, indicators, viewStorageKey]);

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
    // v5: markers are a series primitive, not a series method.
    if (!markersRef.current) markersRef.current = createSeriesMarkers(series, mapped);
    else markersRef.current.setMarkers(mapped);
  }, [markers, displayTimeframe, seriesEpoch]);

  useEffect(() => {
    if (draggingRef.current !== "stop") setStopDraft(stopLoss);
  }, [stopLoss]);

  useEffect(() => {
    if (draggingRef.current !== "target") setTargetDraft(takeProfit);
  }, [takeProfit]);

  useEffect(() => {
    scheduleLineCoordinates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopDraft, targetDraft]);

  /**
   * Every replay tick hands us a freshly cloned `positions` array, so keying the
   * price lines on array identity destroyed and re-created them dozens of times
   * a second — that is what made the SL/TP lines flicker during playback.
   * Reconcile on the values instead: a signature that only changes when a level
   * actually moves.
   */
  const positionLineKey = positions
    .filter((position) => position.id !== activePositionId)
    .map((position) => `${position.id}:${position.stopLoss ?? ""}:${position.takeProfit ?? ""}`)
    .join("|");

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const wanted = new Map<string, number>();
    for (const position of positionsRef.current) {
      if (position.id === activePositionId) continue;
      if (position.stopLoss) wanted.set(`${position.id}:sl`, Number(position.stopLoss));
      if (position.takeProfit) wanted.set(`${position.id}:tp`, Number(position.takeProfit));
    }
    const lines = positionLinesRef.current;
    for (const [key, line] of lines) {
      if (wanted.has(key)) continue;
      series.removePriceLine(line);
      lines.delete(key);
    }
    for (const [key, price] of wanted) {
      const existing = lines.get(key);
      if (existing) {
        existing.applyOptions({ price });
        continue;
      }
      const isStop = key.endsWith(":sl");
      lines.set(
        key,
        series.createPriceLine({ price, color: isStop ? BEAR : BULL, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: isStop ? "SL" : "TP" }),
      );
    }
    scheduleLineCoordinates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionLineKey, activePositionId, seriesEpoch]);

  // Drop the lines when the series they belong to goes away (unmount / rebuild).
  useEffect(() => {
    return () => {
      const series = seriesRef.current;
      try {
        if (series) for (const line of positionLinesRef.current.values()) series.removePriceLine(line);
      } catch {
        // The series was already disposed; the lines went with it.
      }
      positionLinesRef.current.clear();
    };
  }, [seriesEpoch]);

  useEffect(() => {
    if (!anchorPick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAnchorPick(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchorPick]);

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
    if (kind === "stop") {
      stopDraftRef.current = price;
      setStopDraft(price);
    } else {
      targetDraftRef.current = price;
      setTargetDraft(price);
    }
    // Follow the pointer in this frame rather than after React commits.
    updateLineCoordinates();
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

  function addIndicator(kind: string) {
    const inst = makeInstance(kind);
    if (!inst) return;
    setIndicators((prev) => [...prev, inst]);
    setMenu(null);
    setIndicatorSearch("");
    const anchorInput = getDef(kind)?.inputs.find((i) => i.type === "anchor");
    if (anchorInput) setAnchorPick({ id: inst.id, key: anchorInput.key }); // click chart to anchor
    else setIndicatorEditing(inst.id); // open settings so the user sets it themselves
  }

  /** Resolve the chart x-coordinate of a pick click to a candle time. */
  function commitAnchor(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    const scale = chartRef.current?.timeScale();
    if (!rect || !scale || !anchorPick) return;
    const logical = scale.coordinateToLogical(clientX - rect.left);
    const arr = displayRef.current;
    if (logical == null || arr.length === 0) return;
    const idx = Math.max(0, Math.min(arr.length - 1, Math.round(logical)));
    const time = arr[idx]?.time;
    if (time == null) return;
    const { id, key } = anchorPick;
    setIndicators((prev) => prev.map((i) => (i.id === id ? { ...i, inputs: { ...i.inputs, [key]: time } } : i)));
    setAnchorPick(null);
  }

  function toggleCategory(cat: IndCategory) {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function updateIndicator(id: string, patch: Partial<IndicatorInstance>) {
    setIndicators((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function removeIndicator(id: string) {
    setIndicators((prev) => prev.filter((i) => i.id !== id));
    setIndicatorEditing((cur) => (cur === id ? null : cur));
  }

  const pricePaneIndicators = indicators.filter((i) => {
    const d = getDef(i.kind);
    return d?.pane === "price" && d.render !== "overlay";
  });
  const ownPaneIndicators = indicators.filter((i) => getDef(i.kind)?.pane === "own");
  const overlayIndicators = indicators.filter((i) => getDef(i.kind)?.render === "overlay");
  drawingsActiveRef.current = drawTool != null || drawCount > 0;
  viewportOverlaysRef.current =
    drawingsActiveRef.current || ownPaneIndicators.length > 0 || overlayIndicators.length > 0;

  // Picking up a tool or adding the first drawing needs the timeline the render
  // loop skips building while a chart has none.
  useEffect(() => {
    if (drawingsActiveRef.current) scheduleRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawTool, drawCount]);

  // Track each pane's top offset (container-relative px) so we can float an
  // in-pane label at the top-left of every oscillator pane, TradingView-style.
  const [paneTops, setPaneTops] = useState<number[]>([]);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      const panes = chart.panes();
      const tops: number[] = [];
      let acc = 0;
      for (let i = 0; i < panes.length; i++) {
        tops[i] = acc;
        acc += panes[i]!.getHeight() + 1; // +1 for the pane separator
      }
      setPaneTops(tops);
    } catch {
      setPaneTops([]);
    }
  }, [indicators, viewVersion, seriesEpoch]);

  const legendChange = legend && legend.kind === "ohlc" ? legend.c - legend.o : null;
  // Portaled popovers live outside `.app-shell`, so the scoped CSS var doesn't
  // reach them — use an explicit solid colour keyed to the theme.
  const solidPanel = theme === "dark" ? "#111725" : "#ffffff";

  // Chart controls (timeframes + chart type + indicators). Rendered into the top
  // header via a portal when a slot is provided, otherwise docked above the chart.
  const chartControls = (
    <div className="flex items-center gap-1" role="toolbar" aria-label="Chart controls">
      {instrumentLabel && (
        <span className="border-r app-border pr-2 text-xs font-bold">{instrumentLabel}</span>
      )}
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
          className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors ${menu === "indicators" || indicators.length > 0 ? "bg-brand-400/15 text-brand-300" : "app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"}`}
        >
          <Activity size={15} />
          <span className="hidden sm:inline">Indicators</span>
        </button>
        {menu === "indicators" && (
          <div className="absolute left-0 top-9 z-40 w-72 rounded-lg border app-border bg-[var(--app-panel-solid)] p-2 shadow-xl">
            <input
              autoFocus
              value={indicatorSearch}
              onChange={(e) => setIndicatorSearch(e.target.value)}
              placeholder="Search indicators…"
              className="mb-2 w-full rounded-md border app-border bg-transparent px-2 py-1.5 text-xs outline-none focus:border-brand-400"
            />
            <div className="max-h-72 overflow-y-auto">
              {(() => {
                const q = indicatorSearch.trim().toLowerCase();
                return CATEGORY_ORDER.map((cat) => {
                  const defs = defsByCategory(cat).filter((d) => !q || d.name.toLowerCase().includes(q));
                  if (defs.length === 0) return null;
                  const open = q !== "" || openCats.has(cat);
                  return (
                    <div key={cat} className="mb-0.5">
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide app-muted hover:bg-[var(--app-panel-2)]"
                      >
                        <span>{CATEGORY_LABELS[cat]}</span>
                        <span className="text-[9px]">{open ? "▾" : "▸"}</span>
                      </button>
                      {open &&
                        defs.map((def) => (
                          <button
                            key={def.kind}
                            type="button"
                            onClick={() => addIndicator(def.kind)}
                            title={def.description}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--app-panel-2)]"
                          >
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: def.plots[0]?.defaultColor ?? "#5b8bff" }} />
                            <span className="truncate">{def.name}</span>
                            {def.pane === "own" && <span className="ml-auto shrink-0 text-[9px] app-muted">pane</span>}
                          </button>
                        ))}
                    </div>
                  );
                });
              })()}
            </div>
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
          candles={drawingCandlesRef.current}
          viewVersion={viewVersion}
          onToolConsumed={() => setDrawTool(null)}
          onCountChange={setDrawCount}
          engineRef={drawingEngineRef}
          storageKey={storageKey}
        />

        {/* Volume Profile — custom canvas overlay (no lightweight-charts primitive). */}
        {overlayIndicators.map((inst) => (
          <VolumeProfileOverlay
            key={inst.id}
            instance={inst}
            chart={chartApi}
            series={priceSeries}
            candles={displayCandles}
            theme={theme}
            viewVersion={viewVersion}
            onEdit={() => setIndicatorEditing(inst.id)}
            onRemove={() => removeIndicator(inst.id)}
          />
        ))}

        {/* Anchor-pick mode — click a candle to set an anchored indicator's origin. */}
        {anchorPick && (
          <div className="absolute inset-0 z-40 cursor-crosshair" onClick={(e) => commitAnchor(e.clientX)}>
            <div className="pointer-events-none absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-2 rounded-md bg-brand-500 px-3 py-1 text-xs font-semibold text-surface-950 shadow-lg">
              Click a candle to set the anchor
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setAnchorPick(null); }}
                className="pointer-events-auto rounded bg-black/20 px-1.5 py-0.5 text-[10px]"
              >
                Esc
              </button>
            </div>
          </div>
        )}

        {/* Buy/Sell order ticket floated at the chart's top-left, TradingView-style. */}
        {orderTicket && (
          <div className="absolute left-14 top-2 z-30 max-w-[calc(100%-4.5rem)]">{orderTicket}</div>
        )}

        {legend && (
          <div className="pointer-events-none absolute left-14 z-10 rounded-md border app-border bg-[var(--app-panel)]/90 px-2 py-1 font-mono text-[10px] shadow backdrop-blur" style={{ top: orderTicket ? 48 : 8 }}>
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

        {/* Price-pane indicator legend — hover a row for settings / hide / remove. */}
        {pricePaneIndicators.length > 0 && (
          <div className="absolute left-14 z-10 flex flex-col items-start gap-0.5" style={{ top: orderTicket ? 74 : 36 }}>
            {pricePaneIndicators.map((inst) => {
              const color = inst.style[getDef(inst.kind)?.plots[0]?.key ?? ""]?.color ?? "#5b8bff";
              return (
                <div key={inst.id} className="group relative flex items-center gap-1.5 rounded-md border app-border bg-[var(--app-panel)]/85 px-2 py-0.5 text-[10px] shadow backdrop-blur">
                  <span className="h-2 w-2 rounded-full" style={{ background: color, opacity: inst.visible ? 1 : 0.3 }} />
                  <span className={`font-medium ${inst.visible ? "" : "app-muted line-through"}`}>{indicatorLabel(inst)}</span>
                  <button type="button" aria-label={inst.visible ? "Hide" : "Show"} onClick={() => updateIndicator(inst.id, { visible: !inst.visible })} className="ml-0.5 app-muted opacity-0 transition-opacity hover:text-[var(--app-text)] group-hover:opacity-100">
                    {inst.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button type="button" aria-label="Settings" onClick={() => setIndicatorEditing(inst.id)} className="app-muted opacity-0 transition-opacity hover:text-[var(--app-text)] group-hover:opacity-100">
                    <Settings2 size={12} />
                  </button>
                  <button type="button" aria-label="Remove" onClick={() => removeIndicator(inst.id)} className="app-muted opacity-0 transition-opacity hover:text-bear group-hover:opacity-100">
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* In-pane oscillator labels — floated at the top-left of each native pane. */}
        {ownPaneIndicators.map((inst, i) => {
          const top = paneTops[i + 1];
          if (top == null) return null;
          return (
            <div
              key={inst.id}
              className="group absolute left-14 z-10 flex items-center gap-1.5 rounded-md border app-border bg-[var(--app-panel)]/85 px-2 py-0.5 text-[10px] shadow backdrop-blur"
              style={{ top: top + 4 }}
            >
              <span className={`font-medium ${inst.visible ? "" : "app-muted line-through"}`}>{indicatorLabel(inst)}</span>
              <button type="button" aria-label={inst.visible ? "Hide" : "Show"} onClick={() => updateIndicator(inst.id, { visible: !inst.visible })} className="app-muted opacity-0 transition-opacity hover:text-[var(--app-text)] group-hover:opacity-100">
                {inst.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
              <button type="button" aria-label="Settings" onClick={() => setIndicatorEditing(inst.id)} className="app-muted opacity-0 transition-opacity hover:text-[var(--app-text)] group-hover:opacity-100">
                <Settings2 size={12} />
              </button>
              <button type="button" aria-label="Remove" onClick={() => removeIndicator(inst.id)} className="app-muted opacity-0 transition-opacity hover:text-bear group-hover:opacity-100">
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}

        {positions.map((position) => {
          const isLong = position.direction === "long";
          return (
            <div
              key={position.id}
              data-testid="position-entry-line"
              ref={(el) => {
                if (!el) {
                  entryLineElsRef.current.delete(position.id);
                  return;
                }
                entryLineElsRef.current.set(position.id, el);
                placeLine(el, priceCoordinate(Number(position.entryPrice)));
              }}
              className="group pointer-events-auto absolute left-0 right-16 z-20 h-3 -translate-y-1/2"
              style={{ top: 0, visibility: "hidden" }}
            >
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

        {stopDraft != null && (
          <button
            type="button"
            data-testid="stop-loss-line"
            ref={(el) => {
              stopLineElRef.current = el;
              placeLine(el, priceCoordinate(stopDraftRef.current));
            }}
            aria-label={`Drag stop-loss line at ${stopDraft.toFixed(precision)}`}
            onPointerDown={(event) => beginLineDrag("stop", event)}
            onPointerMove={(event) => moveLine("stop", event)}
            onPointerUp={(event) => endLineDrag("stop", event)}
            onPointerCancel={(event) => endLineDrag("stop", event)}
            className="absolute left-0 right-16 z-20 h-5 -translate-y-1/2 touch-none cursor-ns-resize border-t border-dashed border-bear text-left"
            style={{ top: 0, visibility: "hidden" }}
          >
            <span className="absolute left-2 -top-3 rounded bg-bear px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">SL {stopDraft.toFixed(precision)}</span>
          </button>
        )}

        {targetDraft != null && (
          <button
            type="button"
            data-testid="take-profit-line"
            ref={(el) => {
              targetLineElRef.current = el;
              placeLine(el, priceCoordinate(targetDraftRef.current));
            }}
            aria-label={`Drag take-profit line at ${targetDraft.toFixed(precision)}`}
            onPointerDown={(event) => beginLineDrag("target", event)}
            onPointerMove={(event) => moveLine("target", event)}
            onPointerUp={(event) => endLineDrag("target", event)}
            onPointerCancel={(event) => endLineDrag("target", event)}
            className="absolute left-0 right-16 z-20 h-5 -translate-y-1/2 touch-none cursor-ns-resize border-t border-dashed border-brand-400 text-left"
            style={{ top: 0, visibility: "hidden" }}
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

      {indicatorEditing && (() => {
        const inst = indicators.find((i) => i.id === indicatorEditing);
        return inst ? (
          <IndicatorSettingsDialog
            value={inst}
            onChange={(patch) => updateIndicator(inst.id, patch)}
            onClose={() => setIndicatorEditing(null)}
            onPickAnchor={(key) => { setIndicatorEditing(null); setAnchorPick({ id: inst.id, key }); }}
          />
        ) : null;
      })()}
    </div>
  );
}
