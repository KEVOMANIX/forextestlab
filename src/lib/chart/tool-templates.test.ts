import { describe, expect, it } from "vitest";
import { TOOL_LABELS, defaultStyle, type DrawingJSON, type ToolKind } from "./drawing/types";
import { makeInstance } from "./indicator-defs";
import { drawingTemplate, indicatorTemplate, mergeToolTemplates, type ToolTemplate } from "./tool-templates";

describe("individual tool templates", () => {
  it.each(Object.keys(TOOL_LABELS) as ToolKind[])("reuses %s settings without moving or replacing the drawing", kind => {
    const drawing: DrawingJSON = { id: "original", kind, points: [{ time: 100, price: 42 }], style: defaultStyle(kind), locked: false, hidden: false, zIndex: 1, visibleTimeframes: ["15m"] };
    const saved = drawingTemplate(drawing);
    const target = { ...drawing, id: "target", points: [{ time: 200, price: 55 }] };
    expect({ ...target, ...saved }).toMatchObject({ id: "target", points: [{ time: 200, price: 55 }] });
    expect(saved).not.toHaveProperty("kind");
    saved.style.color = "#ff0000";
    expect(drawing.style.color).not.toBe("#ff0000");
  });
  it("captures session inputs without copying the instance identity", () => {
    const sessions = makeInstance("sessions")!;
    sessions.inputs.timezone = "UTC+3";
    const saved = indicatorTemplate(sessions);
    expect(saved.inputs.timezone).toBe("UTC+3");
    expect(saved).not.toHaveProperty("id");
    expect(saved).not.toHaveProperty("kind");
    saved.inputs.timezone = "UTC";
    expect(sessions.inputs.timezone).toBe("UTC+3");
  });
  it("merges independent types and keeps newer local saves/deletions over stale server data", () => {
    const old: ToolTemplate = { id: "fib", name: "FIB", scope: "drawing:fib", settings: {}, updatedAt: 1 };
    const deleted = { ...old, deleted: true, updatedAt: 3 };
    const session = { ...old, id: "session", scope: "indicator:sessions", updatedAt: 2 };
    expect(mergeToolTemplates([deleted], [old, session])).toEqual([deleted, session]);
  });
});
