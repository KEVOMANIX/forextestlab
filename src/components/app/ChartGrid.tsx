"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Columns2, Grid2X2, Rows2, Square, LayoutPanelLeft } from "lucide-react";

import type { PairChartData } from "@/lib/backtest/client";
import type { TradePlan } from "@/lib/backtest/trade-plan";
import type { OpenPosition, PendingOrder, PublicSessionState } from "@/lib/backtest/types";
import type { Candle, Timeframe } from "@/lib/market-data/types";

import { useCompactViewport } from "@/lib/ui/use-media-query";
import PriceChart, { type ChartMarker } from "./PriceChart";
import type { ChartWorkspace } from "./useChartWorkspace";

/**
 * Multi-chart workspace.
 *
 * Lightweight Charts has panes but no multi-chart layout, so each cell is its
 * own independent chart instance. Crosshair, pan and zoom are intentionally
 * local to each cell so mixed timeframes remain usable.
 * The model is TradingView's: one focused cell receives the symbol picker, the
 * order ticket and the top-bar toolbar, while the rest are context views.
 */

export type GridLayout = "1" | "2h" | "2v" | "3" | "4";

export interface ChartCell {
  id: string;
  symbol: string;
  /** Null until the user picks one; the cell then falls back to the session timeframe. */
  timeframe: Timeframe | null;
}

const LAYOUTS: { key: GridLayout; label: string; cells: number; Icon: typeof Square; className: string }[] = [
  { key: "1", label: "Single chart", cells: 1, Icon: Square, className: "grid-cols-1 grid-rows-1" },
  { key: "2h", label: "Two columns", cells: 2, Icon: Columns2, className: "grid-cols-2 grid-rows-1" },
  { key: "2v", label: "Two rows", cells: 2, Icon: Rows2, className: "grid-cols-1 grid-rows-2" },
  { key: "3", label: "Main chart with two side charts", cells: 3, Icon: LayoutPanelLeft, className: "grid-cols-2 grid-rows-2" },
  { key: "4", label: "Four charts", cells: 4, Icon: Grid2X2, className: "grid-cols-2 grid-rows-2" },
];

function layoutSpec(layout: GridLayout) {
  return LAYOUTS.find((item) => item.key === layout) ?? LAYOUTS[0]!;
}

/** In the 3-up layout the first cell spans both rows of the left column. */
function cellSpan(layout: GridLayout, index: number): string {
  return layout === "3" && index === 0 ? "row-span-2" : "";
}

interface StoredLayout {
  layout: GridLayout;
  cells: ChartCell[];
  focusedId: string;
}

/**
 * Seed a new cell's view state from the cell it was cloned from, unless it
 * already has its own from an earlier visit to this layout.
 */
function cloneCellView(storageKey: string, fromCellId: string, toCellId: string) {
  try {
    const target = `forextestlab:chart:${storageKey}:${toCellId}`;
    if (window.localStorage.getItem(target)) return;
    const source = window.localStorage.getItem(`forextestlab:chart:${storageKey}:${fromCellId}`);
    if (source) window.localStorage.setItem(target, source);
  } catch {
    // A cell without seeded state just opens on the defaults.
  }
}

function readStoredLayout(storageKey: string): StoredLayout | null {
  try {
    const raw = window.localStorage.getItem(`forextestlab:layout:${storageKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLayout>;
    if (!parsed.layout || !Array.isArray(parsed.cells) || parsed.cells.length === 0) return null;
    return {
      layout: parsed.layout,
      cells: parsed.cells,
      focusedId: parsed.focusedId ?? parsed.cells[0]!.id,
    };
  } catch {
    return null;
  }
}

interface ChartGridProps {
  state: PublicSessionState;
  /**
   * The session symbol's whole series. Cells reveal it against the replay clock
   * themselves, so one that appears mid-session still shows the full history.
   */
  sessionSeries: Candle[];
  sessionContextCandles: Candle[];
  /** Full session series per non-session symbol, keyed by symbol. */
  pairs: Record<string, PairChartData>;
  pairLoadingSymbols: string[];
  onNeedSymbol: (symbol: string) => void;
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
  theme: "dark" | "light";
  onStopLossChange: (price: string | null) => void;
  onTakeProfitChange: (price: string | null) => void;
  onLoadHistory: (
    symbol: string,
    timeframe: Timeframe,
    before: number,
  ) => Promise<{ candles: Candle[]; hasMore: boolean }>;
  loading?: boolean;
  error?: string | null;
  storageKey: string;
  headerSlot?: HTMLElement | null;
  /** Dedicated far-right header target for the layout picker. */
  layoutSlot?: HTMLElement | null;
  orderTicket?: React.ReactNode;
  /** Clock and time-zone picker, seated in the focused chart's axis corner. */
  axisCorner?: React.ReactNode;
  /** Focused cell's symbol, so the top bar's pair picker stays in step. */
  focusedSymbol: string;
  onFocusedSymbolChange: (symbol: string) => void;
  /** Preferences every chart in the workspace shares. */
  workspace: ChartWorkspace;
  /** Opens the session's symbol picker for the focused cell. */
  onOpenSymbolPicker: () => void;
}

export default function ChartGrid({
  state,
  sessionSeries,
  sessionContextCandles,
  pairs,
  pairLoadingSymbols,
  onNeedSymbol,
  markers,
  positions,
  pendingOrders,
  onModifyPendingOrder,
  onCancelPendingOrder,
  activePositionId,
  onEditPosition,
  stopLoss,
  takeProfit,
  positionDirection,
  tradePlan,
  onTradePlanChange,
  theme,
  onStopLossChange,
  onTakeProfitChange,
  onLoadHistory,
  loading = false,
  error = null,
  storageKey,
  headerSlot = null,
  layoutSlot = null,
  orderTicket = null,
  axisCorner = null,
  focusedSymbol,
  onFocusedSymbolChange,
  workspace,
  onOpenSymbolPicker,
}: ChartGridProps) {
  const sessionSymbol = state.config.symbol;
  const compact = useCompactViewport();
  const [layout, setLayout] = useState<GridLayout>("1");
  const [cells, setCells] = useState<ChartCell[]>([
    { id: "cell-1", symbol: sessionSymbol, timeframe: null },
  ]);
  const [focusedId, setFocusedId] = useState("cell-1");
  const [restored, setRestored] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);

  useEffect(() => {
    const saved = readStoredLayout(storageKey);
    if (saved) {
      setLayout(saved.layout);
      setCells(saved.cells);
      setFocusedId(saved.focusedId);
    }
    setRestored(true);
  }, [storageKey]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(
        `forextestlab:layout:${storageKey}`,
        JSON.stringify({ layout, cells, focusedId } satisfies StoredLayout),
      );
    } catch {
      // Layout persistence is a convenience, not a requirement.
    }
  }, [restored, storageKey, layout, cells, focusedId]);

  const visibleCells = useMemo(() => {
    const count = layoutSpec(layout).cells;
    const next = cells.slice(0, count);
    // Growing the layout clones the focused cell, like TradingView: same
    // instrument, and the same view state (timeframe, chart type, indicators)
    // so the new pane opens as a copy of the chart you were just looking at.
    const template = cells.find((cell) => cell.id === focusedId) ?? cells[0];
    while (next.length < count) {
      const id = `cell-${next.length + 1}`;
      if (template) cloneCellView(storageKey, template.id, id);
      next.push({
        id,
        symbol: template?.symbol ?? sessionSymbol,
        timeframe: template?.timeframe ?? null,
      });
    }
    return next;
  }, [cells, layout, focusedId, sessionSymbol, storageKey]);

  // Persist cells the layout has grown into. Shrinking keeps the hidden cells'
  // configuration so switching back to a wider layout restores it.
  useEffect(() => {
    if (visibleCells.length <= cells.length) return;
    setCells(visibleCells);
  }, [visibleCells, cells.length]);

  const focused = visibleCells.find((cell) => cell.id === focusedId) ?? visibleCells[0]!;

  /**
   * The focused cell's instrument and the top bar's pair picker are two views of
   * one value, edited from both ends. This ref records whichever side moved last
   * so the other reconciles to it instead of pushing back — without it the two
   * effects below would trade updates forever.
   */
  const settledSymbolRef = useRef(focusedSymbol);

  // Top bar → focused cell.
  useEffect(() => {
    if (focusedSymbol === settledSymbolRef.current) return;
    settledSymbolRef.current = focusedSymbol;
    setCells((prev) => prev.map((cell) => (cell.id === focused.id ? { ...cell, symbol: focusedSymbol } : cell)));
  }, [focusedSymbol, focused.id]);

  // Focused cell (or a change of focus) → top bar.
  useEffect(() => {
    if (focused.symbol === settledSymbolRef.current) return;
    settledSymbolRef.current = focused.symbol;
    onFocusedSymbolChange(focused.symbol);
  }, [focused.symbol, onFocusedSymbolChange]);

  // Every cell on a foreign symbol needs that symbol's series loaded.
  useEffect(() => {
    for (const cell of visibleCells) {
      if (cell.symbol !== sessionSymbol && !pairs[cell.symbol]) onNeedSymbol(cell.symbol);
    }
  }, [visibleCells, sessionSymbol, pairs, onNeedSymbol]);

  const focusCell = useCallback((id: string) => setFocusedId(id), []);

  // Dismiss the layout menu the same way the top bar's menus behave.
  const layoutMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!layoutMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!layoutMenuRef.current?.contains(event.target as Node)) setLayoutMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLayoutMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [layoutMenuOpen]);

  const spec = layoutSpec(layout);
  const multi = visibleCells.length > 1;

  const layoutPicker = (
    <div className="relative shrink-0" ref={layoutMenuRef}>
      <button
        type="button"
        aria-label="Chart layout"
        aria-expanded={layoutMenuOpen}
        title={spec.label}
        onClick={() => setLayoutMenuOpen((open) => !open)}
        className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold transition-colors ${
          layoutMenuOpen || multi
            ? "border-brand-400/35 bg-brand-400/15 text-brand-300"
            : "app-border bg-[var(--app-panel-2)] hover:border-brand-400/25 hover:text-[var(--app-text)]"
        }`}
      >
        <spec.Icon size={15} aria-hidden />
        <span>Layout</span>
      </button>
      {layoutMenuOpen && (
        <div
          data-testid="chart-layout-menu"
          className="absolute right-0 top-9 z-40 w-52 rounded-lg border app-border bg-[var(--app-panel-solid)] p-1 shadow-xl"
        >
          {LAYOUTS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setLayout(item.key);
                setLayoutMenuOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                layout === item.key ? "bg-brand-400/15 text-brand-300" : "hover:bg-[var(--app-panel-2)]"
              }`}
            >
              <item.Icon size={15} aria-hidden />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col">
      {/* Layout has its own far-right header slot, independent from timeframe controls. */}
      {layoutSlot
        ? createPortal(layoutPicker, layoutSlot)
        : headerSlot
          ? createPortal(layoutPicker, headerSlot)
          : null}
      {/*
        A 2-column grid on a phone gives each pane about 180px of width, which is
        not a chart. Narrow viewports keep every cell the layout asked for but
        stack them full-width in a scrollable column, so each one stays readable.
      */}
      <div
        className={`grid min-h-0 flex-1 gap-px bg-[var(--app-border)] ${
          compact
            ? "auto-rows-[minmax(15rem,1fr)] grid-cols-1 overflow-y-auto"
            : spec.className
        }`}
      >
        {visibleCells.map((cell, index) => {
          const isSession = cell.symbol === sessionSymbol;
          const isFocused = cell.id === focused.id;
          const pair = isSession ? null : pairs[cell.symbol] ?? null;
          return (
            <div
              key={cell.id}
              data-testid={`chart-${cell.id}`}
              className={`relative min-h-0 min-w-0 overflow-hidden bg-[var(--app-bg)] ${compact ? "" : cellSpan(layout, index)} ${
                multi && isFocused ? "outline outline-1 -outline-offset-1 outline-brand-400/50" : ""
              }`}
            >
              <ChartCellView
                cell={cell}
                state={state}
                isSession={isSession}
                multi={multi}
                pair={pair}
                pairLoading={!isSession && pairLoadingSymbols.includes(cell.symbol)}
                sessionSeries={sessionSeries}
                sessionContextCandles={sessionContextCandles}
                markers={markers}
                positions={positions}
                pendingOrders={pendingOrders}
                onModifyPendingOrder={onModifyPendingOrder}
                onCancelPendingOrder={onCancelPendingOrder}
                activePositionId={activePositionId}
                onEditPosition={onEditPosition}
                stopLoss={stopLoss}
                takeProfit={takeProfit}
                positionDirection={positionDirection}
                tradePlan={tradePlan}
                onTradePlanChange={onTradePlanChange}
                theme={theme}
                onStopLossChange={onStopLossChange}
                onTakeProfitChange={onTakeProfitChange}
                onLoadHistory={onLoadHistory}
                loading={loading}
                error={error}
                storageKey={storageKey}
                workspace={workspace}
                onFocus={() => focusCell(cell.id)}
                headerSlot={!multi && isFocused ? headerSlot : null}
                orderTicket={isSession && isFocused ? orderTicket : null}
                // One clock for the workspace, on the chart being driven.
                axisCorner={isFocused ? axisCorner : null}
                onSelectInstrument={
                  multi
                    ? () => {
                        // Clicking a cell's symbol focuses that cell first, so the
                        // picker acts on the chart the trader just pointed at.
                        focusCell(cell.id);
                        onOpenSymbolPicker();
                      }
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ChartCellViewProps {
  cell: ChartCell;
  state: PublicSessionState;
  isSession: boolean;
  multi: boolean;
  pair: PairChartData | null;
  pairLoading: boolean;
  sessionSeries: Candle[];
  sessionContextCandles: Candle[];
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
  theme: "dark" | "light";
  onStopLossChange: (price: string | null) => void;
  onTakeProfitChange: (price: string | null) => void;
  onLoadHistory: (
    symbol: string,
    timeframe: Timeframe,
    before: number,
  ) => Promise<{ candles: Candle[]; hasMore: boolean }>;
  loading: boolean;
  error: string | null;
  storageKey: string;
  onFocus: () => void;
  headerSlot: HTMLElement | null;
  orderTicket: React.ReactNode;
  axisCorner: React.ReactNode;
  workspace: ChartWorkspace;
  onSelectInstrument: (() => void) | undefined;
}

function ChartCellView({
  cell,
  state,
  isSession,
  multi,
  pair,
  pairLoading,
  sessionSeries,
  sessionContextCandles,
  markers,
  positions,
  pendingOrders,
  onModifyPendingOrder,
  onCancelPendingOrder,
  activePositionId,
  onEditPosition,
  stopLoss,
  takeProfit,
  positionDirection,
  tradePlan,
  onTradePlanChange,
  theme,
  onStopLossChange,
  onTakeProfitChange,
  onLoadHistory,
  loading,
  error,
  storageKey,
  onFocus,
  headerSlot,
  orderTicket,
  axisCorner,
  workspace,
  onSelectInstrument,
}: ChartCellViewProps) {
  const reveal = useRevealedSeries(isSession ? sessionSeries : pair?.candles ?? null, state.currentTime);
  const noop = useCallback(() => {}, []);
  const loadHistory = useCallback(
    (timeframe: Timeframe, before: number) => onLoadHistory(cell.symbol, timeframe, before),
    [onLoadHistory, cell.symbol],
  );

  // Trading overlays only exist on cells showing the traded instrument.
  const tradable = isSession;
  // The chart body is driven by the revealed-series cursor, so its live price
  // must come from that same cursor. Reading state.currentPrice directly makes
  // the line render one React pass before the candle delta reaches the chart.
  const currentPrice = reveal.lastCandle
    ? Number(reveal.lastCandle.close)
    : null;

  return (
      <PriceChart
        key={`${cell.id}-${cell.symbol}`}
        onFocus={onFocus}
        initialCandles={reveal.initialCandles}
        contextCandles={isSession ? sessionContextCandles : pair?.contextCandles ?? []}
        lastCandle={null}
        lastCandles={reveal.newCandles}
        replaySeries={isSession ? sessionSeries : pair?.candles}
        replaySessionId={state.sessionId}
        markers={tradable ? markers : []}
        positions={tradable ? positions : []}
        pendingOrders={tradable ? pendingOrders : []}
        onModifyPendingOrder={tradable ? onModifyPendingOrder : noop}
        onCancelPendingOrder={tradable ? onCancelPendingOrder : noop}
        activePositionId={tradable ? activePositionId : null}
        onEditPosition={onEditPosition}
        stopLoss={tradable ? stopLoss : null}
        takeProfit={tradable ? takeProfit : null}
        positionDirection={tradable ? positionDirection : null}
        tradePlan={tradable ? tradePlan : null}
        onTradePlanChange={tradable ? onTradePlanChange : noop}
        currentPrice={currentPrice}
        baseTimeframe={state.config.timeframe}
        pipSize={Number(isSession ? state.config.pipSize : pair?.pipSize ?? state.config.pipSize)}
        precision={isSession ? state.config.pricePrecision : pair?.pricePrecision ?? state.config.pricePrecision}
        accountCurrency={state.config.accountCurrency}
        theme={theme}
        onStopLossChange={tradable ? onStopLossChange : noop}
        onTakeProfitChange={tradable ? onTakeProfitChange : noop}
        onLoadHistory={loadHistory}
        loading={isSession ? loading : pairLoading && !pair}
        error={isSession ? error : null}
        storageKey={`${storageKey}:${cell.symbol}`}
        viewKey={`${storageKey}:${cell.id}`}
        initialTimeframe={cell.timeframe ?? undefined}
        headerSlot={headerSlot}
        orderTicket={orderTicket}
        axisCorner={axisCorner}
        instrumentLabel={multi ? `${cell.symbol}${tradable ? "" : " · reference"}` : undefined}
        onSelectInstrument={onSelectInstrument}
        settings={workspace.settings}
        onSettingsChange={workspace.updateSettings}
        onSettingsReset={workspace.resetSettings}
        favorites={workspace.favorites}
        onToggleFavorite={workspace.toggleFavorite}
      />
  );
}

/**
 * The portion of a series the replay has reached. Candles are ascending, so a
 * binary search beats scanning a 1,500-bar series on every rewind.
 */
export function revealedUpTo(series: Candle[], clock: number | null): Candle[] {
  if (clock == null) return [];
  let low = 0;
  let high = series.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((series[mid]?.timestamp ?? 0) <= clock) low = mid + 1;
    else high = mid;
  }
  return series.slice(0, low);
}

interface RevealedSeries {
  /** Candles already revealed when this cell mounted. */
  initialCandles: Candle[];
  /** Only the candles revealed since the last tick, so the chart appends. */
  newCandles: Candle[];
  lastCandle: Candle | null;
}

/**
 * Reveal a symbol's series against the replay clock.
 *
 * Every cell derives its candles this way, including cells on the traded
 * instrument. Feeding them the session's opening candles plus deltas only works
 * for a chart that existed when the session started: a cell added mid-session
 * would show the opening candles, then a hole, then whatever arrived after it
 * mounted. Slicing a full series by timestamp makes mount time irrelevant, and
 * nothing past the clock is ever drawn.
 *
 * Only the delta since the previous tick is handed to the chart; passing the
 * whole revealed slice would re-feed the entire history on every candle and
 * defeat the chart's append fast path.
 */
function useRevealedSeries(series: Candle[] | null, currentTime: number | null): RevealedSeries {
  const [initialCandles, setInitialCandles] = useState<Candle[]>([]);
  const [newCandles, setNewCandles] = useState<Candle[]>([]);
  const cursorRef = useRef(0);
  const sourceRef = useRef<Candle[] | null>(null);
  const lastRef = useRef<Candle | null>(null);

  useEffect(() => {
    if (!series) {
      sourceRef.current = null;
      cursorRef.current = 0;
      lastRef.current = null;
      setInitialCandles([]);
      setNewCandles([]);
      return;
    }
    // Identity changes when the series is replaced or extended, not per tick.
    if (sourceRef.current === series) return;
    sourceRef.current = series;
    const revealed = revealedUpTo(series, currentTime);
    cursorRef.current = revealed.length;
    lastRef.current = revealed[revealed.length - 1] ?? null;
    setInitialCandles(revealed);
    setNewCandles([]);
  }, [series, currentTime]);

  useEffect(() => {
    const source = sourceRef.current;
    if (!source || currentTime == null) return;
    // Stepping back rewinds the clock, so re-slice instead of appending.
    const last = lastRef.current;
    if (last && currentTime < last.timestamp) {
      const revealed = revealedUpTo(source, currentTime);
      cursorRef.current = revealed.length;
      lastRef.current = revealed[revealed.length - 1] ?? null;
      setInitialCandles(revealed);
      setNewCandles([]);
      return;
    }
    const delta: Candle[] = [];
    while (cursorRef.current < source.length) {
      const candle = source[cursorRef.current]!;
      if (candle.timestamp > currentTime) break;
      delta.push(candle);
      cursorRef.current += 1;
    }
    if (delta.length === 0) return;
    lastRef.current = delta[delta.length - 1]!;
    setNewCandles(delta);
  }, [currentTime]);

  return { initialCandles, newCandles, lastCandle: lastRef.current };
}
