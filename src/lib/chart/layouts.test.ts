import { describe, expect, it } from "vitest";

import {
  CHART_LAYOUTS,
  layoutAreas,
  layoutById,
  layoutColumns,
  layoutPanes,
  layoutRows,
  layoutsByPaneCount,
} from "./layouts";

/**
 * Every layout is a matrix of pane indexes that the CSS grid, the picker glyph
 * and each pane's placement are all derived from. A matrix that is ragged, skips
 * an index or spells an L-shape would render as a silently broken workspace, so
 * the catalogue is validated rather than trusted.
 */

describe("the chart layout catalogue", () => {
  it("uses a unique id and label for every layout", () => {
    const ids = CHART_LAYOUTS.map((layout) => layout.id);
    const labels = CHART_LAYOUTS.map((layout) => layout.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps every label unambiguous as a search pattern", () => {
    // "Four charts over one" would make a search for "Four charts" match two
    // buttons, which is how the picker's own tests select a layout.
    for (const outer of CHART_LAYOUTS) {
      for (const inner of CHART_LAYOUTS) {
        if (outer.id === inner.id) continue;
        expect(
          outer.label.toLowerCase().includes(inner.label.toLowerCase()),
          `"${outer.label}" contains "${inner.label}"`,
        ).toBe(false);
      }
    }
  });

  it("never names a group exactly as one of its layouts", () => {
    // The headings are text, not buttons, so a shared prefix is harmless — but a
    // heading reading identically to a layout makes a by-text lookup ambiguous.
    const headings = new Set(layoutsByPaneCount().map((group) => group.label.toLowerCase()));
    for (const layout of CHART_LAYOUTS) {
      expect(headings.has(layout.label.toLowerCase()), layout.label).toBe(false);
    }
  });

  it("keeps the ids a saved workspace may already hold", () => {
    for (const id of ["1", "2h", "2v", "3", "4"]) {
      expect(layoutById(id)).not.toBeNull();
    }
    expect(layoutById("1")!.label).toBe("Single chart");
    expect(layoutById("2h")!.label).toBe("Two columns");
    expect(layoutById("2v")!.label).toBe("Two rows");
    expect(layoutById("4")!.label).toBe("Four charts");
  });

  it("rejects nothing it offers: each grid is rectangular", () => {
    for (const layout of CHART_LAYOUTS) {
      const width = layoutColumns(layout);
      expect(layout.grid.length, layout.id).toBeGreaterThan(0);
      for (const row of layout.grid) expect(row.length, layout.id).toBe(width);
    }
  });

  it("uses every index from 0 up to the pane count", () => {
    for (const layout of CHART_LAYOUTS) {
      const seen = new Set(layout.grid.flat());
      const panes = layoutPanes(layout);
      expect(seen.size, layout.id).toBe(panes);
      for (let index = 0; index < panes; index += 1) {
        expect(seen.has(index), `${layout.id} is missing pane ${index}`).toBe(true);
      }
    }
  });

  it("gives every pane a solid rectangle, never an L or a split", () => {
    for (const layout of CHART_LAYOUTS) {
      for (let index = 0; index < layoutPanes(layout); index += 1) {
        let top = Infinity;
        let bottom = -Infinity;
        let left = Infinity;
        let right = -Infinity;
        let count = 0;
        layout.grid.forEach((row, y) => {
          row.forEach((cell, x) => {
            if (cell !== index) return;
            count += 1;
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            left = Math.min(left, x);
            right = Math.max(right, x);
          });
        });
        const area = (bottom - top + 1) * (right - left + 1);
        // A rectangle's cell count equals its bounding box's area; an L-shape's
        // is smaller, and CSS grid would refuse the template outright.
        expect(count, `${layout.id} pane ${index} is not a rectangle`).toBe(area);
      }
    }
  });

  it("offers a run of pane counts with no gaps, up to ten", () => {
    const counts = layoutsByPaneCount().map((group) => group.panes);
    expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("names groups in words", () => {
    const groups = layoutsByPaneCount();
    expect(groups[0]!.label).toBe("One pane");
    expect(groups[1]!.label).toBe("Two panes");
    expect(groups.at(-1)!.label).toBe("Ten panes");
  });

  it("builds a grid template naming one area per pane", () => {
    const feature = layoutById("3")!;
    expect(layoutColumns(feature)).toBe(2);
    expect(layoutRows(feature)).toBe(2);
    expect(layoutAreas(feature)).toBe('"p0 p1" "p0 p2"');
    expect(layoutAreas(layoutById("1")!)).toBe('"p0"');
  });
});
