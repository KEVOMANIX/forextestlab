import type { DrawingJSON } from "@/lib/chart/drawing/types";
import type { IndicatorInstance } from "@/lib/chart/indicator-defs";
import type { PineChartIndicator } from "@/lib/chart/pine-scripts";

/** What a pane sends when it copies its studies and drawings to the rest of the layout. */
export type LayoutSyncPayload = {
  indicators: IndicatorInstance[];
  /** The pane's Pine scripts (TradingView-style custom indicators). */
  pineIndicators?: PineChartIndicator[];
  /** Omitted when the pane's drawing layer is not ready, so nothing is overwritten with an empty list. */
  drawings?: DrawingJSON[];
  /** An explicit edit (remove the last study) may clear the other panes; a copy never does. */
  allowEmpty?: boolean;
};

type Cell = { id: string; symbol: string };
type SavedView = { indicators?: unknown; pineIndicators?: unknown };

/** One pane's new studies (and, for the source's pair, drawings) after a layout copy. */
export type LayoutSyncTarget = {
  cellId: string;
  symbol: string;
  indicators: IndicatorInstance[];
  pineIndicators: PineChartIndicator[];
  /** Only panes on the source's pair: drawings are anchored to its prices. */
  drawings?: DrawingJSON[];
};

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

function cloneIndicator(indicator: IndicatorInstance): IndicatorInstance {
  return {
    ...indicator,
    inputs: { ...indicator.inputs },
    style: Object.fromEntries(Object.entries(indicator.style ?? {}).map(([key, value]) => [key, { ...value }])),
  };
}

const clonePine = (item: PineChartIndicator): PineChartIndicator => JSON.parse(JSON.stringify(item)) as PineChartIndicator;

/**
 * Works out what each other pane receives when `source` copies to the layout.
 *
 * - Built-in studies and Pine scripts go to every pane, whatever its pair.
 * - Drawings go only to panes showing the source's pair. A trend line at
 *   EUR/USD 1.08 means nothing on a USD/JPY chart, and copying it there used
 *   to replace (erase) that pair's own drawings with invisible ones.
 * - A copy made while the source's studies are still loading falls back to
 *   what the source saved, so a momentary empty list never clears the others.
 * - Market Sessions is workspace-wide: a source without it keeps each pane's own.
 */
export function planLayoutSync(source: Cell, cells: Cell[], payload: LayoutSyncPayload, savedView: (cell: Cell) => SavedView): { indicators: IndicatorInstance[]; pineIndicators: PineChartIndicator[] | null; targets: LayoutSyncTarget[] } {
  const saved = savedView(source);
  const indicators = (payload.indicators.length > 0 || payload.allowEmpty ? payload.indicators : list<IndicatorInstance>(saved.indicators)).map(cloneIndicator);
  // null: this payload carried no Pine information, so every pane keeps its own scripts.
  const pineSource = payload.pineIndicators === undefined
    ? null
    : payload.pineIndicators.length > 0 || payload.allowEmpty ? payload.pineIndicators : list<PineChartIndicator>(saved.pineIndicators);
  const pineIndicators = pineSource ? pineSource.map(clonePine) : null;
  const sourceHasSessions = indicators.some((indicator) => indicator.kind === "sessions");

  const targets = cells.filter((cell) => cell.id !== source.id).map((cell): LayoutSyncTarget => {
    const existing = savedView(cell);
    const existingIndicators = list<IndicatorInstance>(existing.indicators);
    const nextIndicators = indicators.length === 0 && !payload.allowEmpty
      ? existingIndicators
      : sourceHasSessions
        ? indicators.map(cloneIndicator)
        : [...indicators.map(cloneIndicator), ...existingIndicators.filter((indicator) => indicator.kind === "sessions")];
    return {
      cellId: cell.id,
      symbol: cell.symbol,
      indicators: nextIndicators,
      pineIndicators: pineIndicators ? pineIndicators.map(clonePine) : list<PineChartIndicator>(existing.pineIndicators),
      drawings: cell.symbol === source.symbol && payload.drawings ? payload.drawings : undefined,
    };
  });
  return { indicators, pineIndicators, targets };
}
