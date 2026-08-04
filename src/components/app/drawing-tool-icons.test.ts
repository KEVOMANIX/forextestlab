import { describe, expect, it } from "vitest";

import { DRAWING_TOOL_ICONS } from "./DrawingToolIcons";
import { TOOL_LABELS, type ToolKind } from "@/lib/chart/drawing/types";

/**
 * Six tools used to point at another tool's glyph — flat top/bottom and disjoint
 * channel both showed the parallel channel, the three range tools shared one
 * icon, and the price label borrowed the label's. The rail then offered the same
 * picture two or three times, which is indistinguishable from a bug.
 */

describe("the drawing tool icon map", () => {
  const kinds = Object.keys(TOOL_LABELS) as ToolKind[];

  it("covers every tool the app can draw", () => {
    expect(kinds.length).toBeGreaterThan(30);
    for (const kind of kinds) {
      expect(DRAWING_TOOL_ICONS[kind], kind).toBeTypeOf("function");
    }
  });

  it("gives every tool a glyph of its own", () => {
    const owners = new Map<unknown, ToolKind>();
    for (const kind of kinds) {
      const icon = DRAWING_TOOL_ICONS[kind];
      const existing = owners.get(icon);
      expect(existing, `${kind} shares its glyph with ${existing}`).toBeUndefined();
      owners.set(icon, kind);
    }
  });

  it("names each glyph after its tool, so the map is readable", () => {
    for (const kind of kinds) {
      const name = DRAWING_TOOL_ICONS[kind].name;
      expect(name, kind).toMatch(/Icon$/);
    }
  });
});
