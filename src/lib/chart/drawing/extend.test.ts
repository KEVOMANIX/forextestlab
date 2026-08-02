import { describe, expect, it } from "vitest";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";

import { CoordinateMapper } from "./coords";
import { createObject } from "./objects";
import { defaultStyle, EXTENDABLE_TOOLS, type DrawingJSON, type Point, type ToolKind } from "./types";

/**
 * Extend left / Extend right used to be offered on every tool while only rays
 * and fibs honoured it, so the checkbox did nothing on a trend line, a channel
 * or a regression band. Hit testing runs through the same geometry as painting,
 * so grabbing a line where it is drawn is the cheapest way to assert what got
 * drawn.
 */

/** One pixel per unit of time, one per unit of price, in a 400x300 pane. */
function mapper(): CoordinateMapper {
  const timeScale = {
    timeToCoordinate: (time: number) => time,
    logicalToCoordinate: (logical: number) => logical,
    coordinateToTime: (x: number) => x,
    coordinateToLogical: (x: number) => x,
  };
  const chart = { timeScale: () => timeScale } as unknown as IChartApi;
  const series = {
    priceToCoordinate: (price: number) => price,
    coordinateToPrice: (coordinate: number) => coordinate,
  } as unknown as ISeriesApi<SeriesType>;
  const m = new CoordinateMapper(chart, series);
  m.width = 400;
  m.height = 300;
  return m;
}

function drawing(kind: ToolKind, points: Point[], extend: Partial<DrawingJSON["style"]> = {}) {
  return createObject({
    id: `${kind}-test`,
    kind,
    points,
    style: { ...defaultStyle(kind), ...extend },
    locked: false,
    hidden: false,
    zIndex: 1,
    visibleTimeframes: null,
  });
}

/** A flat two-point line from x=100 to x=200 at y=150. */
const FLAT: Point[] = [
  { time: 100, price: 150 },
  { time: 200, price: 150 },
];

describe("extend left / extend right", () => {
  it("leaves a plain trend line bounded by its anchors", () => {
    const m = mapper();
    const line = drawing("trend", FLAT);
    expect(line.hitTest(150, 150, m)).toBe(true);
    expect(line.hitTest(340, 150, m)).toBe(false);
    expect(line.hitTest(20, 150, m)).toBe(false);
  });

  it("runs a trend line to the right edge when extended right", () => {
    const m = mapper();
    const line = drawing("trend", FLAT, { extendRight: true });
    expect(line.hitTest(340, 150, m)).toBe(true);
    expect(line.hitTest(20, 150, m)).toBe(false);
  });

  it("runs a trend line to the left edge when extended left", () => {
    const m = mapper();
    const line = drawing("trend", FLAT, { extendLeft: true });
    expect(line.hitTest(20, 150, m)).toBe(true);
    expect(line.hitTest(340, 150, m)).toBe(false);
  });

  it("starts a ray extended forward and lets the setting turn that off", () => {
    const m = mapper();
    expect(drawing("ray", FLAT).hitTest(340, 150, m)).toBe(true);
    // Previously forced on at paint time, so unchecking it changed nothing.
    expect(drawing("ray", FLAT, { extendRight: false }).hitTest(340, 150, m)).toBe(false);
  });

  it("starts an extended line reaching both edges, and respects unchecking", () => {
    const m = mapper();
    const both = drawing("extended", FLAT);
    expect(both.hitTest(20, 150, m)).toBe(true);
    expect(both.hitTest(340, 150, m)).toBe(true);
    const trimmed = drawing("extended", FLAT, { extendLeft: false, extendRight: false });
    expect(trimmed.hitTest(20, 150, m)).toBe(false);
    expect(trimmed.hitTest(340, 150, m)).toBe(false);
  });

  it("extends an arrow, a channel and a flat channel", () => {
    const m = mapper();
    expect(drawing("arrow", FLAT, { extendRight: true }).hitTest(340, 150, m)).toBe(true);

    // A channel's third point offsets the parallel edge; both edges extend.
    const channelPoints: Point[] = [...FLAT, { time: 100, price: 200 }];
    const channel = drawing("channel", channelPoints, { extendRight: true });
    expect(channel.hitTest(340, 150, m)).toBe(true);
    expect(channel.hitTest(340, 200, m)).toBe(true);
    expect(drawing("channel", channelPoints).hitTest(340, 150, m)).toBe(false);

    const flat = drawing("flatChannel", channelPoints, { extendRight: true });
    expect(flat.hitTest(340, 150, m)).toBe(true);
    expect(drawing("flatChannel", channelPoints).hitTest(340, 150, m)).toBe(false);
  });

  it("extends a disjoint channel's two independent edges", () => {
    const m = mapper();
    const points: Point[] = [
      { time: 100, price: 150 },
      { time: 200, price: 150 },
      { time: 100, price: 210 },
      { time: 200, price: 210 },
    ];
    const extended = drawing("disjointChannel", points, { extendRight: true });
    expect(extended.hitTest(340, 150, m)).toBe(true);
    expect(extended.hitTest(340, 210, m)).toBe(true);
    expect(drawing("disjointChannel", points).hitTest(340, 150, m)).toBe(false);
  });

  it("makes an extended fib level grabbable along its whole run", () => {
    const m = mapper();
    // Level 0 sits on the first anchor's price, which is inside the pane.
    const points: Point[] = [
      { time: 100, price: 150 },
      { time: 200, price: 100 },
    ];
    expect(drawing("fib", points).hitTest(340, 150, m)).toBe(false);
    expect(drawing("fib", points, { extendRight: true }).hitTest(340, 150, m)).toBe(true);
  });

  it("only claims support for tools that actually honour it", () => {
    // A tool in the set must change shape when extended; the assertions above
    // cover the line family, and this guards the ones that cannot.
    for (const kind of ["horizontal", "rectangle", "text", "long", "priceRange"] as ToolKind[]) {
      expect(EXTENDABLE_TOOLS.has(kind)).toBe(false);
    }
    for (const kind of ["trend", "ray", "extended", "channel", "regression"] as ToolKind[]) {
      expect(EXTENDABLE_TOOLS.has(kind)).toBe(true);
    }
  });
});
