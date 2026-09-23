import { describe, expect, it } from "vitest";

import { newDrawing } from "./objects";
import { TOOL_LABELS, TOOL_POINTS, type ToolKind } from "./types";

const STUDIES: ToolKind[] = [
  "fibChannel", "fibTimeZone", "fibSpeedResistanceFan", "trendFibTime",
  "fibCircles", "fibSpiral", "fibSpeedResistanceArcs", "fibWedge",
  "pitchfan", "gannBox", "gannSquareFixed", "gannSquare", "gannFan",
];

describe("advanced Fibonacci and Gann studies", () => {
  it.each(STUDIES)("creates and serializes %s", (kind) => {
    const drawing = newDrawing(kind, { time: 100, price: 1.1 }, 2, TOOL_POINTS[kind]);
    const saved = drawing.serialize();

    expect(saved.kind).toBe(kind);
    expect(saved.points).toHaveLength(TOOL_POINTS[kind]);
    expect(TOOL_LABELS[kind]).toBeTruthy();
  });

  it("starts a Gann box with independent price and time controls", () => {
    const saved = newDrawing("gannBox", { time: 100, price: 1.1 }, 2, TOOL_POINTS.gannBox).serialize();

    expect(saved.style.gannPriceLevels).toEqual([0, 0.5, 1]);
    expect(saved.style.gannTimeLevels).toEqual([0, 0.5, 1]);
    expect(saved.style.gannLeftLabels).toBe(true);
    expect(saved.style.gannRightLabels).toBe(true);
    expect(saved.style.gannPriceBackground).toBe(true);
    expect(saved.style.gannTimeBackground).toBe(true);
  });

  it.each([
    "fibChannel", "fibTimeZone", "fibSpeedResistanceFan", "trendFibTime", "fibCircles",
    "fibSpeedResistanceArcs", "fibWedge", "pitchfan", "gannFan",
  ] as ToolKind[])("gives %s editable study levels", (kind) => {
    const saved = newDrawing(kind, { time: 100, price: 1.1 }, 2, TOOL_POINTS[kind]).serialize();
    expect(saved.style.studyLevels?.length).toBeGreaterThan(0);
  });

  it("gives the spiral its TradingView direction input", () => {
    const saved = newDrawing("fibSpiral", { time: 100, price: 1.1 }, 2, TOOL_POINTS.fibSpiral).serialize();
    expect(saved.style.studyCounterClockwise).toBe(false);
  });

  it.each(["gannSquare", "gannSquareFixed"] as ToolKind[])("gives %s level, fan, arc, and reverse controls", (kind) => {
    const saved = newDrawing(kind, { time: 100, price: 1.1 }, 2, TOOL_POINTS[kind]).serialize();
    expect(saved.style.gannShowLevels).toBe(true);
    expect(saved.style.gannShowFans).toBe(true);
    expect(saved.style.gannShowArcs).toBe(true);
    expect(saved.style.reverse).toBe(false);
  });
});
