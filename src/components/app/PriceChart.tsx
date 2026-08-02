"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  CandlestickChart,
  ChevronDown,
  Clock,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Grid3X3,
  History,
  LineChart,
  LocateFixed,
  Magnet,
  Minus,
  MousePointer2,
  Redo2,
  RotateCcw,
  Settings,
  Settings2,
  Star,
  Tag,
  Trash2,
  Undo2,
  X,
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
  type WhitespaceData,
} from "lightweight-charts";

import { formatInZone } from "@/lib/chart/timezones";
import { formatCrosshairLabel, formatTickMark, timeframeTickMarkMaxCharacters } from "@/lib/chart/tick-marks";
import { aggregateCandles, candleBucketStart } from "@/lib/market-data/aggregation";
import {
  TIMEFRAMES,
  TIMEFRAME_MS,
  canAggregateTimeframes,
  isForexSessionTimestamp,
  nextForexTimeframeTimestamp,
  type Candle,
  type Timeframe,
} from "@/lib/market-data/types";
import type { OpenPosition, OrderType, PendingOrder } from "@/lib/backtest/types";
import type { TradePlan } from "@/lib/backtest/trade-plan";
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
import { recordReplayMetric } from "@/lib/performance/replay-metrics";
import { renderedLivePrice } from "@/lib/chart/live-price";
import { subscribeReplayVisual } from "@/lib/backtest/replay-visual-bus";
import type { DrawingEngine } from "@/lib/chart/drawing/engine";
import {
  AUTO_BACKGROUND,
  ChartSettingsDialog,
  DEFAULT_CHART_SETTINGS,
  type ChartSettings,
  type ChartTextSize,
} from "./ChartSettingsMenu";
import { ChartContextMenu, type ChartMenuItem } from "./ChartContextMenu";
import { DrawingLayer } from "./DrawingLayer";
import {
  DRAWING_TOOL_ICONS,
  FibonacciIcon,
  LinesGroupIcon,
  LongPositionIcon,
  NotesGroupIcon,
  ShapesGroupIcon,
  type DrawingIcon,
} from "./DrawingToolIcons";
import { IndicatorSettingsDialog } from "./IndicatorSettingsDialog";
import { VolumeProfileOverlay } from "./VolumeProfileOverlay";
import { TradePlanOverlay } from "./TradePlanOverlay";

export interface ChartMarker {
  time: number;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
}

type ChartType = "candles" | "hollow" | "heikin" | "bars" | "line" | "area";
type DrawTool = ToolKind | null;
type CursorModeName = "pointer" | "crosshair";

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

/**
 * Date stamp on the legend's bar readout. A named month rather than a numeric
 * one: "02/29" and "29/02" are the same six characters to different readers.
 */
const LEGEND_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/** Volume in the legend, where the column is a few characters wide. */
function formatVolume(volume: number): string {
  if (!Number.isFinite(volume)) return "—";
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (Math.abs(volume) >= size) {
      const scaled = volume / size;
      return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(1)}${suffix}`;
    }
  }
  return String(Math.round(volume));
}

interface PriceChartProps {
  initialCandles: Candle[];
  contextCandles: Candle[];
  lastCandle: Candle | null;
  lastCandles: Candle[];
  replaySeries?: Candle[];
  replaySessionId?: string;
  /** Reattach this cell to the live edge when replay starts or resumes. */
  replayRunning?: boolean;
  markers: ChartMarker[];
  positions: OpenPosition[];
  pendingOrders: PendingOrder[];
  onModifyPendingOrder: (orderId: string, price: string) => void;
  onCancelPendingOrder: (orderId: string) => void;
  activePositionId: string | null;
  onEditPosition: (positionId: string) => void;
  stopLoss: number | null;
  takeProfit: number | null;
  positionDirection: "long" | "short" | null;
  tradePlan: TradePlan | null;
  onTradePlanChange: (
    level: keyof Omit<TradePlan, "direction">,
    value: string,
  ) => void;
  currentPrice: number | null;
  baseTimeframe: Timeframe;
  pipSize: number;
  precision: number;
  accountCurrency: string;
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
  /** Reports the cell's actual timeframe after saved view restoration. */
  onDisplayTimeframeChange?: (timeframe: Timeframe) => void;
  /** Called when the user interacts with this cell, so the grid can focus it. */
  onFocus?: () => void;
  /** Instrument name shown at the head of the cell's own toolbar, in a grid. */
  /** Instrument this cell charts, shown in the legend and opening the picker. */
  symbolLabel: string;
  /** Opens the symbol picker for this cell. */
  onSelectInstrument?: () => void;
  /** This cell charts a reference pair, so trading does not follow it. */
  referenceOnly?: boolean;
  /**
   * Start an order from a price picked off the chart — the right-click menu's
   * "Buy/Sell at 1.08661". Opens the ticket with that entry already filled in.
   */
  onPlanAtPrice?: (
    direction: "long" | "short",
    entryPrice: string,
    orderType: OrderType,
  ) => void;
  /** Chart preferences, shared by every chart in the workspace. */
  settings: ChartSettings;
  onSettingsChange: (patch: Partial<ChartSettings>) => void;
  onSettingsReset: () => void;
  /** Favourite drawing tools, likewise shared. */
  favorites: Set<ToolKind>;
  onToggleFavorite: (tool: ToolKind) => void;
  /** Optional DOM node in the top header to portal the chart controls into. */
  headerSlot?: HTMLElement | null;
  /** Buy/Sell order ticket, floated over the chart's top-left (TradingView-style). */
  orderTicket?: React.ReactNode;
  /**
   * Control seated in the corner where the time axis meets the price scale —
   * the chart's clock and time-zone picker.
   */
  axisCorner?: React.ReactNode;
}

interface Palette {
  background: string;
  /** Ink for de-emphasised *drawing*: the greyed-out context series. */
  text: string;
  /** Ink for axis labels, which have to stay readable over candles. */
  axisText: string;
  grid: string;
  border: string;
}

const PALETTES: Record<"dark" | "light", Palette> = {
  dark: {
    background: "#0b0f1a",
    text: "#93a1b8",
    axisText: "#ffffff",
    grid: "rgba(255,255,255,0.05)",
    border: "rgba(255,255,255,0.10)",
  },
  light: {
    background: "#ffffff",
    text: "#566179",
    axisText: "#0b1220",
    grid: "rgba(15,23,42,0.06)",
    border: "#d9e0ec",
  },
};

/**
 * Axis type size, in px, per `chartTextSize` preference.
 *
 * "medium" is the default and is deliberately a step above the charting
 * library's own default of 12: these labels are read at a glance, from further
 * back than form copy, and often over a busy plot.
 */
const AXIS_FONT_SIZES: Record<ChartTextSize, number> = {
  small: 14,
  medium: 16,
  large: 18,
};

/**
 * Base size for the HTML overlays (legend, OHLC readout, indicator chips).
 *
 * One px under the axis so the chrome never shouts louder than the scale, and
 * the single number every overlay sizes itself against in `em`.
 */
function overlayFontSize(size: ChartTextSize): number {
  return AXIS_FONT_SIZES[size] - 1;
}

const BULL = "#22c3a0";
const BEAR = "#f4646c";
const DEFAULT_BAR_SPACING = 10;
const DEFAULT_RIGHT_OFFSET = 4;
const LIVE_CANDLE_POSITION = 0.75;
/**
 * How far right of the plot the live candle may be parked while replay runs.
 *
 * `LIVE_CANDLE_POSITION` is where it rests. Anything past 1 means it is
 * off-screen because the trader panned back to read history — which is bounded
 * rather than forbidden, so a running chart can never be stranded arbitrarily
 * far from the market, but can still be walked back a few screens. Pressing
 * Play re-anchors to the resting position.
 */
const MAX_LIVE_CANDLE_POSITION = 4;

type DrawMenu = "lines" | "shapes" | "fib" | "trade" | "notes";

/** Grouping of drawing tools into toolbar flyouts. */
const DRAW_GROUPS: { key: DrawMenu; label: string; Icon: DrawingIcon; tools: ToolKind[] }[] = [
  { key: "lines", label: "Lines & channels", Icon: LinesGroupIcon, tools: ["trend", "ray", "horizontalRay", "extended", "arrow", "horizontal", "vertical", "crossline", "infoLine", "trendAngle", "channel", "flatChannel", "disjointChannel", "regression"] },
  { key: "shapes", label: "Shapes", Icon: ShapesGroupIcon, tools: ["rectangle", "session", "circle", "ellipse", "triangle", "path"] },
  { key: "fib", label: "Fibonacci", Icon: FibonacciIcon, tools: ["fib", "fibExtension"] },
  { key: "trade", label: "Positions & measure", Icon: LongPositionIcon, tools: ["long", "short", "measure", "priceRange", "dateRange", "datePriceRange"] },
  { key: "notes", label: "Text & notes", Icon: NotesGroupIcon, tools: ["text", "anchoredText", "label", "callout", "priceLabel"] },
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

/** Colour options for a price series of the given type. */
function seriesColorOptions(type: ChartType, up: string, down: string) {
  if (type === "line") return { color: up };
  if (type === "area") return { lineColor: up };
  if (type === "bars") return { upColor: up, downColor: down };
  if (type === "hollow") {
    return {
      upColor: "rgba(0,0,0,0)",
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
    };
  }
  return {
    upColor: up,
    downColor: down,
    borderUpColor: up,
    borderDownColor: down,
    wickUpColor: up,
    wickDownColor: down,
  };
}

function addPriceSeries(chart: IChartApi, type: ChartType, palette: Palette, precision: number, context: boolean): ISeriesApi<SeriesType> {
  const priceFormat = { type: "price" as const, precision, minMove: 1 / 10 ** precision };
  const commonCandle = {
    priceLineVisible: false,
    lastValueVisible: false,
    priceFormat,
  };
  if (type === "line") {
    return chart.addSeries(LineSeries, { color: context ? palette.text : BULL, lineWidth: 2, priceFormat, priceLineVisible: false, lastValueVisible: false });
  }
  if (type === "area") {
    return chart.addSeries(AreaSeries, {
      lineColor: BULL,
      topColor: "rgba(34,195,160,0.28)",
      bottomColor: "rgba(34,195,160,0.02)",
      lineWidth: 2,
      priceFormat,
      priceLineVisible: false,
      lastValueVisible: false,
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
      className={`inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
        active
          ? "bg-brand-400/20 text-[var(--chart-text)]"
          : "text-[var(--chart-text)] hover:bg-[var(--app-panel-2)]"
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
  replaySeries,
  replaySessionId,
  replayRunning = false,
  markers,
  positions,
  pendingOrders,
  onModifyPendingOrder,
  onCancelPendingOrder,
  activePositionId,
  onEditPosition,
  stopLoss,
  takeProfit,
  tradePlan,
  onTradePlanChange,
  currentPrice,
  baseTimeframe,
  pipSize,
  precision,
  accountCurrency,
  theme,
  onStopLossChange,
  onTakeProfitChange,
  onLoadHistory,
  loading = false,
  error = null,
  storageKey,
  viewKey,
  initialTimeframe,
  onDisplayTimeframeChange,
  onFocus,
  symbolLabel,
  onSelectInstrument,
  referenceOnly = false,
  onPlanAtPrice,
  settings,
  onSettingsChange,
  onSettingsReset,
  favorites,
  onToggleFavorite,
  headerSlot = null,
  orderTicket = null,
  axisCorner = null,
}: PriceChartProps) {
  // Drawings belong to the instrument; the rest of the view belongs to the cell.
  const viewStorageKey = viewKey ?? storageKey;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const contextSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const futureTimeSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const futureTimeRangeRef = useRef<{
    timeframe: Timeframe | null;
    through: number;
  }>({ timeframe: null, through: 0 });
  const renderRafRef = useRef<number | null>(null);
  const forceRenderRef = useRef(false);
  const lineCoordRafRef = useRef<number | null>(null);
  const rangeSaveTimerRef = useRef<number | null>(null);
  const pendingRangeRef = useRef<{ from: number; to: number } | null>(null);
  const priceIndicatorsRef = useRef<Map<string, Indicator>>(new Map());
  const ownIndicatorsRef = useRef<Map<string, Indicator>>(new Map());
  const ownOrderRef = useRef<string>("");
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const livePriceLineRef = useRef<IPriceLine | null>(null);
  const currentPriceRef = useRef<number | null>(currentPrice);
  const replayCurrentTimeRef = useRef<number | null>(null);
  const priceLineEnabledRef = useRef(settings.priceLine);
  const positionLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const positionsRef = useRef<OpenPosition[]>(positions);
  const pendingOrdersRef = useRef<PendingOrder[]>(pendingOrders);
  const stopLineElRef = useRef<HTMLElement | null>(null);
  const targetLineElRef = useRef<HTMLElement | null>(null);
  const entryLineElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const pendingLineElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const pendingDragRef = useRef<{ orderId: string; price: number } | null>(null);
  const stopDraftRef = useRef<number | null>(stopLoss);
  const targetDraftRef = useRef<number | null>(takeProfit);
  const protectionDragRef = useRef<{
    kind: "stop" | "target";
    startY: number;
    entryPrice: number;
    direction: "long" | "short";
    moved: boolean;
  } | null>(null);
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  /** Read by the axis and crosshair formatters, which are bound once at creation. */
  const timeZoneRef = useRef(DEFAULT_CHART_SETTINGS.timeZone);
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
  const liveCandlePositionRef = useRef(LIVE_CANDLE_POSITION);
  const replayWasRunningRef = useRef(false);
  const replayRunningRef = useRef(replayRunning);
  replayRunningRef.current = replayRunning;
  const viewportInteractionRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    moved: boolean;
  }>({ active: false, startX: 0, startY: 0, moved: false });
  const rawCandlesRef = useRef<Candle[]>([...initialCandles]);
  const replaySeriesRef = useRef<Candle[] | undefined>(replaySeries);
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
  const savedTimeRangeRef = useRef<{
    timeframe: Timeframe;
    range: {
      from: UTCTimestamp;
      to: UTCTimestamp;
    };
  } | null>(null);
  const historyCandlesRef = useRef<Candle[]>(contextCandles);
  const historyLoadingRef = useRef(false);
  const historyHasMoreRef = useRef(true);
  const loadOlderRef = useRef<() => void>(() => {});

  const [displayTimeframe, setDisplayTimeframe] = useState<Timeframe>(initialTimeframe ?? baseTimeframe);
  const onDisplayTimeframeChangeRef = useRef(onDisplayTimeframeChange);
  onDisplayTimeframeChangeRef.current = onDisplayTimeframeChange;

  useEffect(() => {
    onDisplayTimeframeChangeRef.current?.(displayTimeframe);
  }, [displayTimeframe]);
  const [chartType, setChartType] = useState<ChartType>("candles");
  /**
   * The open right-click menu, and the point it was opened on.
   *
   * The price and time are captured at click time rather than read when an item
   * fires: replay keeps moving, and "Buy at 1.08661" has to mean the number the
   * menu is showing, not wherever the market has since gone.
   */
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    price: number | null;
    at: number | null;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gridVisible = settings.grid;
  const magnetCrosshair = settings.magnet;
  const axisFontSize = AXIS_FONT_SIZES[settings.chartTextSize];
  const overlayFont = overlayFontSize(settings.chartTextSize);
  // The chart is created once, before the size can be read from props in a
  // dependency-driven effect; a ref hands the initial value to `createChart`.
  const axisFontSizeRef = useRef(axisFontSize);
  axisFontSizeRef.current = axisFontSize;
  timeZoneRef.current = settings.timeZone;
  const [indicators, setIndicators] = useState<IndicatorInstance[]>([]);
  // The replay listener remains mounted for the session. A ref keeps its
  // indicator reconciliation on the latest React state instead of the empty
  // list captured by the chart's first render.
  const indicatorsRef = useRef<IndicatorInstance[]>(indicators);
  indicatorsRef.current = indicators;
  const [indicatorSearch, setIndicatorSearch] = useState("");
  const [indicatorEditing, setIndicatorEditing] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Set<IndCategory>>(() => new Set(CATEGORY_ORDER));
  const [anchorPick, setAnchorPick] = useState<{ id: string; key: string } | null>(null);
  const [drawTool, setDrawTool] = useState<DrawTool>(null);
  const [cursorMode, setCursorMode] = useState<CursorModeName>("pointer");
  const [favBarPos, setFavBarPos] = useState<{ x: number; y: number } | null>(null);
  const favDragRef = useRef<{ sx: number; sy: number; bx: number; by: number; moved: boolean } | null>(null);
  const favMovedRef = useRef(false);
  const [drawMagnet, setDrawMagnet] = useState<MagnetMode>("off");
  const [drawCount, setDrawCount] = useState(0);
  const drawingsHidden = !settings.drawings;
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const drawingEngineRef = useRef<DrawingEngine | null>(null);
  const [menu, setMenu] = useState<"type" | "indicators" | "cursor" | DrawMenu | null>(null);
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  const [priceSeries, setPriceSeries] = useState<ISeriesApi<SeriesType> | null>(null);
  const [seriesEpoch, setSeriesEpoch] = useState(0);
  const [viewVersion, setViewVersion] = useState(0);
  const [displayCandles, setDisplayCandles] = useState<OHLCV[]>([]);
  const [legend, setLegend] = useState<
    | { kind: "ohlc"; at: number; o: number; h: number; l: number; c: number; volume?: number }
    | { kind: "value"; at: number; value: number }
    | null
  >(null);

  const [stopDraft, setStopDraft] = useState<number | null>(stopLoss);
  const [targetDraft, setTargetDraft] = useState<number | null>(takeProfit);
  const [historyLoading, setHistoryLoading] = useState(contextCandles.length === 0);
  const [olderHistoryLoading, setOlderHistoryLoading] = useState(false);
  const [hasOlderHistory, setHasOlderHistory] = useState(true);
  positionsRef.current = positions;
  pendingOrdersRef.current = pendingOrders;
  chartTypeRef.current = chartType;
  stopDraftRef.current = stopDraft;
  targetDraftRef.current = targetDraft;

  /**
   * Stop covering the chart after 8s, so a slow provider cannot leave the plot
   * behind a spinner forever.
   *
   * This only hides the overlay. It must not clear `historyLoadingRef`, which is
   * the single-flight guard: the client aborts a history fetch at 12s, so
   * releasing the guard at 8s opens a window where a second request starts while
   * the first is still running, and whichever resolves last overwrites
   * `historyCandlesRef` — dropping pages and re-rendering the context series
   * repeatedly. Only `loadHistoryPage` releases the guard, in its `finally`.
   */
  useEffect(() => {
    if (!historyLoading) return;
    const timeout = window.setTimeout(() => setHistoryLoading(false), 8_000);
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
      if (replace && followLatestRef.current) resetLatestViewport();
    } finally {
      historyLoadingRef.current = false;
      if (replace) setHistoryLoading(false);
      else setOlderHistoryLoading(false);
    }
  }
  loadOlderRef.current = () => void loadHistoryPage(false);

  const availableTimeframes = TIMEFRAMES.filter((timeframe) =>
    canAggregateTimeframes(baseTimeframe, timeframe),
  );

  /**
   * Apply a settings change. Most of these are read during render or by an
   * effect; hiding drawings has to be pushed into the drawing engine, which
   * owns its own canvas.
   */
  function updateSettings(patch: Partial<ChartSettings>) {
    onSettingsChange(patch);
  }

  function resetSettings() {
    onSettingsReset();
  }

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
    for (const order of pendingOrdersRef.current) {
      if (order.status !== "pending") continue;
      placeLine(
        pendingLineElsRef.current.get(order.id) ?? null,
        priceCoordinate(
          pendingDragRef.current?.orderId === order.id
            ? pendingDragRef.current.price
            : Number(order.entryPrice),
        ),
      );
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
  /**
   * Loaded history followed by the revealed replay candles, as one series.
   *
   * Used by drawings and by indicators. History is already fetched at the cell's
   * display timeframe, so the two halves join directly — no re-aggregation, and
   * the prefix is cached because only the revealed half changes while replay
   * runs.
   */
  function joinedTimelineCached(history: Candle[], display: OHLCV[]): OHLCV[] {
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
    const startedAt = performance.now();
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
    const result = cache.stable.concat(
      aggregateCandles(raw.slice(tailStart), baseTimeframe, timeframe),
    );
    recordReplayMetric(
      "candle-aggregation",
      performance.now() - startedAt,
      raw.length - tailStart,
    );
    return result;
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
    const activeIndicators = indicatorsRef.current;

    // Pane 0 — price overlays.
    const priceMap = priceIndicatorsRef.current;
    const priceInsts = activeIndicators.filter((i) => {
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
      ind.update(inst, display, replayRunningRef.current);
    }

    // Panes 1..N — oscillators. Rebuild only on structural change.
    const ownInsts = activeIndicators.filter((i) => getDef(i.kind)?.pane === "own");
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
        ind.update(inst, display, replayRunningRef.current);
        ownMap.set(inst.id, ind);
        try {
          chart.panes()[paneIndex]?.setHeight(getDef(inst.kind)?.paneHeight ?? 130);
        } catch {
          // Pane height applied on the next resize.
        }
      });
      ownOrderRef.current = ownKey;
    } else {
      for (const inst of ownInsts) {
        ownMap.get(inst.id)?.update(inst, display, replayRunningRef.current);
      }
    }
  }

  function renderMain(force = false) {
    const startedAt = performance.now();
    const series = seriesRef.current;
    if (!series) return;
    const display = displayOHLCV(aggregatedForDisplay(rawCandlesRef.current, displayTimeframeRef.current));
    const previous = displayRef.current;
    displayRef.current = display;
    syncFutureTimeScale(display.at(-1)?.time);
    /*
     * Indicators are calculated over the loaded history as well as the revealed
     * candles, so a moving average continues through the bars on screen to the
     * left instead of restarting at the session boundary — where it would both
     * leave a long empty stretch and seed itself from the opening bar.
     *
     * Joining thousands of candles is only worth doing for a chart that needs
     * it, so it stays behind these two consumers.
     */
    const activeIndicators = indicatorsRef.current;
    const needsHistory = drawingsActiveRef.current || activeIndicators.length > 0;
    const timeline = needsHistory
      ? joinedTimelineCached(historyCandlesRef.current, display)
      : display;
    if (drawingsActiveRef.current) {
      drawingCandlesRef.current = timeline;
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
    const prefixStillAligned =
      shared === 0 ||
      (display[0]?.time === previous[0]?.time &&
        display[shared - 1]?.time === previous[shared - 1]?.time);
    const canUpdateTail =
      !force &&
      previous.length > 0 &&
      display.length >= previous.length &&
      prefixStillAligned;
    if (canUpdateTail) {
      for (let index = shared; index < renderedDisplay.length; index += 1) {
        updateData(series, chartTypeRef.current, renderedDisplay[index]!);
      }
    } else {
      applyData(series, chartTypeRef.current, display);
    }
    syncLivePriceLine();
    syncIndicators(timeline);
    // `displayCandles` only feeds the Volume Profile overlay; skipping this state
    // update otherwise avoids a full React re-render on every replay tick (which
    // made panning/zooming janky during fast playback).
    if (activeIndicators.some((i) => getDef(i.kind)?.render === "overlay")) {
      setDisplayCandles(display);
    }
    // New data must not issue viewport commands after the user has detached.
    // This keeps an active pan/zoom gesture responsive while replay continues.
    if (followLatestRef.current) keepLatestPriceVisible();
    scheduleLineCoordinates();
    recordReplayMetric(
      "chart-update",
      performance.now() - startedAt,
      1,
    );
  }

  /**
   * Coalesce renderMain to at most once per animation frame. Fast replay can
   * emit new candles far faster than the screen refreshes; without this each
   * tick re-aggregates history + re-feeds the series + recomputes indicators,
   * saturating the main thread and making pan/zoom stutter.
   */
  function scheduleRender(force = false) {
    forceRenderRef.current ||= force;
    if (renderRafRef.current != null) return;
    renderRafRef.current = requestAnimationFrame(() => {
      renderRafRef.current = null;
      const shouldForce = forceRenderRef.current;
      forceRenderRef.current = false;
      renderMain(shouldForce);
    });
  }

  function syncLivePriceLine() {
    const series = seriesRef.current;
    const latest = displayRef.current[displayRef.current.length - 1];
    // During replay the line belongs to the candle that was actually painted.
    // A throttled React currentPrice prop can legitimately trail the visual bus
    // and must never pull the line back to an older close.
    const price = renderedLivePrice(latest?.close, currentPriceRef.current);
    if (
      !series ||
      price == null ||
      !Number.isFinite(price) ||
      !priceLineEnabledRef.current
    ) {
      if (series && livePriceLineRef.current) {
        series.removePriceLine(livePriceLineRef.current);
      }
      livePriceLineRef.current = null;
      return;
    }
    const color = latest && price >= latest.open ? BULL : BEAR;
    if (livePriceLineRef.current) {
      livePriceLineRef.current.applyOptions({ price, color });
    } else {
      livePriceLineRef.current = series.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "",
      });
    }
  }

  function scheduleLineCoordinates() {
    if (lineCoordRafRef.current != null) return;
    lineCoordRafRef.current = requestAnimationFrame(() => {
      lineCoordRafRef.current = null;
      updateLineCoordinates();
    });
  }

  function keepLatestPriceVisible(forceToBoundary = false) {
    const chart = chartRef.current;
    const scale = chart?.timeScale();
    const series = seriesRef.current;
    const container = containerRef.current;
    if (!chart || !scale || !series || !container) return;
    // Keep the live candle around three-quarters across the plot, leaving the
    // final quarter as forward space. Deriving the offset from the current
    // logical span preserves each cell's independent zoom level and works at
    // every layout width. `scrollToRealTime()` is intentionally avoided because
    // its animation can be restarted by fast replay before reaching the target.
    const range = scale.getVisibleLogicalRange();
    const latest = displayRef.current.at(-1);
    const latestIndex = latest
      ? scale.timeToIndex(latest.time as UTCTimestamp, true)
      : null;
    const latestCoordinate = latest
      ? scale.timeToCoordinate(latest.time as UTCTimestamp)
      : null;
    const plotWidth = scale.width();
    if (forceToBoundary) {
      liveCandlePositionRef.current = LIVE_CANDLE_POSITION;
    }
    const targetPosition = liveCandlePositionRef.current;
    const targetCoordinate = plotWidth * targetPosition;
    const interaction = viewportInteractionRef.current;
    // Do not fight an in-progress gesture. Once it ends, its live-candle
    // position becomes the cell's persistent replay anchor.
    const mustCatchUp =
      !interaction.active &&
      (forceToBoundary ||
        latestCoordinate == null ||
        Math.abs(Number(latestCoordinate) - targetCoordinate) > 1);
    if (mustCatchUp && range && latestIndex != null) {
      const visibleBars = Math.max(1, range.to - range.from);
      const from = Number(latestIndex) - visibleBars * targetPosition;
      scale.setVisibleLogicalRange({ from, to: from + visibleBars });
    } else if (mustCatchUp) {
      scale.scrollToPosition(DEFAULT_RIGHT_OFFSET, false);
    }

    if (!latest) return;
    const y = series.priceToCoordinate(latest.close);
    const edgePadding = Math.min(24, Math.max(8, container.clientHeight * 0.05));
    if (
      y == null ||
      y < edgePadding ||
      y > container.clientHeight - edgePadding
    ) {
      chart.priceScale("right").applyOptions({ autoScale: true });
    }
  }

  function syncFutureTimeScale(latestTime?: number) {
    const series = futureTimeSeriesRef.current;
    const container = containerRef.current;
    if (!series || latestTime == null) return;
    const latestSeconds = Number(latestTime);
    const timeframe = displayTimeframeRef.current;
    const stepSeconds = TIMEFRAME_MS[timeframe] / 1000;
    const cached = futureTimeRangeRef.current;
    // Keep a generous invisible time-only runway. Refresh only after half of it
    // has been consumed, so the time axis continues through the blank quarter
    // without rebuilding whitespace data on every replay candle.
    if (
      cached.timeframe === timeframe &&
      cached.through - latestSeconds >= stepSeconds * 100
    ) {
      return;
    }
    const whitespace: WhitespaceData<Time>[] = Array.from({ length: 200 }, (_, index) => ({
      time: (nextForexTimeframeTimestamp(latestSeconds * 1000, timeframe, index + 1) / 1000) as UTCTimestamp,
    }));
    series.setData(whitespace);
    futureTimeRangeRef.current = {
      timeframe,
      through: Number(whitespace.at(-1)?.time ?? latestSeconds),
    };
    if (container) {
      container.dataset.forwardScalePoints = String(whitespace.length);
      container.dataset.forwardClosedSessionPoints = String(
        whitespace.filter((point) => !isForexSessionTimestamp(Number(point.time) * 1000, timeframe)).length,
      );
    }
  }

  function setFollowLatest(value: boolean, reason?: string) {
    // Running replay is the source of truth. Data-chunk replacement, restored
    // cell preferences, jumps, and gestures must never silently leave a live
    // chart detached. The user pauses before taking manual viewport control.
    if (!value && replayRunningRef.current) {
      value = true;
      reason = undefined;
    }
    followLatestRef.current = value;
    const container = containerRef.current;
    if (!container) return;
    container.dataset.followLatest = String(value);
    if (value) {
      delete container.dataset.followDetachReason;
    } else if (reason) {
      container.dataset.followDetachReason = reason;
    }
  }

  function captureLiveCandleAnchor() {
    if (!replayRunningRef.current) return;
    const scale = chartRef.current?.timeScale();
    const latest = displayRef.current.at(-1);
    const container = containerRef.current;
    if (!scale || !latest) return;
    // Read the anchor from the logical range rather than a pixel coordinate.
    // Panning back puts the live candle off the right edge, where
    // `timeToCoordinate` stops being dependable — and off the right edge is
    // exactly the case this has to measure. This is the inverse of the range
    // `keepLatestPriceVisible` sets, so the two round-trip exactly.
    const range = scale.getVisibleLogicalRange();
    const latestIndex = scale.timeToIndex(latest.time as UTCTimestamp, true);
    if (!range || latestIndex == null) return;
    const visibleBars = range.to - range.from;
    if (visibleBars <= 0) return;
    liveCandlePositionRef.current = Math.min(
      MAX_LIVE_CANDLE_POSITION,
      Math.max(0, (Number(latestIndex) - range.from) / visibleBars),
    );
    if (container) {
      container.dataset.liveCandleAnchor = String(
        liveCandlePositionRef.current,
      );
    }
  }

  function resetLatestViewport() {
    const scale = chartRef.current?.timeScale();
    if (!scale) return;
    setFollowLatest(true);
    scale.applyOptions({
      barSpacing: DEFAULT_BAR_SPACING,
      rightOffset: DEFAULT_RIGHT_OFFSET,
    });
    chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
    keepLatestPriceVisible(true);
  }

  /**
   * Apply a stored time range, but only once the chart has bars.
   *
   * Lightweight Charts throws when asked to convert times to coordinates on an
   * empty series, and an uncaught throw in an effect takes the whole workspace
   * down — every cell, not just this one. A cell cloned into a new grid layout is
   * exactly that case: it mounts with a stored range and its candles arrive a
   * frame or two later. So the range waits for its data rather than being applied
   * to an empty chart, and a range the series can't honour falls back to the
   * default viewport instead of failing.
   *
   * Returns whether the stored range was applied.
   */
  function restoreSavedTimeRange(): boolean {
    const saved = savedTimeRangeRef.current;
    const scale = chartRef.current?.timeScale();
    if (!saved || !scale) return false;
    if (saved.timeframe !== displayTimeframeRef.current) return false;
    if (displayRef.current.length === 0) return false;
    savedTimeRangeRef.current = null;
    if (replayRunningRef.current) {
      setFollowLatest(true);
      keepLatestPriceVisible(true);
      return true;
    }
    try {
      setFollowLatest(true);
      scale.setVisibleRange(saved.range);
      setFollowLatest(false, "saved-range");
      return true;
    } catch {
      return false;
    }
  }

  function updateViewportDiagnostics() {
    const container = containerRef.current;
    const scale = chartRef.current?.timeScale();
    if (!container || !scale) return;
    const latest = displayRef.current[displayRef.current.length - 1];
    const coordinate = latest
      ? scale.timeToCoordinate(latest.time as UTCTimestamp)
      : null;
    const plotWidth = scale.width();
    container.dataset.latestCandleVisible = String(
      coordinate != null &&
        coordinate >= 0 &&
        coordinate <= plotWidth,
    );
    if (coordinate != null && plotWidth > 0) {
      container.dataset.latestCandlePosition = String(
        Number(coordinate) / plotWidth,
      );
    } else {
      delete container.dataset.latestCandlePosition;
    }
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
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.axisText,
        fontSize: axisFontSizeRef.current,
        fontFamily: "inherit",
      },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      rightPriceScale: { borderColor: palette.border, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: {
        borderColor: palette.border,
        borderVisible: true,
        ticksVisible: true,
        timeVisible: TIMEFRAME_MS[displayTimeframeRef.current] < TIMEFRAME_MS["1d"],
        secondsVisible: false,
        rightOffset: DEFAULT_RIGHT_OFFSET,
        barSpacing: DEFAULT_BAR_SPACING,
        tickMarkMaxCharacterLength: timeframeTickMarkMaxCharacters(displayTimeframeRef.current),
        ignoreWhitespaceIndices: false,
        shiftVisibleRangeOnNewBar: false,
        tickMarkFormatter: (time: Time, tickMarkType: number) =>
          formatTickMark(chartTimeMs(time), tickMarkType, timeZoneRef.current, displayTimeframeRef.current),
      },
      localization: {
        // The zone is named once, in the axis corner, so the label does not
        // repeat an offset on every hover.
        timeFormatter: (time: Time) =>
          formatCrosshairLabel(
            chartTimeMs(time),
            timeZoneRef.current,
            TIMEFRAME_MS[displayTimeframeRef.current],
          ),
      },
      crosshair: { mode: CrosshairMode.Hidden },
      handleScroll: true,
      handleScale: true,
      autoSize: true,
    });
    chartRef.current = chart;
    // Time-only runway that extends the axis past the live candle. It carries
    // whitespace and never a price, but the right scale takes its number format
    // from the first source attached to it — and this series is created before
    // the candles are. Left on the right scale it would hand the axis its own
    // default two-decimal format, collapsing every FX gridline to "1.09". Its
    // own overlay scale keeps it out of both the formatting and the autoscale.
    futureTimeSeriesRef.current = chart.addSeries(LineSeries, {
      color: "transparent",
      lineVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceScaleId: "",
    });
    setChartApi(chart);
    createSeriesPair(chartTypeRef.current);
    resetLatestViewport();

    if (viewStorageKey) {
      try {
        const saved = JSON.parse(window.localStorage.getItem(`forextestlab:chart:${viewStorageKey}`) ?? "{}") as {
          range?: { from: number; to: number };
          timeRange?: { from: number; to: number };
          timeframe?: Timeframe;
          chartType?: ChartType;
          indicators?: unknown[];
        };
        if (saved.timeframe && availableTimeframes.includes(saved.timeframe)) setDisplayTimeframe(saved.timeframe);
        if (saved.chartType) setChartType(saved.chartType);
        if (Array.isArray(saved.indicators)) {
          setIndicators(saved.indicators.map(hydrateInstance).filter((i): i is IndicatorInstance => i != null));
        }
        if (
          saved.timeRange &&
          Number.isFinite(saved.timeRange.from) &&
          Number.isFinite(saved.timeRange.to) &&
          saved.timeRange.from < saved.timeRange.to
        ) {
          savedTimeRangeRef.current = {
            timeframe:
              saved.timeframe && availableTimeframes.includes(saved.timeframe)
                ? saved.timeframe
                : displayTimeframeRef.current,
            range: {
              from: saved.timeRange.from as UTCTimestamp,
              to: saved.timeRange.to as UTCTimestamp,
            },
          };
        }
      } catch {
        // Ignore malformed local chart preferences.
      }
    }

    // Coalesce range-change bursts (e.g. auto-scroll during fast replay fires
    // this per tick) into at most one update per animation frame, so React
    // re-renders and localStorage writes don't storm and choke panning.
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
        drawingEngineRef.current?.onViewChanged();
        const visible = chart.timeScale().getVisibleLogicalRange();
        if (visible) {
          container.dataset.visibleLogicalSpan = String(visible.to - visible.from);
        }
        updateViewportDiagnostics();
        if (visible && visible.from < 100) loadOlderRef.current();
        if (!viewStorageKey) return;
        const range = chart.timeScale().getVisibleLogicalRange();
        pendingRangeRef.current = range;
        if (rangeSaveTimerRef.current != null) window.clearTimeout(rangeSaveTimerRef.current);
        rangeSaveTimerRef.current = window.setTimeout(() => {
          rangeSaveTimerRef.current = null;
          try {
            const existing = JSON.parse(window.localStorage.getItem(`forextestlab:chart:${viewStorageKey}`) ?? "{}") as Record<string, unknown>;
            const timeRange = chart.timeScale().getVisibleRange();
            window.localStorage.setItem(
              `forextestlab:chart:${viewStorageKey}`,
              JSON.stringify({
                ...existing,
                range: pendingRangeRef.current,
                timeRange,
              }),
            );
          } catch {
            // Local persistence is a convenience; chart interaction must still work.
          }
        }, 250);
      });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(coordinateUpdate);

    const onCrosshair = (param: MouseEventParams<Time>) => {
      scheduleLineCoordinates();
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
      const at = chartTimeMs(param.time);
      if ("close" in point) {
        // Volume is not carried on the series' own data, so it comes from the
        // aggregated bars. Only a crosshair move reaches here, never a replay
        // tick, so the lookup costs nothing during playback.
        const seconds = Number(param.time);
        const bar = displayRef.current.find((candle) => Number(candle.time) === seconds);
        setLegend({
          kind: "ohlc",
          at,
          o: point.open,
          h: point.high,
          l: point.low,
          c: point.close,
          volume: bar?.volume,
        });
      } else if ("value" in point) setLegend({ kind: "value", at, value: point.value });
    };
    chart.subscribeCrosshairMove(onCrosshair);

    const beginViewportInteraction = (event: PointerEvent) => {
      viewportInteractionRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
    };
    const markViewportMovement = (event: PointerEvent) => {
      const interaction = viewportInteractionRef.current;
      if (!interaction.active || interaction.moved) return;
      if (
        Math.abs(event.clientX - interaction.startX) >= 4 ||
        Math.abs(event.clientY - interaction.startY) >= 4
      ) {
        interaction.moved = true;
        // Live replay always owns the viewport. Pause first to inspect history;
        // once paused, the interacted cell is independently movable.
        if (!replayRunningRef.current) {
          setFollowLatest(false, "manual-interaction");
        }
      }
    };
    const endViewportInteraction = () => {
      const interaction = viewportInteractionRef.current;
      if (interaction.active && interaction.moved) {
        captureLiveCandleAnchor();
      }
      viewportInteractionRef.current = {
        active: false,
        startX: 0,
        startY: 0,
        moved: false,
      };
    };
    const beginWheelInteraction = () => {
      if (!replayRunningRef.current) {
        setFollowLatest(false, "manual-interaction");
      } else {
        requestAnimationFrame(captureLiveCandleAnchor);
      }
    };
    const focusCell = () => onFocusRef.current?.();
    container.addEventListener("pointerdown", focusCell, true);
    container.addEventListener("pointerdown", beginViewportInteraction, true);
    container.addEventListener("pointermove", markViewportMovement, true);
    window.addEventListener("pointerup", endViewportInteraction, true);
    window.addEventListener("pointercancel", endViewportInteraction, true);
    container.addEventListener("wheel", beginWheelInteraction, { passive: true });
    container.addEventListener("pointermove", scheduleLineCoordinates, { passive: true });
    const observer = new ResizeObserver(coordinateUpdate);
    observer.observe(container);

    return () => {
      observer.disconnect();
      container.removeEventListener("pointerdown", focusCell, true);
      container.removeEventListener("pointerdown", beginViewportInteraction, true);
      container.removeEventListener("pointermove", markViewportMovement, true);
      window.removeEventListener("pointerup", endViewportInteraction, true);
      window.removeEventListener("pointercancel", endViewportInteraction, true);
      container.removeEventListener("wheel", beginWheelInteraction);
      container.removeEventListener("pointermove", scheduleLineCoordinates);
      if (lineCoordRafRef.current != null) cancelAnimationFrame(lineCoordRafRef.current);
      if (rangeSaveTimerRef.current != null) window.clearTimeout(rangeSaveTimerRef.current);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(coordinateUpdate);
      chart.unsubscribeCrosshairMove(onCrosshair);
      if (renderRafRef.current != null) cancelAnimationFrame(renderRafRef.current);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      contextSeriesRef.current = null;
      futureTimeSeriesRef.current = null;
      futureTimeRangeRef.current = { timeframe: null, through: 0 };
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
    livePriceLineRef.current = null;
    try {
      while (chart.panes().length > 1) chart.removePane(chart.panes().length - 1);
    } catch {
      // No extra panes to remove.
    }
    if (contextSeriesRef.current) chart.removeSeries(contextSeriesRef.current);
    if (seriesRef.current) chart.removeSeries(seriesRef.current);
    livePriceLineRef.current = null;
    createSeriesPair(chartType);
    setSeriesEpoch((e) => e + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType]);

  // Candle colours are per chart, so they are applied after the series exists
  // (and re-applied whenever a chart-type change rebuilds it).
  useEffect(() => {
    const options = seriesColorOptions(chartTypeRef.current, settings.upColor, settings.downColor);
    // The pre-session context bars are the same instrument, so they take the
    // same colours; leaving them out split the chart in two at the session start.
    seriesRef.current?.applyOptions(options);
    contextSeriesRef.current?.applyOptions(options);
  }, [settings.upColor, settings.downColor, seriesEpoch, chartType]);

  // The time scale caches tick labels, so re-apply its density and formatter
  // whenever either the chart zone or display timeframe changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      timeScale: {
        timeVisible: TIMEFRAME_MS[displayTimeframe] < TIMEFRAME_MS["1d"],
        tickMarkMaxCharacterLength: timeframeTickMarkMaxCharacters(displayTimeframe),
        tickMarkFormatter: (time: Time, tickMarkType: number) =>
          formatTickMark(chartTimeMs(time), tickMarkType, settings.timeZone, displayTimeframe),
      },
    });
  }, [settings.timeZone, displayTimeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const palette = PALETTES[theme];
    chart.applyOptions({
      layout: {
        background: {
          type: ColorType.Solid,
          color: settings.background === AUTO_BACKGROUND ? palette.background : settings.background,
        },
        textColor: palette.axisText,
        fontSize: axisFontSize,
      },
      grid: { vertLines: { color: gridVisible ? palette.grid : "transparent" }, horzLines: { color: gridVisible ? palette.grid : "transparent" } },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
      crosshair: {
        mode: drawTool != null
          ? CrosshairMode.Normal
          : cursorMode === "pointer"
            ? CrosshairMode.Hidden
            : magnetCrosshair ? CrosshairMode.Magnet : CrosshairMode.Normal,
      },
    });
  }, [theme, gridVisible, magnetCrosshair, settings.background, axisFontSize, cursorMode, drawTool]);

  useEffect(() => {
    const jump = (event: Event) => {
      const time = (event as CustomEvent<{ time?: number }>).detail?.time;
      const scale = chartRef.current?.timeScale();
      if (!time || !scale) return;
      if (replayRunningRef.current) {
        keepLatestPriceVisible();
        return;
      }
      const bucket = Math.floor(candleBucketStart(time, displayTimeframeRef.current) / 1000);
      const index = displayRef.current.findIndex((candle) => Number(candle.time) === bucket);
      if (index < 0) return;
      const range = scale.getVisibleLogicalRange();
      const width = range ? Math.max(20, range.to - range.from) : 80;
      setFollowLatest(false, "jump-to-candle");
      scale.setVisibleLogicalRange({ from: index - width / 2, to: index + width / 2 });
    };
    window.addEventListener("forextestlab:jump-to-candle", jump);
    return () => window.removeEventListener("forextestlab:jump-to-candle", jump);
  }, []);

  // Re-sync indicator controllers (both panes) when the active set changes.
  useEffect(() => {
    syncIndicators(
      indicators.length > 0
        ? joinedTimelineCached(historyCandlesRef.current, displayRef.current)
        : displayRef.current,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators, seriesEpoch]);

  useEffect(() => {
    const incoming = lastCandles.length > 0 ? lastCandles : lastCandle ? [lastCandle] : [];
    if (incoming.length === 0) return;
    for (const nextCandle of incoming) {
      const candles = rawCandlesRef.current;
      const lastIndex = candles.length - 1;
      const lastTimestamp = candles[lastIndex]?.timestamp;
      if (lastTimestamp == null || nextCandle.timestamp > lastTimestamp) {
        candles.push(nextCandle);
      } else if (nextCandle.timestamp === lastTimestamp) {
        candles[lastIndex] = nextCandle;
      } else {
        const existing = candles.findIndex((candle) => candle.timestamp === nextCandle.timestamp);
        if (existing >= 0) candles[existing] = nextCandle;
      }
    }
    scheduleRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCandle, lastCandles]);

  useEffect(() => {
    replaySeriesRef.current = replaySeries;
    // A chunk can resolve in the same frame that its first candle is revealed.
    // Consume the enlarged source through the latest visual cursor immediately;
    // otherwise no later message is guaranteed (for example when STEP lands
    // exactly on the new candle and playback is paused).
    const currentTime = replayCurrentTimeRef.current;
    if (!replaySeries || currentTime == null) return;
    const raw = rawCandlesRef.current;
    let cursor = raw.length;
    let appended = false;
    while (cursor < replaySeries.length) {
      const candle = replaySeries[cursor]!;
      if (candle.timestamp > currentTime) break;
      raw.push(candle);
      currentPriceRef.current = Number(candle.close);
      cursor += 1;
      appended = true;
    }
    if (appended) scheduleRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaySeries]);

  useEffect(() => {
    const started = replayRunning && !replayWasRunningRef.current;
    const stopped = !replayRunning && replayWasRunningRef.current;
    replayWasRunningRef.current = replayRunning;
    if (stopped) {
      // One paused-frame reconciliation applies any history revisions that were
      // deliberately deferred to keep live playback bounded and responsive.
      scheduleRender();
      return;
    }
    if (!started) return;

    // Playback is a workspace-wide live event, so every chart cell rejoins the
    // 75% boundary when Play is pressed. It can then be panned left without
    // introducing any cross-chart viewport synchronization.
    setFollowLatest(true);
    const frame = requestAnimationFrame(() => keepLatestPriceVisible(true));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayRunning]);

  useEffect(() => {
    if (!replaySessionId) return;
    return subscribeReplayVisual(replaySessionId, ({ currentTime }) => {
      replayCurrentTimeRef.current = currentTime;
      const source = replaySeriesRef.current;
      if (!source) return;
      const raw = rawCandlesRef.current;
      const lastTime = raw[raw.length - 1]?.timestamp ?? -Infinity;
      if (currentTime < lastTime) {
        rawCandlesRef.current = source.filter(
          (candle) => candle.timestamp <= currentTime,
        );
        currentPriceRef.current = Number(
          rawCandlesRef.current.at(-1)?.close ?? 0,
        );
        dataGenerationRef.current += 1;
        scheduleRender(true);
        return;
      }
      let cursor = raw.length;
      let appended = false;
      while (cursor < source.length) {
        const candle = source[cursor]!;
        if (candle.timestamp > currentTime) break;
        raw.push(candle);
        currentPriceRef.current = Number(candle.close);
        cursor += 1;
        appended = true;
      }
      if (appended) scheduleRender();
    });
    // The listener reads changing series data through replaySeriesRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaySessionId]);

  useEffect(() => {
    if (syncedInitialCandlesRef.current === initialCandles) return;
    syncedInitialCandlesRef.current = initialCandles;
    rawCandlesRef.current = [...initialCandles];
    dataGenerationRef.current += 1;
    const scale = chartRef.current?.timeScale();
    // Preserve the user's view across a data swap — but only if there was a view
    // to preserve. A grid cell whose series arrives after mount would otherwise
    // inherit the empty chart's logical range and open zoomed onto a few bars.
    const hadData = displayRef.current.length > 0;
    const visibleRange = hadData ? scale?.getVisibleLogicalRange() ?? null : null;
    renderMain(true);
    if (replayRunningRef.current) {
      // Extending the replay buffer replaces the source array. Never interpret
      // that mid-play data swap as a user pan, in any chart cell.
      setFollowLatest(true);
      keepLatestPriceVisible();
    } else if (visibleRange) {
      setFollowLatest(false, "preserved-range");
      scale?.setVisibleLogicalRange(visibleRange);
    } else if (!restoreSavedTimeRange()) {
      // The series has only just arrived, so this is where a cell cloned into a
      // new layout finally gets the view it was stored with.
      resetLatestViewport();
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
    // A stored range that cannot be applied yet stays pending for the effect
    // above, which runs as soon as this cell's candles land.
    if (replayRunningRef.current) {
      savedTimeRangeRef.current = null;
      setFollowLatest(true);
      keepLatestPriceVisible(true);
    } else if (!restoreSavedTimeRange() && savedTimeRangeRef.current === null) {
      resetLatestViewport();
    }
    requestAnimationFrame(updateViewportDiagnostics);
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
          chartType,
          indicators,
        }),
      );
    } catch {
      // Ignore local storage failures.
    }
  }, [displayTimeframe, chartType, indicators, viewStorageKey]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const mapped: SeriesMarker<Time>[] = (settings.tradeHistory ? markers : []).map((marker) => ({
      time: (Math.floor(candleBucketStart(marker.time, displayTimeframe)) / 1000) as UTCTimestamp,
      position: marker.position,
      color: marker.color,
      shape: marker.shape,
      text: marker.text,
    }));
    // v5: markers are a series primitive, not a series method.
    if (!markersRef.current) markersRef.current = createSeriesMarkers(series, mapped);
    else markersRef.current.setMarkers(mapped);
  }, [markers, settings.tradeHistory, displayTimeframe, seriesEpoch]);

  useEffect(() => {
    currentPriceRef.current = currentPrice;
    priceLineEnabledRef.current = settings.priceLine;
    // Candle deltas are also coalesced through renderMain. Updating the line in
    // that same animation frame prevents it from visually leading the body.
    scheduleRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice, settings.priceLine, seriesEpoch]);

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
    for (const position of settings.positionLines ? positionsRef.current : []) {
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
  }, [positionLineKey, settings.positionLines, activePositionId, seriesEpoch]);

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
    setFollowLatest(true);
    chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
    keepLatestPriceVisible(true);
  }

  /** Read the price and bar time under a viewport point, for the menu. */
  function openContextMenu(clientX: number, clientY: number) {
    const container = containerRef.current;
    const series = seriesRef.current;
    const scale = chartRef.current?.timeScale();
    let price: number | null = null;
    let at: number | null = null;
    if (container && series && scale) {
      const bounds = container.getBoundingClientRect();
      price = series.coordinateToPrice(clientY - bounds.top);
      const time = scale.coordinateToTime(clientX - bounds.left);
      if (time != null) at = chartTimeMs(time);
    }
    setContextMenu({ x: clientX, y: clientY, price, at });
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard?.writeText(text);
  }

  /**
   * Which kind of order a price implies, from the side of the market it sits on.
   *
   * Buying below the market is a limit and above it a stop; selling is the
   * mirror. Naming it in the menu ("Buy EURUSD at 1.08560 limit") is the
   * difference between an order that rests where you clicked and one that fills
   * immediately somewhere else. Within a pip of the market there is no
   * meaningful distance to rest at, so it is simply a market order.
   */
  function orderKindAt(price: number, direction: "long" | "short"): OrderType {
    if (currentPrice == null || Math.abs(price - currentPrice) < pipSize) {
      return "market";
    }
    const above = price > currentPrice;
    if (direction === "long") return above ? "stop" : "limit";
    return above ? "limit" : "stop";
  }

  function contextMenuItems(point: {
    price: number | null;
    at: number | null;
  }): ChartMenuItem[] {
    const price = point.price;
    const priceText = price == null ? null : price.toFixed(precision);
    const tradable = priceText != null && !referenceOnly && onPlanAtPrice != null;
    const hasPosition = positions.length > 0;
    const items: ChartMenuItem[] = [
      {
        id: "reset",
        label: "Reset chart view",
        icon: RotateCcw,
        onSelect: resetLatestViewport,
      },
      {
        id: "latest",
        label: "Go to latest candle",
        icon: LocateFixed,
        onSelect: goToLatest,
      },
    ];

    if (priceText) {
      items.push({
        id: "copy-price",
        label: `Copy price ${priceText}`,
        icon: Copy,
        groupStart: true,
        onSelect: () => copyToClipboard(priceText),
      });
    }
    if (point.at != null) {
      const at = point.at;
      const label = formatCrosshairLabel(
        at,
        settings.timeZone,
        TIMEFRAME_MS[displayTimeframe],
      );
      items.push({
        id: "copy-time",
        label: `Copy time ${label}`,
        icon: Clock,
        groupStart: priceText == null,
        onSelect: () => copyToClipboard(label),
      });
    }

    if (tradable && price != null) {
      const buyKind = orderKindAt(price, "long");
      const sellKind = orderKindAt(price, "short");
      items.push(
        {
          id: "buy-here",
          label: `Buy ${symbolLabel} at ${priceText} ${buyKind}`,
          icon: ArrowUpRight,
          groupStart: true,
          onSelect: () => onPlanAtPrice?.("long", priceText, buyKind),
        },
        {
          id: "sell-here",
          label: `Sell ${symbolLabel} at ${priceText} ${sellKind}`,
          icon: ArrowDownRight,
          onSelect: () => onPlanAtPrice?.("short", priceText, sellKind),
        },
      );
    }

    // Only offered against an open position: without one there is nothing for a
    // stop or target to attach to, and a disabled row would just be noise.
    if (hasPosition && priceText) {
      items.push(
        {
          id: "stop-here",
          label: `Set stop loss at ${priceText}`,
          icon: Minus,
          groupStart: !tradable,
          onSelect: () => onStopLossChange(priceText),
        },
        {
          id: "target-here",
          label: `Set take profit at ${priceText}`,
          icon: Tag,
          onSelect: () => onTakeProfitChange(priceText),
        },
      );
    }

    if (drawCount > 0) {
      items.push({
        id: "clear-drawings",
        label: `Remove ${drawCount} drawing${drawCount === 1 ? "" : "s"}`,
        icon: Trash2,
        danger: true,
        groupStart: true,
        onSelect: () => drawingEngineRef.current?.clearAll(),
      });
    }

    items.push({
      id: "settings",
      label: "Settings…",
      icon: Settings,
      groupStart: true,
      onSelect: () => setSettingsOpen(true),
    });
    return items;
  }

  function selectTimeframe(timeframe: Timeframe) {
    if (timeframe === displayTimeframe) return;
    setHistoryLoading(true);
    setDisplayTimeframe(timeframe);
  }

  function beginLineDrag(kind: "stop" | "target", event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = kind;
  }

  function moveLine(kind: "stop" | "target", event: React.PointerEvent<HTMLElement>) {
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

  function endLineDrag(kind: "stop" | "target", event: React.PointerEvent<HTMLElement>) {
    if (draggingRef.current !== kind) return;
    draggingRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const price = kind === "stop" ? stopDraftRef.current : targetDraftRef.current;
    if (kind === "stop") onStopLossChange(price == null ? null : price.toFixed(precision));
    else onTakeProfitChange(price == null ? null : price.toFixed(precision));
  }

  function beginPendingDrag(
    order: PendingOrder,
    event: React.PointerEvent<HTMLElement>,
  ) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pendingDragRef.current = { orderId: order.id, price: Number(order.entryPrice) };
  }

  function movePendingDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = pendingDragRef.current;
    const container = containerRef.current;
    const series = seriesRef.current;
    if (!drag || !container || !series) return;
    const bounds = container.getBoundingClientRect();
    const price = series.coordinateToPrice(event.clientY - bounds.top);
    if (price == null) return;
    drag.price = price;
    updateLineCoordinates();
  }

  function endPendingDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = pendingDragRef.current;
    if (!drag) return;
    pendingDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onModifyPendingOrder(drag.orderId, drag.price.toFixed(precision));
  }

  function beginProtectionDrag(
    kind: "stop" | "target",
    position: OpenPosition,
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    const entryPrice = Number(position.entryPrice);
    if (!Number.isFinite(entryPrice)) return;
    event.stopPropagation();
    protectionDragRef.current = {
      kind,
      startY: event.clientY,
      entryPrice,
      direction: position.direction,
      moved: false,
    };
    if (kind === "stop") {
      stopDraftRef.current = entryPrice;
      setStopDraft(entryPrice);
    } else {
      targetDraftRef.current = entryPrice;
      setTargetDraft(entryPrice);
    }
    beginLineDrag(kind, event);
  }

  function moveProtectionDrag(
    kind: "stop" | "target",
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    const drag = protectionDragRef.current;
    if (!drag || drag.kind !== kind) return;
    if (Math.abs(event.clientY - drag.startY) >= 4) drag.moved = true;
    moveLine(kind, event);
  }

  function endProtectionDrag(
    kind: "stop" | "target",
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    const drag = protectionDragRef.current;
    if (!drag || drag.kind !== kind) return;
    event.stopPropagation();
    draggingRef.current = null;
    protectionDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const price =
      kind === "stop" ? stopDraftRef.current : targetDraftRef.current;
    const correctSide =
      price != null &&
      (kind === "stop"
        ? drag.direction === "long"
          ? price < drag.entryPrice
          : price > drag.entryPrice
        : drag.direction === "long"
          ? price > drag.entryPrice
          : price < drag.entryPrice);
    if (drag.moved && correctSide && price != null) {
      if (kind === "stop") onStopLossChange(price.toFixed(precision));
      else onTakeProfitChange(price.toFixed(precision));
      return;
    }
    if (kind === "stop") {
      stopDraftRef.current = null;
      setStopDraft(null);
    } else {
      targetDraftRef.current = null;
      setTargetDraft(null);
    }
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
  const activePosition =
    positions.find((position) => position.id === activePositionId) ?? null;

  function projectedPositionPnl(
    position: OpenPosition | null,
    exitPrice: number | null,
  ): number | null {
    if (!position || exitPrice == null) return null;
    const entry = Number(position.entryPrice);
    const initialStop = Number(
      position.initialStopLoss ?? position.stopLoss ?? Number.NaN,
    );
    const initialRisk = Number(position.initialRiskAmount ?? Number.NaN);
    const initialDistance = Math.abs(entry - initialStop);
    if (
      !Number.isFinite(entry) ||
      !Number.isFinite(initialStop) ||
      !Number.isFinite(initialRisk) ||
      initialDistance <= 0
    ) {
      return null;
    }
    const move =
      position.direction === "long" ? exitPrice - entry : entry - exitPrice;
    return (move / initialDistance) * initialRisk;
  }

  function signedAccountValue(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return `— ${accountCurrency}`;
    return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)} ${accountCurrency}`;
  }
  drawingsActiveRef.current = drawTool != null || drawCount > 0;
  viewportOverlaysRef.current =
    overlayIndicators.length > 0 ||
    tradePlan != null ||
    pendingOrders.some((order) => order.status === "pending");

  useEffect(() => {
    drawingEngineRef.current?.setHideAll(!settings.drawings);
  }, [settings.drawings, drawCount]);

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

  /**
   * Width of the price scale, which is the width of the corner cell the zone
   * badge sits in. Measured rather than assumed: the scale is as wide as its
   * widest price label, so a 5-decimal FX pair and a 2-decimal crypto quote give
   * different corners.
   */
  const [priceScaleWidth, setPriceScaleWidth] = useState(64);
  useEffect(() => {
    if (!axisCorner) return;
    const measure = () => {
      try {
        const width = chartRef.current?.priceScale("right").width();
        if (typeof width === "number" && width > 0) setPriceScaleWidth(width);
      } catch {
        // Keep the last known width; the chart is mid-teardown.
      }
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const container = containerRef.current;
    const observer = container ? new ResizeObserver(measure) : null;
    if (container) observer?.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [axisCorner, viewVersion, seriesEpoch]);


  const legendChange = legend && legend.kind === "ohlc" ? legend.c - legend.o : null;
  // Portaled popovers live outside `.app-shell`, so the scoped CSS var doesn't
  // reach them — use an explicit solid colour keyed to the theme.
  const solidPanel = theme === "dark" ? "#111725" : "#ffffff";

  // Chart controls (timeframes + chart type + indicators). Rendered into the top
  // header via a portal when a slot is provided, otherwise docked above the chart.
  const chartControls = (
    <div className="flex min-w-0 items-center gap-1" role="toolbar" aria-label="Chart controls">
      {/* The timeframe list is the widest thing in the header and the only part
          that may overflow, so it scrolls inside itself. Menus live outside this
          box because a scroll container would clip their dropdowns. */}
      <div className="scroll-x-thin flex items-center border-r app-border pr-1" aria-label="Display timeframe">
        {availableTimeframes.map((timeframe) => (
          <ToolButton key={timeframe} label={`Display ${timeframe} candles`} active={displayTimeframe === timeframe} onClick={() => selectTimeframe(timeframe)}>
            {timeframe}
          </ToolButton>
        ))}
      </div>

      {/* Chart type */}
      <div className="relative shrink-0">
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
          <div className="absolute left-0 top-9 z-[55] w-40 rounded-lg border app-border bg-[var(--app-panel-solid)] p-1 shadow-xl">
            {(Object.keys(CHART_TYPE_LABELS) as ChartType[]).map((t) => (
              <button key={t} type="button" onClick={() => { setChartType(t); setMenu(null); }} className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${chartType === t ? "bg-brand-400/15 text-brand-300" : "hover:bg-[var(--app-panel-2)]"}`}>
                {CHART_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Indicators */}
      <div className="relative shrink-0">
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
          <div className="absolute left-0 top-9 z-[55] w-72 rounded-lg border app-border bg-[var(--app-panel-solid)] p-2 shadow-xl">
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
      {/* The drawing rail owns its own column; the chart begins after it instead of rendering underneath it. */}
      <div className="relative min-h-0 flex-1 pl-12">
        <div
          ref={containerRef}
          className={`h-full w-full ${cursorMode === "crosshair" && drawTool == null ? "cursor-crosshair" : ""}`}
          role="img"
          aria-label="Candlestick price chart"
          data-current-price={currentPrice ?? undefined}
          data-axis-timeframe={displayTimeframe}
          data-axis-tick-max-chars={timeframeTickMarkMaxCharacters(displayTimeframe)}
          data-axis-time-visible={TIMEFRAME_MS[displayTimeframe] < TIMEFRAME_MS["1d"]}
          data-cursor-mode={cursorMode}
          onContextMenu={(event) => {
            // A right-click on a drawing belongs to the drawing engine, which
            // has already called preventDefault on the native event by now.
            if (event.defaultPrevented) return;
            event.preventDefault();
            onFocusRef.current?.();
            openContextMenu(event.clientX, event.clientY);
          }}
        />

        {contextMenu && (
          <ChartContextMenu
            position={contextMenu}
            items={contextMenuItems(contextMenu)}
            theme={theme}
            onClose={() => setContextMenu(null)}
          />
        )}

        {settingsOpen && (
          <ChartSettingsDialog
            settings={settings}
            theme={theme}
            onChange={updateSettings}
            onReset={resetSettings}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        <DrawingLayer
          chart={chartApi}
          series={priceSeries}
          tool={drawTool}
          selectionEnabled={cursorMode === "pointer"}
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
        {chartApi && priceSeries && tradePlan && (
          <TradePlanOverlay
            chart={chartApi}
            series={priceSeries}
            plan={tradePlan}
            precision={precision}
            viewVersion={viewVersion}
            onChange={onTradePlanChange}
          />
        )}

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

        {/*
          Seated in the blank corner cell below the price scale, and kept inside
          that column: the crosshair's date tooltip travels the full width of the
          time axis, so anything overhanging the axis eventually collides with it.
          Hidden on phone widths, where the docked replay controls already occupy
          the bottom of the chart.
        */}
        {axisCorner && (
          <div
            data-testid="chart-axis-corner"
            className="pointer-events-none absolute bottom-0 right-0 z-20 hidden items-end md:flex"
            style={{ width: priceScaleWidth }}
          >
            <div className="pointer-events-auto w-full">{axisCorner}</div>
          </div>
        )}

        {/*
          Chart legend: two rows in the top-left corner.

          Row one is the chart's identity and its dealing prices — instrument
          (which opens the symbol picker), display timeframe, and the quote strip
          rendered inline so it reads as one bar rather than a second panel. Row
          two is the bar under the crosshair.

          The rows are a flow column inside a chart-sized overlay, not absolutely
          placed at hand-computed offsets, so adding or removing a row cannot
          leave two of them overlapping. The overlay stays the positioned ancestor
          so the order ticket's expanded panel still centres and drags against the
          whole chart.
        */}
        {/*
          The cell holding the order ticket rides above the replay toolbox; every
          other cell's legend stays beneath it. The toolbox has to clear the
          neighbouring cells' chrome — that is why it sits at z-45 — but the
          planner is a focused working surface and must never be covered by it.
        */}
        <div
          className={`pointer-events-none absolute inset-0 ${
            orderTicket ? "z-[50]" : "z-30"
          }`}
        >
          {/*
            One font-size on the column; every label inside is sized in `em`
            against it, so the whole legend scales from a single preference
            instead of a dozen hand-tuned pixel values.
          */}
          <div
            className="flex w-fit flex-col items-start gap-1 pl-14 pt-2 text-[var(--chart-text)]"
            style={{ fontSize: overlayFont }}
          >
            <div
              className="pointer-events-auto flex items-center gap-1 rounded-lg border app-border bg-[var(--app-panel-solid)]/95 p-1 shadow-lg"
              data-testid="chart-legend"
            >
              {onSelectInstrument ? (
                <button
                  type="button"
                  data-testid="symbol-picker-trigger"
                  onClick={onSelectInstrument}
                  aria-haspopup="dialog"
                  aria-label={`${symbolLabel}. Select a symbol`}
                  title="Select a symbol"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-mono text-[1.05em] font-bold transition-colors hover:bg-[var(--app-panel-2)] hover:text-[var(--app-accent-text)]"
                >
                  {symbolLabel}
                  <ChevronDown size={12} className="text-[var(--chart-muted)]" aria-hidden />
                </button>
              ) : (
                <span className="px-2 font-mono text-[1.05em] font-bold">{symbolLabel}</span>
              )}
              <span className="font-mono text-[0.92em] font-semibold text-[var(--chart-muted)]">
                {displayTimeframe}
              </span>
              {referenceOnly && (
                <span
                  title="Reference chart: orders follow the session's traded instrument"
                  className="rounded px-1 py-0.5 text-[0.78em] font-bold uppercase tracking-wide"
                  style={{
                    color: "var(--app-warn-text)",
                    background: "var(--app-warn-wash)",
                  }}
                >
                  Ref
                </span>
              )}
              {orderTicket && (
                <>
                  <span className="mx-0.5 h-6 w-px bg-[var(--app-border)]" aria-hidden />
                  {orderTicket}
                </>
              )}
            </div>

            {legend && (
              <div className="pointer-events-auto flex items-center gap-2 rounded-md border app-border bg-[var(--app-panel-solid)]/95 px-2 py-1 font-mono text-[0.92em] shadow">
                <span className="text-[var(--chart-muted)]">
                  {formatInZone(legend.at, settings.timeZone, LEGEND_DATE_FORMAT)}
                </span>
                <span className="h-3 w-px bg-[var(--app-border)]" aria-hidden />
                {legend.kind === "ohlc" ? (
                  <>
                    <span className="text-[var(--chart-muted)]">
                      O <span className="text-[var(--chart-text)]">{legend.o.toFixed(precision)}</span>
                    </span>
                    <span className="text-[var(--chart-muted)]">
                      H <span className="text-[var(--chart-text)]">{legend.h.toFixed(precision)}</span>
                    </span>
                    <span className="text-[var(--chart-muted)]">
                      L <span className="text-[var(--chart-text)]">{legend.l.toFixed(precision)}</span>
                    </span>
                    <span className="text-[var(--chart-muted)]">
                      C <span className="text-[var(--chart-text)]">{legend.c.toFixed(precision)}</span>
                    </span>
                    {legend.volume != null && (
                      <span className="text-[var(--chart-muted)]">
                        V <span className="text-[var(--chart-text)]">{formatVolume(legend.volume)}</span>
                      </span>
                    )}
                    {legendChange != null && (
                      <span className={legendChange >= 0 ? "text-[var(--app-accent-text)]" : "text-bear"}>
                        {legendChange >= 0 ? "+" : ""}
                        {(legendChange / pipSize).toFixed(1)}p
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[var(--chart-muted)]">
                    Price <span className="text-[var(--chart-text)]">{legend.value.toFixed(precision)}</span>
                  </span>
                )}
              </div>
            )}

            {/* Indicator labels continue the same column, so they never collide. */}
            {pricePaneIndicators.length > 0 && (
              <div className="pointer-events-auto flex flex-col items-start gap-0.5">
                {pricePaneIndicators.map((inst) => {
              const color = inst.style[getDef(inst.kind)?.plots[0]?.key ?? ""]?.color ?? "#5b8bff";
              return (
                <div key={inst.id} className="group relative flex items-center gap-1.5 rounded-md border app-border bg-[var(--app-panel)]/85 px-2 py-0.5 text-[0.92em] shadow backdrop-blur">
                  <span className="h-2 w-2 rounded-full" style={{ background: color, opacity: inst.visible ? 1 : 0.3 }} />
                  <span className={`font-medium ${inst.visible ? "" : "text-[var(--chart-muted)] line-through"}`}>{indicatorLabel(inst)}</span>
                  <button type="button" aria-label={inst.visible ? "Hide" : "Show"} onClick={() => updateIndicator(inst.id, { visible: !inst.visible })} className="ml-0.5 text-[var(--chart-muted)] opacity-0 transition-opacity hover:text-[var(--chart-text)] group-hover:opacity-100">
                    {inst.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button type="button" aria-label="Settings" onClick={() => setIndicatorEditing(inst.id)} className="text-[var(--chart-muted)] opacity-0 transition-opacity hover:text-[var(--chart-text)] group-hover:opacity-100">
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
          </div>
        </div>

        {/* In-pane oscillator labels — floated at the top-left of each native pane. */}
        {ownPaneIndicators.map((inst, i) => {
          const top = paneTops[i + 1];
          if (top == null) return null;
          return (
            <div
              key={inst.id}
              className="group absolute left-14 z-10 flex text-[var(--chart-text)] items-center gap-1.5 rounded-md border app-border bg-[var(--app-panel)]/85 px-2 py-0.5 text-[0.92em] shadow backdrop-blur"
              style={{ top: top + 4, fontSize: overlayFont }}
            >
              <span className={`font-medium ${inst.visible ? "" : "text-[var(--chart-muted)] line-through"}`}>{indicatorLabel(inst)}</span>
              <button type="button" aria-label={inst.visible ? "Hide" : "Show"} onClick={() => updateIndicator(inst.id, { visible: !inst.visible })} className="text-[var(--chart-muted)] opacity-0 transition-opacity hover:text-[var(--chart-text)] group-hover:opacity-100">
                {inst.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
              <button type="button" aria-label="Settings" onClick={() => setIndicatorEditing(inst.id)} className="text-[var(--chart-muted)] opacity-0 transition-opacity hover:text-[var(--chart-text)] group-hover:opacity-100">
                <Settings2 size={12} />
              </button>
              <button type="button" aria-label="Remove" onClick={() => removeIndicator(inst.id)} className="app-muted opacity-0 transition-opacity hover:text-bear group-hover:opacity-100">
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}

        {(tradePlan || positions.length > 0 || pendingOrders.some((order) => order.status === "pending")) && (
          <div
            data-testid="trade-line-key"
            style={{ fontSize: overlayFont }}
            className="pointer-events-none absolute bottom-7 left-3 z-10 flex items-center gap-3 rounded border app-border bg-[var(--app-panel-solid)]/90 px-2 py-1 text-[0.82em] font-bold uppercase tracking-wide text-[var(--chart-muted)] shadow"
            aria-label="Trade line styles"
          >
            <span className="flex items-center gap-1">
              <i className="w-5 border-t border-dashed border-sky-400" />
              Planned
            </span>
            <span className="flex items-center gap-1">
              <i className="w-5 border-t border-dotted border-amber-400" />
              Pending
            </span>
            <span className="flex items-center gap-1 text-[var(--chart-text)]">
              <i className="w-5 border-t border-[#2962ff]" />
              Active
            </span>
          </div>
        )}

        {pendingOrders.filter((order) => order.status === "pending").map((order) => (
          <div
            key={order.id}
            data-testid="pending-order-line"
            data-line-state="pending"
            ref={(element) => {
              if (!element) {
                pendingLineElsRef.current.delete(order.id);
                return;
              }
              pendingLineElsRef.current.set(order.id, element);
              placeLine(element, priceCoordinate(Number(order.entryPrice)));
            }}
            onPointerDown={(event) => beginPendingDrag(order, event)}
            onPointerMove={movePendingDrag}
            onPointerUp={endPendingDrag}
            onPointerCancel={endPendingDrag}
            className="absolute left-0 right-16 z-30 h-5 -translate-y-1/2 touch-none cursor-ns-resize border-t border-dotted border-amber-400"
            style={{ top: 0, visibility: "hidden" }}
            aria-label={`Drag ${order.direction === "long" ? "buy" : "sell"} ${order.orderType} order at ${order.entryPrice}`}
          >
            <span className="absolute right-1 -top-3.5 flex h-7 items-center overflow-hidden rounded border border-amber-400 bg-[var(--app-panel-solid)] font-mono text-[10px] font-bold shadow-lg">
              <span className="h-full border-r border-amber-400/50 bg-amber-400/10 px-2 leading-7 text-amber-300">
                PENDING · {order.direction === "long" ? "BUY" : "SELL"} {order.orderType.toUpperCase()}
              </span>
              <span className="h-full border-r border-amber-400/50 px-2 leading-7 text-amber-300">
                {order.lots} · {order.entryPrice}
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCancelPendingOrder(order.id);
                }}
                className="grid h-full w-7 place-items-center hover:bg-bear/15 hover:text-bear"
                aria-label="Cancel pending order"
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          </div>
        ))}

        {(settings.positionLines ? positions : []).map((position) => {
          const isLong = position.direction === "long";
          const positive = Number(position.unrealizedPnl) >= 0;
          const isActive = position.id === activePositionId;
          const livePips =
            currentPrice == null
              ? null
              : ((isLong
                  ? currentPrice - Number(position.entryPrice)
                  : Number(position.entryPrice) - currentPrice) /
                pipSize);
          const risk = Number(position.initialRiskAmount ?? Number.NaN);
          const liveR =
            Number.isFinite(risk) && risk > 0
              ? Number(position.unrealizedPnl) / risk
              : null;
          const breakEvenAvailable =
            isActive &&
            position.stopLoss != null &&
            currentPrice != null &&
            (isLong
              ? currentPrice > Number(position.entryPrice) &&
                Number(position.stopLoss) < Number(position.entryPrice)
              : currentPrice < Number(position.entryPrice) &&
                Number(position.stopLoss) > Number(position.entryPrice));
          return (
            <div
              key={position.id}
              data-testid="position-entry-line"
              data-line-state="active"
              ref={(el) => {
                if (!el) {
                  entryLineElsRef.current.delete(position.id);
                  return;
                }
                entryLineElsRef.current.set(position.id, el);
                placeLine(el, priceCoordinate(Number(position.entryPrice)));
              }}
              className="group pointer-events-auto absolute left-0 right-16 z-30 h-4 -translate-y-1/2"
              style={{ top: 0, visibility: "hidden" }}
            >
              <span className={`pointer-events-none absolute left-0 right-0 top-1/2 border-t ${isLong ? "border-[#2962ff]" : "border-bear"}`} />
              <div className="absolute right-1 -top-3.5 flex h-7 items-center overflow-hidden rounded border border-[#2962ff] bg-[var(--app-panel-solid)] text-[10px] shadow-lg">
                <span className="grid h-full min-w-7 place-items-center border-r border-[#2962ff]/60 bg-[#2962ff]/15 font-bold text-[#5b8bff]">
                  {isLong ? "B" : "S"}
                </span>
                {isActive && !position.takeProfit && (
                  <button
                    type="button"
                    data-testid="add-take-profit-handle"
                    onPointerDown={(event) =>
                      beginProtectionDrag("target", position, event)
                    }
                    onPointerMove={(event) =>
                      moveProtectionDrag("target", event)
                    }
                    onPointerUp={(event) =>
                      endProtectionDrag("target", event)
                    }
                    onPointerCancel={(event) =>
                      endProtectionDrag("target", event)
                    }
                    className="h-full touch-none border-r app-border px-2 font-bold text-brand-300 hover:bg-white/[0.06]"
                    aria-label={`Drag to add take profit for ${isLong ? "buy" : "sell"} position`}
                  >
                    TP
                  </button>
                )}
                {isActive && !position.stopLoss && (
                  <button
                    type="button"
                    data-testid="add-stop-loss-handle"
                    onPointerDown={(event) =>
                      beginProtectionDrag("stop", position, event)
                    }
                    onPointerMove={(event) =>
                      moveProtectionDrag("stop", event)
                    }
                    onPointerUp={(event) =>
                      endProtectionDrag("stop", event)
                    }
                    onPointerCancel={(event) =>
                      endProtectionDrag("stop", event)
                    }
                    className="h-full touch-none border-r app-border px-2 font-bold text-amber-400 hover:bg-white/[0.06]"
                    aria-label={`Drag to add stop loss for ${isLong ? "buy" : "sell"} position`}
                  >
                    SL
                  </button>
                )}
                {breakEvenAvailable && (
                  <button
                    type="button"
                    onClick={() => onStopLossChange(position.entryPrice)}
                    className="h-full border-r app-border px-2 font-bold text-sky-300 hover:bg-sky-400/10"
                    aria-label={`Move ${isLong ? "buy" : "sell"} position to break-even`}
                  >
                    BE
                  </button>
                )}
                <span className="h-full border-r app-border bg-[#2962ff] px-2 font-mono font-bold leading-7 text-white">
                  ACTIVE · {position.lots}
                </span>
                <span className={`h-full min-w-[164px] border-r app-border px-2 font-mono font-bold leading-7 ${positive ? "text-brand-300" : "text-bear"}`}>
                  {Number(position.unrealizedPnl) >= 0 ? "+" : "−"}
                  {Math.abs(Number(position.unrealizedPnl)).toFixed(2)} {accountCurrency}
                  {livePips == null
                    ? ""
                    : ` · ${livePips >= 0 ? "+" : ""}${livePips.toFixed(1)}p`}
                  {liveR == null
                    ? ""
                    : ` · ${liveR >= 0 ? "+" : ""}${liveR.toFixed(2)}R`}
                </span>
                <button type="button" onClick={() => onEditPosition(position.id)} className="grid h-full w-7 place-items-center hover:bg-bear/15 hover:text-bear" aria-label={`Manage ${isLong ? "buy" : "sell"} position`}>
                  <X size={12} aria-hidden />
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
              const Icon = DRAWING_TOOL_ICONS[t];
              return (
                <ToolButton key={t} label={TOOL_LABELS[t]} active={drawTool === t} onClick={() => { if (favMovedRef.current) return; setDrawTool(t); setMenu(null); }}>
                  <Icon size={22} aria-hidden />
                </ToolButton>
              );
            })}
          </div>
        )}

        {/* Click-away backdrop for open menus */}
        {menu && (
          <div
            className="absolute inset-0 z-20"
            onClick={() => setMenu(null)}
            // Right-clicking away from a menu should dismiss it too, rather
            // than leaving an invisible backdrop swallowing the click.
            onContextMenu={() => setMenu(null)}
            aria-hidden
          />
        )}

        {/* Drawing tools occupy the reserved pane to the left of the chart canvas. */}
        <div className="absolute bottom-0 left-0 top-0 z-30 flex w-12 flex-col items-center gap-1 overflow-y-auto border-r app-border bg-[var(--app-panel)] py-2" role="toolbar" aria-label="Drawing tools">
          <ToolButton
            label={`Cursor mode: ${cursorMode === "pointer" ? "Pointer" : "Crosshair"}`}
            active={drawTool === null}
            onClick={(event) => {
              if (menu === "cursor") { setMenu(null); return; }
              const rect = event.currentTarget.getBoundingClientRect();
              setMenuAnchor({ x: rect.right + 6, y: rect.top });
              setMenu("cursor");
            }}
          >
            {cursorMode === "pointer" ? <MousePointer2 size={19} aria-hidden /> : <Crosshair size={19} aria-hidden />}
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
                <grp.Icon size={22} aria-hidden />
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
                onClick={() => updateSettings({ drawings: drawingsHidden })}
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
            <ToolButton label="Toggle magnet crosshair" active={magnetCrosshair} onClick={() => updateSettings({ magnet: !magnetCrosshair })}>
              <Crosshair size={18} aria-hidden />
            </ToolButton>
            <ToolButton label="Toggle chart grid" active={gridVisible} onClick={() => updateSettings({ grid: !gridVisible })}>
              <Grid3X3 size={18} aria-hidden />
            </ToolButton>
            <ToolButton label="Go to latest candle" onClick={goToLatest}>
              <LocateFixed size={18} aria-hidden />
            </ToolButton>
          </div>
        </div>

        {menu === "cursor" && menuAnchor && createPortal(
          <div
            className="fixed z-[60] w-44 rounded-lg border app-border bg-[var(--app-panel-solid)] p-1 shadow-xl"
            style={{ left: menuAnchor.x, top: menuAnchor.y }}
            role="menu"
            aria-label="Cursor modes"
          >
            {([
              { mode: "pointer" as const, label: "Pointer", hint: "Select and move drawings", Icon: MousePointer2 },
              { mode: "crosshair" as const, label: "Crosshair", hint: "Inspect time and price", Icon: Crosshair },
            ]).map(({ mode, label, hint, Icon }) => (
              <button
                key={mode}
                type="button"
                role="menuitemradio"
                aria-checked={cursorMode === mode}
                onClick={() => { setCursorMode(mode); setDrawTool(null); setMenu(null); }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left ${cursorMode === mode ? "bg-brand-400/15 text-brand-300" : "hover:bg-[var(--app-panel-2)]"}`}
              >
                <Icon size={20} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold">{label}</span>
                  <span className="block text-[10px] app-muted">{hint}</span>
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}

        {/* Tool-group flyout — portaled so the rail never needs to scroll to show it */}
        {(() => {
          const grp = DRAW_GROUPS.find((g) => g.key === menu);
          if (!grp || !menuAnchor) return null;
          return createPortal(
            <div
              className="fixed z-[60] max-h-[70vh] w-56 overflow-y-auto rounded-lg border app-border p-1 shadow-xl"
              style={{
                left: menuAnchor.x,
                top: menuAnchor.y,
                backgroundColor: solidPanel,
                // Focus rings punch their gap out of this panel, not the page.
                "--focus-ring-offset": solidPanel,
              } as React.CSSProperties}
            >
              {grp.tools.map((t) => {
                const Icon = DRAWING_TOOL_ICONS[t];
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
                      <Icon size={21} aria-hidden /> {TOOL_LABELS[t]}
                    </button>
                    <button
                      type="button"
                      aria-label={fav ? `Unfavorite ${TOOL_LABELS[t]}` : `Favorite ${TOOL_LABELS[t]}`}
                      aria-pressed={fav}
                      onClick={(e) => { e.stopPropagation(); onToggleFavorite(t); }}
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

        {settings.positionLines && stopDraft != null && (
          <div
            role="button"
            tabIndex={0}
            data-testid="stop-loss-line"
            data-line-state="active"
            ref={(el) => {
              stopLineElRef.current = el;
              placeLine(el, priceCoordinate(stopDraftRef.current));
            }}
            aria-label={`Drag stop-loss line at ${stopDraft.toFixed(precision)}`}
            onPointerDown={(event) => beginLineDrag("stop", event)}
            onPointerMove={(event) => moveLine("stop", event)}
            onPointerUp={(event) => endLineDrag("stop", event)}
            onPointerCancel={(event) => endLineDrag("stop", event)}
            className="absolute left-0 right-16 z-30 h-5 -translate-y-1/2 touch-none cursor-ns-resize border-t border-amber-400 text-left"
            style={{ top: 0, visibility: "hidden" }}
          >
            <span className="absolute right-1 -top-3.5 flex h-7 items-center overflow-hidden rounded border border-amber-400 bg-[var(--app-panel-solid)] font-mono text-[10px] font-bold shadow-lg">
              <span className="h-full border-r border-amber-400/50 bg-amber-400/10 px-2 leading-7 text-amber-400">
                {activePosition?.trailingStopPips ? "TRAIL" : "ACTIVE SL"} · {activePosition?.lots ?? "—"}
              </span>
              <span className="h-full min-w-[88px] border-r border-amber-400/50 px-2 leading-7 text-amber-400">
                {signedAccountValue(
                  projectedPositionPnl(activePosition, stopDraft),
                )}
              </span>
              <button
                type="button"
                aria-label="Remove stop loss"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onStopLossChange(null);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (event.detail === 0) onStopLossChange(null);
                }}
                className="grid h-full w-7 cursor-pointer place-items-center hover:bg-amber-400/15"
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          </div>
        )}

        {settings.positionLines && targetDraft != null && (
          <div
            role="button"
            tabIndex={0}
            data-testid="take-profit-line"
            data-line-state="active"
            ref={(el) => {
              targetLineElRef.current = el;
              placeLine(el, priceCoordinate(targetDraftRef.current));
            }}
            aria-label={`Drag take-profit line at ${targetDraft.toFixed(precision)}`}
            onPointerDown={(event) => beginLineDrag("target", event)}
            onPointerMove={(event) => moveLine("target", event)}
            onPointerUp={(event) => endLineDrag("target", event)}
            onPointerCancel={(event) => endLineDrag("target", event)}
            className="absolute left-0 right-16 z-30 h-5 -translate-y-1/2 touch-none cursor-ns-resize border-t border-brand-400 text-left"
            style={{ top: 0, visibility: "hidden" }}
          >
            <span className="absolute right-1 -top-3.5 flex h-7 items-center overflow-hidden rounded border border-brand-400 bg-[var(--app-panel-solid)] font-mono text-[10px] font-bold shadow-lg">
              <span className="h-full border-r border-brand-400/50 bg-brand-400/10 px-2 leading-7 text-brand-300">
                ACTIVE TP · {activePosition?.lots ?? "—"}
              </span>
              <span className="h-full min-w-[88px] border-r border-brand-400/50 px-2 leading-7 text-brand-300">
                {signedAccountValue(
                  projectedPositionPnl(activePosition, targetDraft),
                )}
              </span>
              <button
                type="button"
                aria-label="Remove take profit"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onTakeProfitChange(null);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (event.detail === 0) onTakeProfitChange(null);
                }}
                className="grid h-full w-7 cursor-pointer place-items-center hover:bg-brand-400/15"
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          </div>
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
