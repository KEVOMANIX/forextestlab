import { describe, expect, it } from "vitest";
import { isStrategyFxMarket } from "./markets";

describe("strategy-language FX scope", () => {
  it("includes provider FX crosses and excludes pip-incompatible contracts", () => {
    expect(isStrategyFxMarket("EURUSD")).toBe(true);
    expect(isStrategyFxMarket("GBPJPY")).toBe(true);
    expect(isStrategyFxMarket("USDZAR")).toBe(true);
    expect(isStrategyFxMarket("XAUUSD")).toBe(false);
    expect(isStrategyFxMarket("USA30IDXUSD")).toBe(false);
    expect(isStrategyFxMarket("WTIUSD")).toBe(false);
  });
});
