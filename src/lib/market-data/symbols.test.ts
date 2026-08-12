import { describe, expect, it } from "vitest";

import { SYMBOL_DEFINITIONS, describeSymbol, getSymbolDefinition } from "./symbols";

describe("forex symbol catalogue", () => {
  it("contains all 28 major and cross pairs without duplicates", () => {
    const currencies = new Set(["AUD", "CAD", "CHF", "EUR", "GBP", "JPY", "NZD", "USD"]);
    const forex = SYMBOL_DEFINITIONS.filter(
      ({ baseCurrency, quoteCurrency }) => currencies.has(baseCurrency) && currencies.has(quoteCurrency),
    );
    expect(forex).toHaveLength(28);
    expect(new Set(forex.map(({ symbol }) => symbol)).size).toBe(28);
    expect(forex.map(({ symbol }) => symbol)).toEqual(
      expect.arrayContaining([
        "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
        "EURGBP", "EURAUD", "EURCAD", "EURCHF", "EURJPY", "EURNZD",
        "GBPAUD", "GBPCAD", "GBPCHF", "GBPJPY", "GBPNZD",
        "AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "CADCHF", "CADJPY",
        "CHFJPY", "NZDCAD", "NZDCHF", "NZDJPY",
      ]),
    );
  });

  it("uses JPY pip precision and exposes readable currency names", () => {
    expect(getSymbolDefinition("GBPJPY")).toMatchObject({ pipSize: "0.01", pricePrecision: 3 });
    expect(describeSymbol("AUDCAD")).toBe("Australian Dollar / Canadian Dollar");
  });
});
