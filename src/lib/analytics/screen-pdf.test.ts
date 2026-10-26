import { expect, it } from "vitest";
import { screenPageCuts } from "./screen-pdf";

it("breaks before a card instead of cutting its chart", () => {
  expect(screenPageCuts(1500, 800, [{ top: 600, bottom: 1000 }])).toEqual([0, 600, 1400, 1500]);
});
it("covers tall content completely even when a single section exceeds a page", () => {
  expect(screenPageCuts(2100, 800, [{ top: 0, bottom: 2100 }])).toEqual([0, 800, 1600, 2100]);
});
