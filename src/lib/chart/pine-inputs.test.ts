import { describe, expect, it } from "vitest";
import { applyPineInputs, parsePineInputs } from "./pine-inputs";

const V5 = `//@version=5
indicator("Bands", overlay=true)
len = input.int(20, "Length", minval=1, maxval=500)
mult = input.float(defval=2.0, title="Multiplier", step=0.1)
src = input.source(close, "Source")
show = input.bool(true, "Show basis")
mode = input.string("EMA", "Average", options=["EMA", "SMA"])
col = input.color(color.teal, "Band color")
tf = input.timeframe("60", "Timeframe")
weird = input.int(len * 2, "Derived")
plot(close) // input.int(1, "in a comment")
`;
const V4 = `//@version=4
study("Supertrend", overlay = true)
Periods = input(title="ATR Period", type=input.integer, defval=10)
src = input(hl2, title="Source")
Multiplier = input(title="ATR Multiplier", type=input.float, step=0.1, defval=3.0)
changeATR= input(title="Change ATR Calculation Method ?", type=input.bool, defval=true)
len = input(14, "Length", input.integer)
`;

describe("Pine inputs", () => {
  it("lists v5 inputs with their kinds, titles, defaults and limits", () => {
    const inputs = parsePineInputs(V5);
    expect(inputs.map((input) => [input.title, input.kind, input.defval])).toEqual([
      ["Length", "int", 20], ["Multiplier", "float", 2], ["Source", "source", "close"], ["Show basis", "bool", true],
      ["Average", "string", "EMA"], ["Band color", "color", "#00897B"], ["Timeframe", "timeframe", "60"], ["Derived", "int", null],
    ]);
    expect(inputs[0]).toMatchObject({ minval: 1, maxval: 500 });
    expect(inputs[1]).toMatchObject({ step: 0.1 });
    expect(inputs[4]!.options).toEqual(["EMA", "SMA"]);
  });

  it("lists v4 inputs, typed by type= or position, titled by variable when untitled", () => {
    const inputs = parsePineInputs(V4);
    expect(inputs.map((input) => [input.title, input.kind, input.defval])).toEqual([
      ["ATR Period", "int", 10], ["Source", "source", "hl2"], ["ATR Multiplier", "float", 3], ["Change ATR Calculation Method ?", "bool", true], ["Length", "int", 14],
    ]);
    expect(parsePineInputs('//@version=4\nstudy("X")\nfast = input(9)\n')[0]).toMatchObject({ title: "fast", kind: "int", defval: 9 });
  });

  it("applies values by rewriting each default", () => {
    const code = applyPineInputs(V5, { 0: 50, 1: 2.5, 2: "hl2", 3: false, 4: "SMA", 5: "#FF0000", 6: "240", 7: 99 });
    expect(code).toContain('input.int(50, "Length", minval=1, maxval=500)');
    expect(code).toContain('input.float(defval=2.5, title="Multiplier"');
    expect(code).toContain('input.source(hl2, "Source")');
    expect(code).toContain('input.bool(false, "Show basis")');
    expect(code).toContain('input.string("SMA", "Average"');
    expect(code).toContain('input.color(#FF0000, "Band color")');
    expect(code).toContain('input.timeframe("240", "Timeframe")');
    expect(code).toContain('input.int(len * 2, "Derived")');
    expect(code).toContain('// input.int(1, "in a comment")');
    expect(applyPineInputs(V4, { 2: 4.5, 1: "close" })).toContain('Multiplier = input(title="ATR Multiplier", type=input.float, step=0.1, defval=4.5)');
    expect(applyPineInputs(V4, { 1: "close" })).toContain('src = input(close, title="Source")');
  });

  it("ignores values that do not fit the input", () => {
    expect(applyPineInputs(V5, { 2: "not a source", 5: "red" })).toBe(V5);
  });
});
