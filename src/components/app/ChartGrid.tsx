"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { PairChartData } from "@/lib/backtest/client";
import type { TradePlan } from "@/lib/backtest/trade-plan";
import type { OpenPosition, OrderType, PendingOrder, PublicSessionState } from "@/lib/backtest/types";
import type { Candle, Timeframe } from "@/lib/market-data/types";
import type { DrawingJSON } from "@/lib/chart/drawing/types";
import type { IndicatorInstance } from "@/lib/chart/indicator-defs";

import { useCompactViewport } from "@/lib/ui/use-media-query";
import {
  DEFAULT_LAYOUT,
  layoutAreas,
  layoutById,
  layoutColumns,
  layoutPanes,
  layoutRows,
  layoutsByPaneCount,
  paneArea,
  type ChartLayout,
} from "@/lib/chart/layouts";
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

/** A layout id from {@link CHART_LAYOUTS}. */
export type GridLayout = string;

export interface ChartCell {
  id: string;
  symbol: string;
  /** Null until the user picks one; the cell then falls back to the session timeframe. */
  timeframe: Timeframe | null;
}

function layoutSpec(layout: GridLayout): ChartLayout {
  return layoutById(layout) ?? DEFAULT_LAYOUT;
}

/**
 * Miniature of a layout, drawn from the same matrix the workspace itself uses so
 * the icon can never advertise an arrangement the grid does not build.
 *
 * The panes are drawn in the inherited text colour and the 1px gaps let the
 * button behind show through as dividers, so the glyph carries the same contrast
 * as a label would in either theme. Drawn faintly it read as an empty dark box
 * on a dark panel.
 */
function LayoutGlyph({ layout }: { layout: ChartLayout }) {
  return (
    <span
      data-testid="layout-glyph"
      aria-hidden
      className="grid h-[18px] w-[18px] shrink-0 gap-[1px] rounded-[2px] border border-current p-[1px]"
      style={{
        gridTemplateAreas: layoutAreas(layout),
        gridTemplateColumns: `repeat(${layoutColumns(layout)}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${layoutRows(layout)}, minmax(0, 1fr))`,
      }}
    >
      {Array.from({ length: layoutPanes(layout) }, (_, index) => (
        <span
          key={index}
          data-testid="layout-glyph-pane"
          className="bg-current opacity-80"
          style={{ gridArea: paneArea(index) }}
        />
      ))}
    </span>
  );
}

interface StoredLayout {
  layout: GridLayout;
  cells: ChartCell[];
  focusedId: string;
}

interface LayoutSyncSnapshot {
  revision: number;
  sourceId: string;
  indicators: IndicatorInstance[];
}

/**
 * Seed a new cell's view state from the cell it was cloned from, unless it
 * already has its own from an earlier visit to this layout.
 */
function cloneCellView(
  storageKey: string,
  symbol: string,
  fromCellId: string,
  toCellId: string,
) {
  try {
    const target = `forextestlab:chart:${storageKey}:${toCellId}:${symbol}`;
    if (window.localStorage.getItem(target)) return;
    const source = window.localStorage.getItem(
      `forextestlab:chart:${storageKey}:${fromCellId}:${symbol}`,
    );
    if (source) {
      // A new pane inherits the instrument/timeframe presentation, not the
      // source pane's pan/zoom. Every newly opened layout starts at the latest
      // candles so it is immediately useful instead of opening on a stale
      // historical window.
      const view = JSON.parse(source) as Record<string, unknown>;
      delete view.range;
      delete view.timeRange;
      window.localStorage.setItem(target, JSON.stringify(view));
    }
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
  /** Fires once every initially visible pane has painted its chart canvas. */
  onReady?: () => void;
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
  /** Start an order from a price picked off a chart's right-click menu. */
  onPlanAtPrice?: (
    direction: "long" | "short",
    entryPrice: string,
    orderType: OrderType,
  ) => void;
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
  /** A "Go to"/calendar jump is fast-forwarding the session's own replay. */
  jumping?: boolean;
  /** Human-readable destination selected in the Go To panel. */
  jumpLabel?: string | null;
  error?: string | null;
  storageKey: string;
  headerSlot?: HTMLElement | null;
  /** Dedicated far-right header target for the layout picker. */
  layoutSlot?: HTMLElement | null;
  /** Right-hand header target for chart actions, such as the screenshot. */
  actionsSlot?: HTMLElement | null;
  /** Full quote strip for the focused chart. */
  orderTicket?: React.ReactNode;
  /** Smaller quote strip repeated in the other visible layout panes. */
  compactOrderTicket?: React.ReactNode;
  /** Clock and time-zone picker, seated in the workspace's outer axis corner. */
  axisCorner?: React.ReactNode;
  /** Focused cell's symbol, so the top bar's pair picker stays in step. */
  focusedSymbol: string;
  onFocusedSymbolChange: (symbol: string) => void;
  /** Preferences every chart in the workspace shares. */
  workspace: ChartWorkspace;
  /** Opens the session's symbol picker for the focused cell. */
  onOpenSymbolPicker: () => void;
  /** Keeps replay stepping aligned with the focused chart's displayed bars. */
  onFocusedTimeframeChange: (timeframe: Timeframe) => void;
  /** Opens the app's single settings dialog from a cell's right-click menu. */
  onOpenSettings: () => void;
}

export default function ChartGrid({
  onReady,
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
  onPlanAtPrice,
  onTradePlanChange,
  theme,
  onStopLossChange,
  onTakeProfitChange,
  onLoadHistory,
  loading = false,
  jumping = false,
  jumpLabel = null,
  error = null,
  storageKey,
  headerSlot = null,
  layoutSlot = null,
  actionsSlot = null,
  orderTicket = null,
  compactOrderTicket = null,
  axisCorner = null,
  focusedSymbol,
  onFocusedSymbolChange,
  workspace,
  onOpenSymbolPicker,
  onFocusedTimeframeChange,
  onOpenSettings,
}: ChartGridProps) {
  const sessionSymbol = state.config.symbol;
  const sessionSymbolsKey = (state.config.symbols ?? [sessionSymbol]).join(",");
  const compact = useCompactViewport();
  const [layout, setLayout] = useState<GridLayout>("1");
  const [cells, setCells] = useState<ChartCell[]>([
    { id: "cell-1", symbol: sessionSymbol, timeframe: null },
  ]);
  const [focusedId, setFocusedId] = useState("cell-1");
  const [restored, setRestored] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [readyCells, setReadyCells] = useState<Set<string>>(new Set());
  const [layoutSync, setLayoutSync] = useState<LayoutSyncSnapshot | null>(null);

  useEffect(() => {
    const saved = readStoredLayout(storageKey);
    if (saved) {
      const allowedSymbols = new Set(
        sessionSymbolsKey ? sessionSymbolsKey.split(",") : [sessionSymbol],
      );
      // Layout preferences can outlive a session in localStorage (and older
      // versions used broader keys). Never let a stale cell symbol leak into a
      // new session: the session's primary pair is a safe fallback.
      const cellsForSession = saved.cells.map((cell) =>
        allowedSymbols.has(cell.symbol)
          ? cell
          : { ...cell, symbol: sessionSymbol },
      );
      setLayout(saved.layout);
      setCells(cellsForSession);
      setFocusedId(
        cellsForSession.some((cell) => cell.id === saved.focusedId)
          ? saved.focusedId
          : cellsForSession[0]!.id,
      );
    }
    setRestored(true);
  }, [sessionSymbol, sessionSymbolsKey, storageKey]);

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
    const count = layoutPanes(layoutSpec(layout));
    const next = cells.slice(0, count);
    // Growing the layout clones the focused cell, like TradingView: same
    // instrument, and the same view state (timeframe, chart type, indicators)
    // so the new pane opens as a copy of the chart you were just looking at.
    const template = cells.find((cell) => cell.id === focusedId) ?? cells[0];
    while (next.length < count) {
      const id = `cell-${next.length + 1}`;
      if (template) cloneCellView(storageKey, template.symbol, template.id, id);
      next.push({
        id,
        symbol: template?.symbol ?? sessionSymbol,
        timeframe: template?.timeframe ?? null,
      });
    }
    return next;
  }, [cells, layout, focusedId, sessionSymbol, storageKey]);
  const visibleIdentity = visibleCells.map((cell) => `${cell.id}:${cell.symbol}`).join("|");

  useEffect(() => setReadyCells(new Set()), [visibleIdentity]);
  useEffect(() => {
    if (!restored || !onReady) return;
    const allReady = visibleCells.every((cell) => readyCells.has(`${cell.id}:${cell.symbol}`));
    const allPairDataAvailable = visibleCells.every(
      (cell) => cell.symbol === sessionSymbol || Boolean(pairs[cell.symbol]),
    );
    if (allReady && allPairDataAvailable) onReady();
  }, [onReady, pairs, readyCells, restored, sessionSymbol, visibleCells]);

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

  const syncFocusedLayout = useCallback((snapshot: { indicators: IndicatorInstance[]; drawings: DrawingJSON[] }) => {
    const syncSource = `layout-sync-${Date.now()}`;
    const sourceViewKey = `forextestlab:chart:${storageKey}:${focused.id}:${focused.symbol}`;
    let savedSourceIndicators: IndicatorInstance[] = [];
    try {
      const savedSource = JSON.parse(window.localStorage.getItem(sourceViewKey) ?? "{}") as { indicators?: unknown };
      if (Array.isArray(savedSource.indicators)) savedSourceIndicators = savedSource.indicators as IndicatorInstance[];
    } catch {
      // The live snapshot remains the source if its saved counterpart is malformed.
    }
    // A chart can receive this action on the same render in which its saved
    // studies hydrate. Never let that short state-transition window broadcast
    // an empty list and erase the other panes.
    const sourceIndicators = snapshot.indicators.length > 0 ? snapshot.indicators : savedSourceIndicators;
    const nextIndicators = sourceIndicators.map((indicator) => ({
      ...indicator,
      inputs: { ...indicator.inputs },
      style: Object.fromEntries(Object.entries(indicator.style).map(([key, value]) => [key, { ...value }])),
    }));
    const nextDrawings = snapshot.drawings;

    // Hidden panes are included too: opening a wider layout later should show
    // the same studies and markings without requiring a second sync.
    for (const cell of cells) {
      if (cell.id === focused.id) continue;
      try {
        const viewKey = `forextestlab:chart:${storageKey}:${cell.id}:${cell.symbol}`;
        const existing = JSON.parse(window.localStorage.getItem(viewKey) ?? "{}") as Record<string, unknown>;
        const existingIndicators = Array.isArray(existing.indicators) ? existing.indicators as IndicatorInstance[] : [];
        const sourceIncludesSessions = nextIndicators.some((indicator) => indicator.kind === "sessions");
        // Sessions are a workspace-level overlay: copying another pane must
        // never remove one already enabled on this pane. When the source has
        // Sessions its exact configuration still replaces the local copy.
        const targetIndicators = nextIndicators.length === 0
          ? existingIndicators
          : sourceIncludesSessions
            ? nextIndicators
            : [...nextIndicators, ...existingIndicators.filter((indicator) => indicator.kind === "sessions")];
        window.localStorage.setItem(viewKey, JSON.stringify({ ...existing, indicators: targetIndicators }));

        const drawingKey = `forextestlab:drawings:${storageKey}:${cell.symbol}`;
        window.localStorage.setItem(drawingKey, JSON.stringify(nextDrawings));
        // Mounted drawing layers hear this immediately; the local-storage write
        // above ensures panes that mount later receive the same snapshot.
        window.dispatchEvent(new CustomEvent("forextestlab:drawings-change", {
          detail: { key: drawingKey, source: syncSource, drawings: nextDrawings },
        }));
      } catch {
        // A full or unavailable browser store should not block the visible panes.
      }
    }
    setLayoutSync((current) => ({
      revision: (current?.revision ?? 0) + 1,
      sourceId: focused.id,
      indicators: nextIndicators,
    }));
  }, [cells, focused.id, storageKey]);

  const updateCellTimeframe = useCallback(
    (id: string, timeframe: Timeframe) => {
      setCells((current) =>
        current.map((cell) =>
          cell.id === id && cell.timeframe !== timeframe
            ? { ...cell, timeframe }
            : cell,
        ),
      );
      if (id === focusedId) onFocusedTimeframeChange(timeframe);
    },
    [focusedId, onFocusedTimeframeChange],
  );

  useEffect(() => {
    onFocusedTimeframeChange(focused.timeframe ?? state.config.timeframe);
  }, [focused.id, focused.timeframe, onFocusedTimeframeChange, state.config.timeframe]);

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

  /**
   * The workspace's drawing rail column. One rail serves every pane: it is
   * always the full height of the grid, so no tool is ever pushed below the fold
   * by a short cell, and the focused pane portals its own rail into it so the
   * buttons act on the chart the trader is looking at.
   */
  const [railHost, setRailHost] = useState<HTMLDivElement | null>(null);

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
        <LayoutGlyph layout={spec} />
        <span>Layout</span>
      </button>
      {layoutMenuOpen && (
        /*
          Grouped by pane count and shown as glyphs, so choosing an arrangement is
          a matter of recognising its shape rather than reading forty labels. The
          name stays on each button for the screen reader and the tooltip.
        */
        <div
          data-testid="chart-layout-menu"
          className="absolute right-0 top-9 z-40 max-h-[min(30rem,80dvh)] w-[19rem] overflow-y-auto rounded-lg border app-border bg-[var(--app-panel-solid)] p-1 shadow-xl"
        >
          <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide app-muted">
            Chart layout
          </p>
          {layoutsByPaneCount().map((group) => (
            <div
              key={group.panes}
              className="flex items-start gap-2 border-t app-border px-1 py-1.5 first:border-t-0"
            >
              <span
                className={`w-4 shrink-0 pt-1 text-right text-[11px] font-semibold tabular-nums ${
                  layoutPanes(spec) === group.panes ? "text-brand-300" : "app-muted"
                }`}
                aria-hidden
              >
                {group.panes}
              </span>
              <span className="sr-only">{group.label}</span>
              <span className="flex flex-wrap gap-1">
                {group.layouts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.label}
                    aria-pressed={layout === item.id}
                    title={item.label}
                    onClick={() => {
                      setLayout(item.id);
                      setLayoutMenuOpen(false);
                    }}
                    className={`grid h-8 w-8 place-items-center rounded-md border transition-colors ${
                      layout === item.id
                        ? "border-brand-400/60 bg-brand-400/15 text-brand-300"
                        : "border-transparent app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"
                    }`}
                  >
                    <LayoutGlyph layout={item} />
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col" data-tour="chart-workspace">
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
      <div className="flex min-h-0 flex-1">
        <div ref={setRailHost} className="shrink-0" />
        <div className="relative flex min-h-0 min-w-0 flex-1">
        <div
          data-layout={spec.id}
          className={`grid min-h-0 min-w-0 flex-1 gap-px bg-[var(--app-border)] ${
            compact ? "auto-rows-[minmax(15rem,1fr)] grid-cols-1 overflow-y-auto" : ""
          }`}
          style={
            compact
              ? undefined
              : {
                  gridTemplateAreas: layoutAreas(spec),
                  gridTemplateColumns: `repeat(${layoutColumns(spec)}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${layoutRows(spec)}, minmax(0, 1fr))`,
                }
          }
        >
        {visibleCells.map((cell, index) => {
          const isSession = cell.symbol === sessionSymbol;
          const isFocused = cell.id === focused.id;
          const pair = isSession ? null : pairs[cell.symbol] ?? null;
          return (
            <div
              key={cell.id}
              data-testid={`chart-${cell.id}`}
              // The layout matrix places and sizes the pane; a stacked compact
              // viewport ignores the template and flows them instead.
              style={compact ? undefined : { gridArea: paneArea(index) }}
              className={`relative min-h-0 min-w-0 overflow-hidden bg-[var(--app-bg)] ${
                multi && isFocused ? "outline outline-1 -outline-offset-1 outline-brand-400/50" : ""
              }`}
            >
              <ChartCellView
                onReady={() => setReadyCells((current) => {
                  const key = `${cell.id}:${cell.symbol}`;
                  if (current.has(key)) return current;
                  const next = new Set(current);
                  next.add(key);
                  return next;
                })}
                cell={cell}
                state={state}
                isSession={isSession}
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
                onPlanAtPrice={onPlanAtPrice}
                onTradePlanChange={onTradePlanChange}
                theme={theme}
                onStopLossChange={onStopLossChange}
                onTakeProfitChange={onTakeProfitChange}
                onLoadHistory={onLoadHistory}
                loading={loading}
                jumping={jumping && isFocused}
                jumpLabel={jumpLabel}
                error={error}
                storageKey={storageKey}
                workspace={workspace}
                onOpenSettings={onOpenSettings}
                onFocus={() => focusCell(cell.id)}
                onTimeframeChange={(timeframe) =>
                  updateCellTimeframe(cell.id, timeframe)
                }
                headerSlot={isFocused ? headerSlot : null}
                actionsSlot={isFocused ? actionsSlot : null}
                showControls={isFocused}
                railSlot={railHost}
                showRail={isFocused}
                canSyncLayout={multi}
                onSyncToLayout={isFocused ? syncFocusedLayout : undefined}
                layoutSync={layoutSync && layoutSync.sourceId !== cell.id ? layoutSync : null}
                orderTicket={isFocused ? orderTicket : compactOrderTicket}
                // One clock for the workspace, always in its outer bottom-right
                // corner regardless of which independently movable cell is focused.
                axisCorner={
                  index === visibleCells.length - 1 ? axisCorner : null
                }
                onSelectInstrument={() => {
                  // Clicking a cell's symbol focuses that cell first, so the
                  // picker acts on the chart the trader just pointed at.
                  focusCell(cell.id);
                  onOpenSymbolPicker();
                }}
              />
            </div>
          );
        })}
        </div>
        </div>
      </div>
    </div>
  );
}

interface ChartCellViewProps {
  onReady: () => void;
  cell: ChartCell;
  state: PublicSessionState;
  isSession: boolean;
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
  /** Start an order from a price picked off a chart's right-click menu. */
  onPlanAtPrice?: (
    direction: "long" | "short",
    entryPrice: string,
    orderType: OrderType,
  ) => void;
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
  jumping: boolean;
  jumpLabel: string | null;
  error: string | null;
  storageKey: string;
  onFocus: () => void;
  onTimeframeChange: (timeframe: Timeframe) => void;
  headerSlot: HTMLElement | null;
  actionsSlot: HTMLElement | null;
  showControls: boolean;
  railSlot: HTMLElement | null;
  showRail: boolean;
  canSyncLayout: boolean;
  onSyncToLayout: ((snapshot: { indicators: IndicatorInstance[]; drawings: DrawingJSON[] }) => void) | undefined;
  layoutSync: LayoutSyncSnapshot | null;
  orderTicket: React.ReactNode;
  axisCorner: React.ReactNode;
  workspace: ChartWorkspace;
  onSelectInstrument: (() => void) | undefined;
  onOpenSettings: () => void;
}

function ChartCellView({
  onReady,
  cell,
  state,
  isSession,
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
  onPlanAtPrice,
  onTradePlanChange,
  theme,
  onStopLossChange,
  onTakeProfitChange,
  onLoadHistory,
  loading,
  jumping,
  jumpLabel,
  error,
  storageKey,
  onFocus,
  onTimeframeChange,
  headerSlot,
  actionsSlot,
  showControls,
  railSlot,
  showRail,
  canSyncLayout,
  onSyncToLayout,
  layoutSync,
  orderTicket,
  axisCorner,
  workspace,
  onSelectInstrument,
  onOpenSettings,
}: ChartCellViewProps) {
  const reveal = useRevealedSeries(isSession ? sessionSeries : pair?.candles ?? null, state.currentTime);
  const noop = useCallback(() => {}, []);
  const loadHistory = useCallback(
    (timeframe: Timeframe, before: number) => onLoadHistory(cell.symbol, timeframe, before),
    [onLoadHistory, cell.symbol],
  );

  const tradable = Boolean(isSession || pair);
  const cellPositions = positions.filter(
    (position) => (position.symbol ?? state.config.symbol) === cell.symbol,
  );
  const cellPendingOrders = pendingOrders.filter(
    (order) => (order.symbol ?? state.config.symbol) === cell.symbol,
  );
  const cellMarkers = markers.filter(
    (marker) => (marker.symbol ?? state.config.symbol) === cell.symbol,
  );
  const focusedPosition = cellPositions.find(
    (position) => position.id === activePositionId,
  );
  // The chart body is driven by the revealed-series cursor, so its live price
  // must come from that same cursor. Reading state.currentPrice directly makes
  // the line render one React pass before the candle delta reaches the chart.
  const currentPrice = reveal.lastCandle
    ? Number(reveal.lastCandle.close)
    : null;

  return (
      <PriceChart
        onReady={onReady}
        key={`${cell.id}-${cell.symbol}`}
        onFocus={onFocus}
        initialCandles={reveal.initialCandles}
        contextCandles={isSession ? sessionContextCandles : pair?.contextCandles ?? []}
        lastCandle={null}
        lastCandles={reveal.newCandles}
        replaySeries={isSession ? sessionSeries : pair?.candles}
        replaySessionId={state.sessionId}
        replayRunning={state.status === "running"}
        alignToReplayClockOnLoad={!isSession}
        markers={tradable ? cellMarkers : []}
        positions={tradable ? cellPositions : []}
        pendingOrders={tradable ? cellPendingOrders : []}
        onModifyPendingOrder={tradable ? onModifyPendingOrder : noop}
        onCancelPendingOrder={tradable ? onCancelPendingOrder : noop}
        activePositionId={focusedPosition?.id ?? null}
        onEditPosition={onEditPosition}
        stopLoss={tradable && showControls ? stopLoss : null}
        takeProfit={tradable && showControls ? takeProfit : null}
        positionDirection={tradable && showControls ? positionDirection : null}
        tradePlan={tradable && showControls ? tradePlan : null}
        onTradePlanChange={tradable && showControls ? onTradePlanChange : noop}
        currentPrice={currentPrice}
        baseTimeframe={state.config.timeframe}
        pipSize={Number(isSession ? state.config.pipSize : pair?.pipSize ?? state.config.pipSize)}
        precision={isSession ? state.config.pricePrecision : pair?.pricePrecision ?? state.config.pricePrecision}
        accountCurrency={state.config.accountCurrency}
        theme={theme}
        onStopLossChange={tradable && showControls ? onStopLossChange : noop}
        onTakeProfitChange={tradable && showControls ? onTakeProfitChange : noop}
        onLoadHistory={loadHistory}
        loading={isSession ? loading : pairLoading && !pair}
        jumping={jumping}
        jumpLabel={jumpLabel}
        error={isSession ? error : null}
        storageKey={`${storageKey}:${cell.symbol}`}
        viewKey={`${storageKey}:${cell.id}:${cell.symbol}`}
        initialTimeframe={cell.timeframe ?? undefined}
        onDisplayTimeframeChange={onTimeframeChange}
        headerSlot={headerSlot}
        actionsSlot={actionsSlot}
        showControls={showControls}
        railSlot={railSlot}
        showRail={showRail}
        canSyncLayout={canSyncLayout}
        onSyncToLayout={onSyncToLayout}
        layoutSync={layoutSync}
        orderTicket={orderTicket}
        axisCorner={axisCorner}
        symbolLabel={cell.symbol}
        referenceOnly={!tradable}
        onPlanAtPrice={tradable ? onPlanAtPrice : undefined}
        onSelectInstrument={onSelectInstrument}
        settings={workspace.settings}
        onSettingsChange={workspace.updateSettings}
        onSettingsReset={workspace.resetSettings}
        favorites={workspace.favorites}
        onToggleFavorite={workspace.toggleFavorite}
        onOpenSettings={onOpenSettings}
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
    // A downloaded chunk replaces the array identity but keeps the existing
    // prefix intact. Adopt that larger source without rebuilding the revealed
    // slice; rebuilding it made the chart clear and redraw for every chunk
    // fetched during a long Go To jump.
    const previousSource = sourceRef.current;
    if (previousSource === series) return;
    const isAppendOnlyExtension =
      previousSource !== null &&
      series.length >= previousSource.length &&
      (previousSource.length === 0 ||
        (series[0]?.timestamp === previousSource[0]?.timestamp &&
          series[previousSource.length - 1]?.timestamp ===
            previousSource[previousSource.length - 1]?.timestamp));
    sourceRef.current = series;
    if (isAppendOnlyExtension) return;
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
      // PriceChart receives the rewind through the replay visual bus and trims
      // its mounted series in place. Replacing initialCandles here would feed
      // the full history through its data-swap path and look like a chart reload.
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
