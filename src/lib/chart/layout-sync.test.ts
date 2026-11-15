import { describe, expect, it } from "vitest";
import type { DrawingJSON } from "@/lib/chart/drawing/types";
import type { IndicatorInstance } from "@/lib/chart/indicator-defs";
import type { PineChartIndicator } from "@/lib/chart/pine-scripts";
import { planLayoutSync } from "./layout-sync";

const study = (kind: string, id = kind) => ({ id, kind, visible: true, inputs: { length: 20 }, style: { line: { color: "#2962ff" } } }) as unknown as IndicatorInstance;
const script = (name: string): PineChartIndicator => ({ id: `pine-${name}`, scriptId: name, name, code: `//@version=6\nindicator("${name}")\nplot(close)\n`, visible: true, inputs: { "0": { value: 3 } } as never, style: { plots: { "0": { color: "#f00" } } } as never });
const line = { kind: "trendline", points: [{ time: 1, price: 1.08 }, { time: 2, price: 1.09 }] } as unknown as DrawingJSON;

const eurusd = { id: "cell-1", symbol: "EURUSD" };
const eurusd4h = { id: "cell-2", symbol: "EURUSD" };
const usdjpy = { id: "cell-3", symbol: "USDJPY" };
const cells = [eurusd, eurusd4h, usdjpy];

describe("layout copy", () => {
  it("copies Pine scripts with their settings to every pane", () => {
    const daily = script("ForexTestLab Daily Bias");
    const plan = planLayoutSync(eurusd, cells, { indicators: [], pineIndicators: [daily] }, () => ({}));
    expect(plan.targets.map((target) => target.cellId)).toEqual(["cell-2", "cell-3"]);
    for (const target of plan.targets) {
      expect(target.pineIndicators).toEqual([daily]);
      expect(target.pineIndicators[0]).not.toBe(daily); // each pane gets its own copy
    }
    expect(plan.pineIndicators).toEqual([daily]);
  });

  it("copies built-in studies to every pane and keeps a pane's own Sessions", () => {
    const plan = planLayoutSync(eurusd, cells, { indicators: [study("ema")], pineIndicators: [] }, (cell) => (cell.id === "cell-3" ? { indicators: [study("sessions")] } : {}));
    expect(plan.targets[0]!.indicators.map((indicator) => indicator.kind)).toEqual(["ema"]);
    expect(plan.targets[1]!.indicators.map((indicator) => indicator.kind)).toEqual(["ema", "sessions"]);
  });

  it("sends drawings only to panes on the same pair, never over another pair's drawings", () => {
    const plan = planLayoutSync(eurusd, cells, { indicators: [study("ema")], drawings: [line] }, () => ({}));
    expect(plan.targets.find((target) => target.cellId === "cell-2")!.drawings).toEqual([line]);
    expect(plan.targets.find((target) => target.cellId === "cell-3")!.drawings).toBeUndefined();
  });

  it("leaves drawings alone when the source's drawing layer was not ready", () => {
    const plan = planLayoutSync(eurusd, cells, { indicators: [study("ema")] }, () => ({}));
    expect(plan.targets.every((target) => target.drawings === undefined)).toBe(true);
  });

  it("uses the source's saved studies and scripts while its live ones are still loading", () => {
    const saved = { indicators: [study("rsi")], pineIndicators: [script("Saved")] };
    const plan = planLayoutSync(eurusd, cells, { indicators: [], pineIndicators: [] }, (cell) => (cell.id === eurusd.id ? saved : {}));
    expect(plan.targets[0]!.indicators.map((indicator) => indicator.kind)).toEqual(["rsi"]);
    expect(plan.targets[0]!.pineIndicators.map((item) => item.name)).toEqual(["Saved"]);
  });

  it("keeps each pane's scripts when the source sent none, and clears them on an explicit removal", () => {
    const own = { pineIndicators: [script("Own")] };
    const untouched = planLayoutSync(eurusd, cells, { indicators: [study("ema")] }, () => own);
    expect(untouched.pineIndicators).toBeNull();
    expect(untouched.targets[0]!.pineIndicators.map((item) => item.name)).toEqual(["Own"]);
    const cleared = planLayoutSync(eurusd, cells, { indicators: [], pineIndicators: [], allowEmpty: true }, () => own);
    expect(cleared.targets.every((target) => target.pineIndicators.length === 0 && target.indicators.length === 0)).toBe(true);
  });
});
