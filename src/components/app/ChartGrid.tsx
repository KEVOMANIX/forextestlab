"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Columns2, Crosshair, Grid2X2, Rows2, Square, LayoutPanelLeft, Link2, Link2Off } from "lucide-react";

import type { PairChartData } from "@/lib/backtest/client";
import type { OpenPosition, PublicSessionState } from "@/lib/backtest/types";
import { ChartSync } from "@/lib/chart/sync";
import type { Candle, Timeframe } from "@/lib/market-data/types";

import PriceChart, { type ChartMarker } from "./PriceChart";

/**
 * Multi-chart workspace.
 *
 * Lightweight Charts has panes but no multi-chart layout, so each cell is its
 * own chart instance; [ChartSync] keeps their time axis and crosshair together,
 * while each cell keeps its own zoom level.
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
  syncCrosshair: boolean;
  syncTime: boolean;
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
      syncCrosshair: parsed.syncCrosshair ?? true,
      syncTime: parsed.syncTime ?? true,
    };
  } catch {
    return null;
  }
}

interface ChartGridProps {
  state: PublicSessionState;
  /** Candles of the session symbol revealed so far. */
  sessionCandles: Candle[];
  sessionContextCandles: Candle[];
  lastCandle: Candle | null;
  lastCandles: Candle[];
  /** Full session series per non-session symbol, keyed by symbol. */
  pairs: Record<string, PairChartData>;
  pairLoadingSymbols: string[];
  onNeedSymbol: (symbol: string) => void;
  markers: ChartMarker[];
  positions: OpenPosition[];
  activePositionId: string | null;
  onEditPosition: (positionId: string) => void;
  stopLoss: number | null;
  takeProfit: number | null;
  positionDirection: "long" | "short" | null;
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
  orderTicket?: React.ReactNode;
  /** Focused cell's symbol, so the top bar's pair picker stays in step. */
  focusedSymbol: string;
  onFocusedSymbolChange: (symbol: string) => void;
}

export default function ChartGrid({
  state,
  sessionCandles,
  sessionContextCandles,
  lastCandle,
  lastCandles,
  pairs,
  pairLoadingSymbols,
  onNeedSymbol,
  markers,
  positions,
  activePositionId,
  onEditPosition,
  stopLoss,
  takeProfit,
  positionDirection,
  theme,
  onStopLossChange,
  onTakeProfitChange,
  onLoadHistory,
  loading = false,
  error = null,
  storageKey,
  headerSlot = null,
  orderTicket = null,
  focusedSymbol,
  onFocusedSymbolChange,
}: ChartGridProps) {
  const sessionSymbol = state.config.symbol;
  const [layout, setLayout] = useState<GridLayout>("1");
  const [cells, setCells] = useState<ChartCell[]>([
    { id: "cell-1", symbol: sessionSymbol, timeframe: null },
  ]);
  const [focusedId, setFocusedId] = useState("cell-1");
  const [syncCrosshair, setSyncCrosshair] = useState(true);
  const [syncTime, setSyncTime] = useState(true);
  const [restored, setRestored] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  // One registry for the workspace's lifetime — cells register on mount.
  const syncRef = useRef<ChartSync | null>(null);
  syncRef.current ??= new ChartSync();
  const sync = syncRef.current;

  useEffect(() => {
    const saved = readStoredLayout(storageKey);
    if (saved) {
      setLayout(saved.layout);
      setCells(saved.cells);
      setFocusedId(saved.focusedId);
      setSyncCrosshair(saved.syncCrosshair);
      setSyncTime(saved.syncTime);
    }
    setRestored(true);
  }, [storageKey]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(
        `forextestlab:layout:${storageKey}`,
        JSON.stringify({ layout, cells, focusedId, syncCrosshair, syncTime } satisfies StoredLayout),
      );
    } catch {
      // Layout persistence is a convenience, not a requirement.
    }
  }, [restored, storageKey, layout, cells, focusedId, syncCrosshair, syncTime]);

  useEffect(() => {
    sync.setModes({ crosshair: syncCrosshair, time: syncTime });
  }, [sync, syncCrosshair, syncTime]);

  const visibleCells = useMemo(() => {
    const count = layoutSpec(layout).cells;
    const next = cells.slice(0, count);
    // Growing the layout clones the focused cell's instrument, like TradingView.
    const template = cells.find((cell) => cell.id === focusedId) ?? cells[0];
    while (next.length < count) {
      next.push({
        id: `cell-${next.length + 1}`,
        symbol: template?.symbol ?? sessionSymbol,
        timeframe: null,
      });
    }
    return next;
  }, [cells, layout, focusedId, sessionSymbol]);

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
    <div className="relative" ref={layoutMenuRef}>
      <button
        type="button"
        aria-label="Chart layout"
        aria-expanded={layoutMenuOpen}
        title={spec.label}
        onClick={() => setLayoutMenuOpen((open) => !open)}
        className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors ${
          layoutMenuOpen || multi
            ? "bg-brand-400/15 text-brand-300"
            : "app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"
        }`}
      >
        <spec.Icon size={15} aria-hidden />
      </button>
      {layoutMenuOpen && (
        <div className="absolute right-0 top-9 z-40 w-52 rounded-lg border app-border bg-[var(--app-panel-solid)] p-1 shadow-xl">
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
          <p className="mt-1 border-t app-border px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide app-muted">
            Sync across charts
          </p>
          <button
            type="button"
            onClick={() => setSyncCrosshair((value) => !value)}
            aria-pressed={syncCrosshair}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--app-panel-2)]"
          >
            <Crosshair size={15} aria-hidden />
            Crosshair
            <Check size={14} aria-hidden className={`ml-auto ${syncCrosshair ? "text-brand-300" : "opacity-0"}`} />
          </button>
          <button
            type="button"
            onClick={() => setSyncTime((value) => !value)}
            aria-pressed={syncTime}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--app-panel-2)]"
          >
            {syncTime ? <Link2 size={15} aria-hidden /> : <Link2Off size={15} aria-hidden />}
            Time
            <Check size={14} aria-hidden className={`ml-auto ${syncTime ? "text-brand-300" : "opacity-0"}`} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col">
      {/* The layout picker rides in the top bar next to the focused cell's controls. */}
      {headerSlot ? createPortal(layoutPicker, headerSlot) : null}
      <div className={`grid min-h-0 flex-1 gap-px bg-[var(--app-border)] ${spec.className}`}>
        {visibleCells.map((cell, index) => {
          const isSession = cell.symbol === sessionSymbol;
          const isFocused = cell.id === focused.id;
          const pair = isSession ? null : pairs[cell.symbol] ?? null;
          return (
            <div
              key={cell.id}
              className={`relative min-h-0 min-w-0 overflow-hidden bg-[var(--app-bg)] ${cellSpan(layout, index)} ${
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
                sessionCandles={sessionCandles}
                sessionContextCandles={sessionContextCandles}
                lastCandle={lastCandle}
                lastCandles={lastCandles}
                markers={markers}
                positions={positions}
                activePositionId={activePositionId}
                onEditPosition={onEditPosition}
                stopLoss={stopLoss}
                takeProfit={takeProfit}
                positionDirection={positionDirection}
                theme={theme}
                onStopLossChange={onStopLossChange}
                onTakeProfitChange={onTakeProfitChange}
                onLoadHistory={onLoadHistory}
                loading={loading}
                error={error}
                storageKey={storageKey}
                sync={sync}
                onFocus={() => focusCell(cell.id)}
                headerSlot={!multi && isFocused ? headerSlot : null}
                orderTicket={isSession && isFocused ? orderTicket : null}
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
  sessionCandles: Candle[];
  sessionContextCandles: Candle[];
  lastCandle: Candle | null;
  lastCandles: Candle[];
  markers: ChartMarker[];
  positions: OpenPosition[];
  activePositionId: string | null;
  onEditPosition: (positionId: string) => void;
  stopLoss: number | null;
  takeProfit: number | null;
  positionDirection: "long" | "short" | null;
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
  sync: ChartSync;
  onFocus: () => void;
  headerSlot: HTMLElement | null;
  orderTicket: React.ReactNode;
}

function ChartCellView({
  cell,
  state,
  isSession,
  multi,
  pair,
  pairLoading,
  sessionCandles,
  sessionContextCandles,
  lastCandle,
  lastCandles,
  markers,
  positions,
  activePositionId,
  onEditPosition,
  stopLoss,
  takeProfit,
  positionDirection,
  theme,
  onStopLossChange,
  onTakeProfitChange,
  onLoadHistory,
  loading,
  error,
  storageKey,
  sync,
  onFocus,
  headerSlot,
  orderTicket,
}: ChartCellViewProps) {
  const reveal = usePairReveal(pair, state.currentTime);
  const noop = useCallback(() => {}, []);
  const loadHistory = useCallback(
    (timeframe: Timeframe, before: number) => onLoadHistory(cell.symbol, timeframe, before),
    [onLoadHistory, cell.symbol],
  );

  // Trading overlays only exist on cells showing the traded instrument.
  const tradable = isSession;
  const currentPrice = isSession
    ? state.currentPrice
      ? Number(state.currentPrice)
      : null
    : reveal.lastCandle
      ? Number(reveal.lastCandle.close)
      : null;

  return (
      <PriceChart
        key={`${cell.id}-${cell.symbol}`}
        cellId={cell.id}
        sync={sync}
        onFocus={onFocus}
        initialCandles={isSession ? sessionCandles : reveal.initialCandles}
        contextCandles={isSession ? sessionContextCandles : pair?.contextCandles ?? []}
        lastCandle={isSession ? lastCandle : null}
        lastCandles={isSession ? lastCandles : reveal.newCandles}
        markers={tradable ? markers : []}
        positions={tradable ? positions : []}
        activePositionId={tradable ? activePositionId : null}
        onEditPosition={onEditPosition}
        stopLoss={tradable ? stopLoss : null}
        takeProfit={tradable ? takeProfit : null}
        positionDirection={tradable ? positionDirection : null}
        currentPrice={currentPrice}
        baseTimeframe={state.config.timeframe}
        pipSize={Number(isSession ? state.config.pipSize : pair?.pipSize ?? state.config.pipSize)}
        precision={isSession ? state.config.pricePrecision : pair?.pricePrecision ?? state.config.pricePrecision}
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
        instrumentLabel={multi ? `${cell.symbol}${tradable ? "" : " · reference"}` : undefined}
      />
  );
}

interface PairReveal {
  /** Candles already revealed when this cell mounted. */
  initialCandles: Candle[];
  /** Only the candles revealed since the last tick, so the chart appends. */
  newCandles: Candle[];
  lastCandle: Candle | null;
}

/**
 * Reveal a non-session symbol's series against the replay clock.
 *
 * The full series is held here and sliced by timestamp, so an extra cell never
 * shows a bar the session has not reached. Only the delta since the previous
 * tick is handed to the chart: passing the whole revealed slice would re-feed
 * the entire history on every candle and defeat the chart's append fast path.
 */
function usePairReveal(pair: PairChartData | null, currentTime: number | null): PairReveal {
  const [initialCandles, setInitialCandles] = useState<Candle[]>([]);
  const [newCandles, setNewCandles] = useState<Candle[]>([]);
  const cursorRef = useRef(0);
  const sourceRef = useRef<PairChartData | null>(null);
  const lastRef = useRef<Candle | null>(null);

  useEffect(() => {
    if (!pair) {
      sourceRef.current = null;
      cursorRef.current = 0;
      lastRef.current = null;
      setInitialCandles([]);
      setNewCandles([]);
      return;
    }
    if (sourceRef.current === pair) return;
    sourceRef.current = pair;
    const clock = currentTime ?? 0;
    const revealed = pair.candles.filter((candle) => candle.timestamp <= clock);
    cursorRef.current = revealed.length;
    lastRef.current = revealed[revealed.length - 1] ?? null;
    setInitialCandles(revealed);
    setNewCandles([]);
  }, [pair, currentTime]);

  useEffect(() => {
    const series = sourceRef.current?.candles;
    if (!series || currentTime == null) return;
    // Stepping back rewinds the clock, so re-slice instead of appending.
    const last = lastRef.current;
    if (last && currentTime < last.timestamp) {
      const revealed = series.filter((candle) => candle.timestamp <= currentTime);
      cursorRef.current = revealed.length;
      lastRef.current = revealed[revealed.length - 1] ?? null;
      setInitialCandles(revealed);
      setNewCandles([]);
      return;
    }
    const delta: Candle[] = [];
    while (cursorRef.current < series.length) {
      const candle = series[cursorRef.current]!;
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
