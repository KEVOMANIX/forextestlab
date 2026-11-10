import { describe, expect, it } from "vitest";
import { hydratePineIndicator, pineDeclaredName, PINE_INDICATOR_TEMPLATE } from "./pine-scripts";
import { pineValuesAt } from "@/components/app/usePineIndicators";

describe("pine chart scripts", () => {
  it("reads the declared indicator or strategy title", () => {
    expect(pineDeclaredName(PINE_INDICATOR_TEMPLATE)).toBe("My script");
    expect(pineDeclaredName('//@version=6\nindicator(title="EMA ribbon", overlay=true)')).toBe("EMA ribbon");
    expect(pineDeclaredName('strategy("Breakout")')).toBe("Breakout");
    expect(pineDeclaredName("plot(close)")).toBeNull();
  });

  it("restores saved chart scripts and rejects malformed ones", () => {
    expect(hydratePineIndicator({ id: "a", name: "EMA", code: "plot(close)" })).toEqual({ id: "a", scriptId: null, name: "EMA", code: "plot(close)", visible: true });
    expect(hydratePineIndicator({ id: "a", name: "EMA", code: "x", scriptId: "s", visible: false })?.visible).toBe(false);
    expect(hydratePineIndicator({ id: "a", name: "EMA" })).toBeNull();
    expect(hydratePineIndicator({ id: "a", name: "EMA", code: "x".repeat(20_001) })).toBeNull();
    expect(hydratePineIndicator(null)).toBeNull();
  });

  it("reads plot values at the hovered candle", () => {
    const report = { overlay: true, times: [1_000, 2_000, 3_000], plots: [{ title: "Basis", color: "#2962FF", linewidth: 1, values: [1, null, 3] }] };
    expect(pineValuesAt(report, 2)).toEqual([{ title: "Basis", color: "#2962FF", value: null }]);
    expect(pineValuesAt(report, 2.5)).toEqual([{ title: "Basis", color: "#2962FF", value: null }]);
    expect(pineValuesAt(report, 3)).toEqual([{ title: "Basis", color: "#2962FF", value: 3 }]);
    expect(pineValuesAt(report, null)[0]!.value).toBe(3);
    expect(pineValuesAt(report, 0)[0]!.value).toBeNull();
  });
});
