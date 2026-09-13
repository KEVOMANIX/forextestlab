import { describe, expect, it, vi } from "vitest";

import { DrawingEngine } from "./engine";
import { newDrawing } from "./objects";
import type { Point, ToolKind } from "./types";

type Pixel = { x: number; y: number };

// Exercise the engine's gesture logic without mounting canvases or a render loop.
function editing(kind: ToolKind = "trend", index = 1) {
  const drawing = newDrawing(kind, { time: 100, price: 100 }, 1, 2, "");
  drawing.points[1] = { time: 300, price: 112 };
  const engine = Object.create(DrawingEngine.prototype) as {
    updateDrag: (px: Pixel) => void;
    setShift: (held: boolean) => void;
    shiftHeld: boolean;
    lastMovePx: Pixel;
    drag: { id: string; kind: string; index: number; origin: Point[]; startPx: Pixel };
  };
  const snapPrice = vi.fn((p: Point) => ({ ...p, price: p.price + 5 }));
  Object.assign(engine, {
    objects: [drawing],
    create: null,
    shiftHeld: false,
    ctrlHeld: false,
    env: { magnet: "strong", candles: [] },
    mapper: {
      timeToX: (time: number) => time,
      priceToY: (price: number) => price,
      pixelToPoint: (x: number, y: number) => ({ time: x, price: y }),
      snapPrice,
    },
    drag: {
      id: drawing.id, kind: "anchor", index,
      origin: drawing.points.map((p) => ({ ...p })),
      startPx: { x: drawing.points[index]!.time, y: drawing.points[index]!.price },
    },
    lastMovePx: index === 1 ? { x: 300, y: 112 } : { x: 100, y: 100 },
  });
  return { engine, drawing, snapPrice };
}

describe("Shift while editing a selected line", () => {
  it("straightens repeatedly and restores the pointer on release without mouse movement", () => {
    const { engine, drawing, snapPrice } = editing();
    for (let attempt = 0; attempt < 3; attempt++) {
      engine.setShift(true);
      expect(drawing.points[1]!.price).toBeCloseTo(100);
      expect(drawing.points[0]).toEqual({ time: 100, price: 100 });
      expect(snapPrice).toHaveBeenCalledTimes(attempt);
      engine.setShift(false);
      expect(drawing.points[1]).toEqual({ time: 300, price: 117 });
    }
  });

  it("constrains either endpoint relative to the opposite endpoint", () => {
    const { engine, drawing } = editing("ray", 0);
    engine.setShift(true);
    expect(drawing.points[0]!.price).toBeCloseTo(112);
    expect(drawing.points[1]).toEqual({ time: 300, price: 112 });
  });

  it("works on a later edit gesture while Shift is already held", () => {
    const { engine, drawing } = editing("arrow");
    engine.setShift(true);
    engine.drag = { ...engine.drag, origin: drawing.points.map((p) => ({ ...p })) };
    engine.updateDrag({ x: 108, y: 300 });
    expect(drawing.points[1]!.time).toBeCloseTo(100);
    expect(drawing.points[1]!.price).toBeGreaterThan(290);
  });

  it("leaves non-line tools using their normal anchor movement", () => {
    const { engine, drawing } = editing("rectangle");
    engine.setShift(true);
    expect(drawing.points[1]).toEqual({ time: 300, price: 117 });
  });
});
