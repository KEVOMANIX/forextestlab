import { describe, expect, it } from "vitest";
import { drawingOrderDraft } from "./drawing-order";
import { defaultStyle, type DrawingJSON } from "@/lib/chart/drawing/types";
import type { PublicSessionState } from "./types";
const state = { status: "paused", currentPrice: "1.10000", balance: "10000", config: { pricePrecision: 5, pipSize: "0.0001", spreadPips: "2", slippagePips: "0" } } as unknown as PublicSessionState;
function drawing(kind: "long" | "short", entry: number): DrawingJSON {
 const sign = kind === "long" ? 1 : -1;
 return { id: "test", kind, points: [{ time: 1, price: entry }, { time: 1, price: entry - sign * .002 }, { time: 2, price: entry + sign * .004 }], style: { ...defaultStyle(kind), risk: 2, riskMode: "percent" }, locked: false, hidden: false, zIndex: 1, visibleTimeframes: null };
}
describe("orders from position drawings", () => {
 it.each(["long", "short"] as const)("uses market within one pip on either side for %s", kind => {
  for (const entry of [1.09990, 1.09995, 1.1, 1.10005, 1.10010]) {
   const result = drawingOrderDraft(drawing(kind, entry), state);
   expect(result.orderType).toBe("market");
   expect(result.plan.entryPrice).toBe(kind === "long" ? "1.10010" : "1.09990");
  }
 });
 it.each([["long",1.09989,"limit"],["long",1.10011,"stop"],["short",1.10011,"limit"],["short",1.09989,"stop"]] as const)("keeps pending type outside one pip: %s %s", (kind,entry,type) => {
  expect(drawingOrderDraft(drawing(kind,entry),state).orderType).toBe(type);
 });
 it("uses the instrument's pip size", () => {
  const jpy = { ...state, currentPrice: "150.000", config: { ...state.config, pricePrecision: 3, pipSize: "0.01", spreadPips: "0" } };
  const item=drawing("long",150.01);item.points[1]!.price=149.9;item.points[2]!.price=150.2;
  expect(drawingOrderDraft(item,jpy).orderType).toBe("market");
  item.points[0]!.price=150.011;
  expect(drawingOrderDraft(item,jpy).orderType).toBe("stop");
 });
 it.each([["long",1.09,"limit"],["long",1.11,"stop"],["short",1.11,"limit"],["short",1.09,"stop"]] as const)("chooses %s at %s as %s", (kind,entry,type) => {
  const result = drawingOrderDraft(drawing(kind,entry),state);
  expect(result.orderType).toBe(type); expect(result.plan.entryPrice).toBe(entry.toFixed(5)); expect(result.riskPercent).toBe("2");
 });
 it("copies protection while using executable market entry", () => {
  const result=drawingOrderDraft(drawing("long",1.1),state);
  expect(result.orderType).toBe("market");expect(result.plan).toEqual({direction:"long",entryPrice:"1.10010",stopLoss:"1.09800",takeProfit:"1.10400"});
 });
 it("preserves a cash risk or different planning account", () => {
  const item=drawing("long",1.09);item.style.riskMode="money";item.style.risk=75;
  expect(drawingOrderDraft(item,state).riskPercent).toBe("0.75");
  item.style.riskMode="percent";item.style.risk=1;item.style.accountSize=20000;
  expect(drawingOrderDraft(item,state).riskPercent).toBe("2");
 });
 it("rejects invalid protection and unavailable trading", () => {
  const item=drawing("long",1.09);item.points[1]!.price=1.10;
  expect(()=>drawingOrderDraft(item,state)).toThrow(/opposite sides/);
  expect(()=>drawingOrderDraft(drawing("short",1.11),{...state,status:"finished"})).toThrow(/ready/);
 });
});
