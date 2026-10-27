import { describe, expect, it } from "vitest";

import { actionSchema, createSessionSchema } from "@/lib/backtest/schemas";
import { SYMBOL_DEFINITIONS } from "@/lib/market-data/symbols";

describe("market symbol codes", () => {
  // Index codes such as USA30IDXUSD are longer than a currency pair's six letters.
  it.each(SYMBOL_DEFINITIONS.map((definition) => definition.symbol))("starts a session on %s", (symbol) => {
    const parsed = createSessionSchema.safeParse({ name: "Test session", symbols: [symbol], startTime: 1, endTime: 2, startingBalance: "10000" });
    expect(parsed.success).toBe(true);
  });

  it.each(SYMBOL_DEFINITIONS.map((definition) => definition.symbol))("places an order on %s", (symbol) => {
    const parsed = actionSchema.safeParse({ type: "place-order", symbol, direction: "long", orderType: "market", lots: "0.1" });
    expect(parsed.error?.flatten().fieldErrors.symbol).toBeUndefined();
  });
});
