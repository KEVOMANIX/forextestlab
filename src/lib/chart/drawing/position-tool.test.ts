import { describe, expect, it } from "vitest";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";

import { CoordinateMapper } from "./coords";
import { createObject } from "./objects";
import { defaultStyle, type DrawingJSON } from "./types";

/**
 * The long/short position tool's three points are an entry, a stop and a
 * target. Each is a level in its own right, so moving one must not move
 * the others — a stop drag that shifts the entry silently rewrites the risk the
 * position was drawn to express.
 */

/** Price maps 1:1 to y (inverted), time 1:1 to x, so pixels read as numbers. */
function mapper(): CoordinateMapper {
  const chart = {
    timeScale: () => ({
      timeToCoordinate: (time: number) => time,
      logicalToCoordinate: (logical: number) => logical,
      coordinateToTime: (x: number) => x,
      coordinateToLogical: (x: number) => x,
    }),
  } as unknown as IChartApi;
  const series = {
    priceToCoordinate: (price: number) => 1000 - price * 1000,
    coordinateToPrice: (coordinate: number) => (1000 - coordinate) / 1000,
  } as unknown as ISeriesApi<SeriesType>;
  return new CoordinateMapper(chart, series);
}

/** Entry 1.1000 spanning time 100→300, stop 1.0900, target 1.1200. */
function position(): DrawingJSON {
  return {
    id: "pos-1",
    kind: "long",
    points: [
      { time: 100, price: 1.1 },
      { time: 100, price: 1.09 },
      { time: 300, price: 1.12 },
    ],
    style: defaultStyle("long"),
    locked: false,
    hidden: false,
    zIndex: 1,
    visibleTimeframes: null,
  };
}

describe("position tool anchors", () => {
  it("grips both ends of every level, plus the entry's middle", () => {
    const object = createObject(position());
    const anchors = object.anchors(mapper());

    // Ends rather than centres: a centred handle sits under the level's own
    // chip, which then takes the pointer instead of the handle.
    expect(anchors).toEqual([
      { x: 100, y: 1000 - 1100, index: 0 },
      { x: 300, y: 1000 - 1100, index: 3 },
      { x: 200, y: 1000 - 1100, index: 6 },
      { x: 100, y: 1000 - 1090, index: 4 },
      { x: 300, y: 1000 - 1090, index: 1 },
      { x: 100, y: 1000 - 1120, index: 5 },
      { x: 300, y: 1000 - 1120, index: 2 },
    ]);
  });
});

describe("position tool level dragging", () => {
  it("moves only the stop when the stop handle is dragged", () => {
    const object = createObject(position());
    object.setAnchor(1, { time: 250, price: 1.085 });

    expect(object.points[1]).toEqual({ time: 100, price: 1.085 });
    // The entry and target are untouched — the whole point of the fix.
    expect(object.points[0]).toEqual({ time: 100, price: 1.1 });
    expect(object.points[2]).toEqual({ time: 300, price: 1.12 });
  });

  it("moves only the target, and the box edge it owns, when the target is dragged", () => {
    const object = createObject(position());
    object.setAnchor(2, { time: 400, price: 1.13 });

    expect(object.points[2]).toEqual({ time: 400, price: 1.13 });
    expect(object.points[0]).toEqual({ time: 100, price: 1.1 });
    expect(object.points[1]).toEqual({ time: 100, price: 1.09 });
  });

  it("moves only the entry when the entry is dragged", () => {
    const object = createObject(position());
    object.setAnchor(0, { time: 150, price: 1.105 });

    expect(object.points[0]).toEqual({ time: 150, price: 1.105 });
    expect(object.points[1]).toEqual({ time: 100, price: 1.09 });
    expect(object.points[2]).toEqual({ time: 300, price: 1.12 });
  });

  it("moves the stop from either end, and never its time", () => {
    for (const handle of [1, 4]) {
      const object = createObject(position());
      object.setAnchor(handle, { time: 250, price: 1.085 });
      expect(object.points[1]).toEqual({ time: 100, price: 1.085 });
      expect(object.points[0]).toEqual({ time: 100, price: 1.1 });
      expect(object.points[2]).toEqual({ time: 300, price: 1.12 });
    }
  });

  /**
   * Only the entry and the target own a box edge — the left and the right. An
   * extra grip that also wrote a time would set one edge to the other's
   * position and turn the box inside out, so the grips move price alone.
   */
  it("keeps the box intact when an extra grip is dragged sideways", () => {
    const object = createObject(position());
    object.setAnchor(3, { time: 999, price: 1.101 });
    expect(object.points[0]).toEqual({ time: 100, price: 1.101 });

    object.setAnchor(5, { time: 999, price: 1.125 });
    expect(object.points[2]).toEqual({ time: 300, price: 1.125 });

    object.setAnchor(6, { time: 999, price: 1.102 });
    expect(object.points[0]).toEqual({ time: 100, price: 1.102 });
  });

  it("still translates every level together when the body is moved", () => {
    const object = createObject(position());
    object.translate(50, 0.01);

    expect(object.points.map((point) => point.time)).toEqual([150, 150, 350]);
    expect(object.points.map((point) => Number(point.price.toFixed(4)))).toEqual([
      1.11, 1.1, 1.13,
    ]);
  });
});
