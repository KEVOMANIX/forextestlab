/**
 * The chart-workspace layout catalogue.
 *
 * A layout is a rectangular matrix of pane indexes. Cell 0 appearing twice in a
 * row means that pane spans two columns; appearing in two rows means it spans
 * both. Everything else — the CSS grid template, the picker's preview glyph and
 * each pane's placement — is derived from that one matrix, so a layout cannot
 * render differently from the icon that offers it.
 *
 * Ids of the five original layouts are preserved: they are what a returning
 * workspace has in local storage.
 */

export interface ChartLayout {
  id: string;
  /**
   * Accessible name, also the picker's tooltip.
   *
   * No label may contain another as a substring. Tests and any future keyboard
   * search match these by pattern, so "Four charts over one" would make "Four
   * charts" ambiguous. {@link ./layouts.test.ts} enforces it.
   */
  label: string;
  /** Rows of pane indexes. Every index must cover a contiguous rectangle. */
  grid: number[][];
}

/** CSS grid-area name for a pane index. */
export function paneArea(index: number): string {
  return `p${index}`;
}

/** `grid-template-areas` value for a layout. */
export function layoutAreas(layout: ChartLayout): string {
  return layout.grid.map((row) => `"${row.map(paneArea).join(" ")}"`).join(" ");
}

export function layoutColumns(layout: ChartLayout): number {
  return layout.grid[0]?.length ?? 1;
}

export function layoutRows(layout: ChartLayout): number {
  return layout.grid.length;
}

/** How many panes a layout shows. */
export function layoutPanes(layout: ChartLayout): number {
  let highest = -1;
  for (const row of layout.grid) for (const index of row) highest = Math.max(highest, index);
  return highest + 1;
}

/** `[[0],[1],…]` — one pane per row. */
function rows(count: number): number[][] {
  return Array.from({ length: count }, (_, index) => [index]);
}

/** `[[0,1,…]]` — one pane per column. */
function columns(count: number): number[][] {
  return [Array.from({ length: count }, (_, index) => index)];
}

/** A balanced grid, filled left to right then top to bottom. */
function balanced(cols: number, rowCount: number): number[][] {
  return Array.from({ length: rowCount }, (_, row) =>
    Array.from({ length: cols }, (_, col) => row * cols + col),
  );
}

/** One full-height pane on the left, the rest stacked beside it. */
function leftFeature(rest: number): number[][] {
  return Array.from({ length: rest }, (_, index) => [0, index + 1]);
}

/** One full-width pane on top, the rest side by side beneath it. */
function topFeature(rest: number): number[][] {
  return [Array.from({ length: rest }, () => 0), Array.from({ length: rest }, (_, index) => index + 1)];
}

const ORDINALS = [
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
] as const;

function ordinal(count: number): string {
  return ORDINALS[count - 1] ?? String(count);
}

export const CHART_LAYOUTS: ChartLayout[] = [
  { id: "1", label: "Single chart", grid: [[0]] },

  { id: "2h", label: "Two columns", grid: columns(2) },
  { id: "2v", label: "Two rows", grid: rows(2) },

  { id: "3", label: "Main chart with two side charts", grid: leftFeature(2) },
  { id: "3-right", label: "Main pane right of two", grid: [[0, 2], [1, 2]] },
  { id: "3-top", label: "One over two", grid: topFeature(2) },
  { id: "3-bottom", label: "Two over one", grid: [[0, 1], [2, 2]] },
  { id: "3h", label: "Three columns", grid: columns(3) },
  { id: "3v", label: "Three rows", grid: rows(3) },

  { id: "4", label: "Four charts", grid: balanced(2, 2) },
  { id: "4-left", label: "Main chart with three side charts", grid: leftFeature(3) },
  { id: "4-right", label: "Main pane right of three", grid: [[0, 3], [1, 3], [2, 3]] },
  { id: "4-top", label: "One over three", grid: topFeature(3) },
  { id: "4-bottom", label: "Three over one", grid: [[0, 1, 2], [3, 3, 3]] },
  { id: "4-stack", label: "One, two, one", grid: [[0, 0], [1, 2], [3, 3]] },
  { id: "4h", label: "Four columns", grid: columns(4) },
  { id: "4v", label: "Four rows", grid: rows(4) },

  { id: "5-top", label: "One over four", grid: topFeature(4) },
  { id: "5-bottom", label: "Four over one", grid: [[0, 1, 2, 3], [4, 4, 4, 4]] },
  { id: "5-left", label: "Main chart with four side charts", grid: leftFeature(4) },
  { id: "5-rows", label: "Two over three", grid: [[0, 0, 0, 1, 1, 1], [2, 2, 3, 3, 4, 4]] },
  { id: "5-columns", label: "Three over two", grid: [[0, 0, 1, 1, 2, 2], [3, 3, 3, 4, 4, 4]] },
  { id: "5h", label: "Five columns", grid: columns(5) },
  { id: "5v", label: "Five rows", grid: rows(5) },

  { id: "6", label: "Six panes, 3 by 2", grid: balanced(3, 2) },
  { id: "6-tall", label: "Six panes, 2 by 3", grid: balanced(2, 3) },
  { id: "6-left", label: "Main chart with five side charts", grid: leftFeature(5) },
  { id: "6-top", label: "One over five", grid: topFeature(5) },
  { id: "6h", label: "Six columns", grid: columns(6) },

  { id: "7", label: "Seven panes, wide top row", grid: [[0, 0, 1, 1, 2, 2], [3, 3, 3, 4, 4, 4], [5, 5, 5, 6, 6, 6]] },
  { id: "7-left", label: "Main chart with six side charts", grid: [[0, 0, 1], [0, 0, 2], [3, 4, 5], [3, 4, 6]] },
  { id: "7-top", label: "One over six", grid: [[0, 0, 0], [1, 2, 3], [4, 5, 6]] },
  { id: "7v", label: "Seven rows", grid: rows(7) },

  { id: "8", label: "Eight panes, 4 by 2", grid: balanced(4, 2) },
  { id: "8-tall", label: "Eight panes, 2 by 4", grid: balanced(2, 4) },
  { id: "8-top", label: "One over seven", grid: [[0, 0, 0, 0, 0, 0], [1, 1, 2, 2, 3, 3], [4, 4, 5, 6, 7, 7]] },
  { id: "8-left", label: "Main chart with seven side charts", grid: [[0, 0, 1, 2], [0, 0, 3, 4], [5, 6, 7, 7]] },

  { id: "9", label: "Nine panes, 3 by 3", grid: balanced(3, 3) },
  { id: "9-top", label: "One over eight", grid: [[0, 0, 0, 0], [1, 2, 3, 4], [5, 6, 7, 8]] },
  { id: "9-left", label: "Main chart with eight side charts", grid: [[0, 0, 1, 2], [0, 0, 3, 4], [5, 6, 7, 8]] },

  { id: "10", label: "Ten panes, 5 by 2", grid: balanced(5, 2) },
  { id: "10-top", label: "Two over eight", grid: [[0, 0, 0, 0, 1, 1, 1, 1], [2, 2, 3, 3, 4, 4, 5, 5], [6, 6, 7, 7, 8, 8, 9, 9]] },
  { id: "10-left", label: "Main chart with nine side charts", grid: [[0, 0, 0, 1, 2, 3], [0, 0, 0, 4, 5, 6], [7, 7, 8, 8, 9, 9]] },
];

/** Layouts grouped by pane count, in catalogue order. */
export function layoutsByPaneCount(): { panes: number; label: string; layouts: ChartLayout[] }[] {
  const groups = new Map<number, ChartLayout[]>();
  for (const layout of CHART_LAYOUTS) {
    const panes = layoutPanes(layout);
    const existing = groups.get(panes);
    if (existing) existing.push(layout);
    else groups.set(panes, [layout]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([panes, layouts]) => ({
      panes,
      // "panes", not "charts": "Four charts" is a layout's own name, and a
      // heading that reads identically makes a by-text lookup ambiguous.
      label: `${ordinal(panes)} pane${panes === 1 ? "" : "s"}`,
      layouts,
    }));
}

export function layoutById(id: string): ChartLayout | null {
  return CHART_LAYOUTS.find((layout) => layout.id === id) ?? null;
}

export const DEFAULT_LAYOUT = CHART_LAYOUTS[0]!;
