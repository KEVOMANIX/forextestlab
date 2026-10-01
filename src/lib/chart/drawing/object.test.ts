import { describe, expect, it } from "vitest";

import { chartCanvasBackground, readableCanvasColor } from "./object";

describe("drawing label contrast", () => {
  it("replaces light text that disappears on a light chart", () => {
    expect(readableCanvasColor("#ffffff", chartCanvasBackground("light"))).toBe("#17201c");
  });

  it("replaces dark text that disappears on a dark chart", () => {
    expect(readableCanvasColor("#0b0f1a", chartCanvasBackground("dark"))).toBe("#f4fff9");
  });

  it("preserves a user colour when it already has sufficient contrast", () => {
    expect(readableCanvasColor("#b4233c", chartCanvasBackground("light"))).toBe("#b4233c");
  });
});
