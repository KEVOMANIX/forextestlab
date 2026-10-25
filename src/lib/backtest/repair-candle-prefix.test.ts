import { expect, it } from "vitest";
import { repairCandlePrefix } from "./repair-candle-prefix";
import { createSessionState, placeOrder, closeAllPositions } from "./replay-engine";
import type { Candle, Timeframe } from "@/lib/market-data/types";

const bar = (timestamp: number): Candle => ({timestamp, open:"1",high:"1",low:"1",close:"1",source:"test"});
it("preserves the replay date and records when verified candles fill an old hole", () => {
  const original = [bar(0),bar(60000),bar(180000)];
  const state = createSessionState("repair",{symbol:"EURUSD",baseCurrency:"EUR",quoteCurrency:"USD",timeframe:"1m" as Timeframe,startTime:0,endTime:180000,startingBalance:"10000",accountCurrency:"USD",spreadPips:"0",commissionPerLot:"0",slippagePips:"0",executionPolicy:"conservative",pipSize:"0.0001",pricePrecision:5,initialVisibleCount:3},3,original,"test",true);
  state.bookmarks=[{id:"b",index:2,time:180000,note:"keep",createdAt:1}];
  const ctx={state,candles:original};
  placeOrder(ctx,{direction:"long",sizingMode:"fixed-lots",lots:"0.1"});
  closeAllPositions(ctx);
  placeOrder(ctx,{direction:"short",sizingMode:"fixed-lots",lots:"0.1"});
  const repaired = repairCandlePrefix(state, original, [bar(120000),{...bar(60000),close:"9"}]);
  expect(repaired.inserted).toBe(1);
  expect(repaired.state.visibleIndex).toBe(3);
  expect(repaired.candles[repaired.state.visibleIndex]!.timestamp).toBe(180000);
  expect(repaired.state.bookmarks[0]!).toEqual({...state.bookmarks[0],index:3});
  expect(repaired.state.balance).toBe(state.balance);
  expect(repaired.state.closedTrades).toEqual(state.closedTrades.map(trade=>({...trade,entryIndex:3,exitIndex:3})));
  expect(repaired.state.openPositions).toEqual(state.openPositions.map(position=>({...position,entryIndex:3})));
  expect(repaired.candles[1]!.close).toBe("1");
  expect(state.visibleIndex).toBe(2);
  expect(repairCandlePrefix(repaired.state,repaired.candles,[bar(120000)]).inserted).toBe(0);
});
