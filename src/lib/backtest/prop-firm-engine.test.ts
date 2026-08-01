import { describe, expect, it } from "vitest";

import type { Candle } from "@/lib/market-data/types";

import { PROP_FIRM_PRESETS, type PropFirmRules } from "./prop-firm";
import { createSessionState, placeOrder, revealNext, stepBack } from "./replay-engine";
import type { EngineContext, SessionConfig } from "./types";

/**
 * The challenge rules as the engine applies them, over real candles.
 *
 * `prop-firm.test.ts` covers the arithmetic; this covers the wiring — that a
 * breach is detected on the candle rather than at the order form, that it
 * leaves the account flat and finished, and that the run cannot be rewound out
 * of it.
 */

const DAY = 24 * 60 * 60 * 1000;
/** 2024-03-05 08:00 Prague. */
const OPEN = Date.parse("2024-03-05T07:00:00Z");

function rules(overrides: Partial<PropFirmRules> = {}): PropFirmRules {
  return { ...PROP_FIRM_PRESETS["ftmo-phase-1"], ...overrides };
}

function cfg(propFirm?: PropFirmRules): SessionConfig {
  return {
    symbol: "EURUSD",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    timeframe: "1h",
    startTime: OPEN,
    endTime: OPEN + 10 * DAY,
    startingBalance: "100000",
    accountCurrency: "USD",
    spreadPips: "0",
    commissionPerLot: "0",
    slippagePips: "0",
    executionPolicy: "conservative",
    pipSize: "0.0001",
    pricePrecision: 5,
    initialVisibleCount: 1,
    propFirm,
  };
}

function c(ts: number, o: string, h: string, l: string, cl: string): Candle {
  return { timestamp: ts, open: o, high: h, low: l, close: cl, source: "test" };
}

function ctx(candles: Candle[], propFirm?: PropFirmRules): EngineContext {
  const config = cfg(propFirm);
  return {
    candles,
    state: createSessionState("s1", config, candles.length, candles, "test", true),
  };
}

/**
 * 10 lots of EURUSD is $100 a pip, so a 1.10000 → 1.09000 slide is a $10,000
 * loss — exactly the 10% maximum on a 100,000 account, and twice the 5% daily.
 */
function longTenLots(context: EngineContext) {
  placeOrder(context, { direction: "long", sizingMode: "fixed-lots", lots: "10" });
}

describe("a challenge session", () => {
  it("starts with the rules attached and the day open at the balance", () => {
    const context = ctx([c(OPEN, "1.10000", "1.10000", "1.10000", "1.10000")], rules());
    expect(context.state.propFirm).toMatchObject({
      status: "active",
      dayKey: "2024-03-05",
      dayStartEquity: "100000.00",
      tradingDays: [],
    });
  });

  it("has no runtime at all without a challenge", () => {
    const context = ctx([c(OPEN, "1.10000", "1.10000", "1.10000", "1.10000")]);
    expect(context.state.propFirm).toBeUndefined();
  });
});

describe("breaching", () => {
  it("fails on the daily limit while the position is still floating", () => {
    // Nothing is closed and no order is placed — the loss is entirely unrealised,
    // which is the case a click-time guard cannot see.
    const context = ctx(
      [
        c(OPEN, "1.10000", "1.10000", "1.10000", "1.10000"),
        c(OPEN + 3_600_000, "1.10000", "1.10000", "1.09400", "1.09400"),
      ],
      rules(),
    );
    longTenLots(context);
    revealNext(context);

    expect(context.state.propFirm?.status).toBe("breached");
    expect(context.state.propFirm?.breach).toMatchObject({ rule: "daily-loss" });
    // A breach leaves the account flat and the session over.
    expect(context.state.openPositions).toHaveLength(0);
    expect(context.state.status).toBe("finished");
  });

  it("fails on the wick even when the candle closes back inside the line", () => {
    const context = ctx(
      [
        c(OPEN, "1.10000", "1.10000", "1.10000", "1.10000"),
        // Dips to 1.09400 (-$6,000) before closing at -$1,000.
        c(OPEN + 3_600_000, "1.10000", "1.10000", "1.09400", "1.09900"),
      ],
      rules(),
    );
    longTenLots(context);
    revealNext(context);

    expect(context.state.propFirm?.status).toBe("breached");
    expect(Number(context.state.propFirm?.breach?.equity)).toBeLessThan(95_000);
  });

  it("survives a loss that stays the right side of the line", () => {
    const context = ctx(
      [
        c(OPEN, "1.10000", "1.10000", "1.10000", "1.10000"),
        // -$4,900 at the low: inside the $5,000 daily allowance.
        c(OPEN + 3_600_000, "1.10000", "1.10000", "1.09510", "1.09510"),
      ],
      rules(),
    );
    longTenLots(context);
    revealNext(context);

    expect(context.state.propFirm?.status).toBe("active");
    expect(context.state.openPositions).toHaveLength(1);
    expect(context.state.status).not.toBe("finished");
  });

  it("gives back the full allowance on the next trading day", () => {
    // -$4,900 on day one, then another -$4,900 on day two. Cumulatively that is
    // past a single day's 5%, but each day is measured on its own.
    const context = ctx(
      [
        c(OPEN, "1.10000", "1.10000", "1.10000", "1.10000"),
        c(OPEN + 3_600_000, "1.10000", "1.10000", "1.09510", "1.09510"),
        c(OPEN + DAY, "1.09510", "1.09510", "1.09020", "1.09020"),
      ],
      rules(),
    );
    longTenLots(context);
    revealNext(context);
    revealNext(context);

    expect(context.state.propFirm?.dayKey).toBe("2024-03-06");
    expect(context.state.propFirm?.dayStartEquity).toBe("95100.00");
    expect(context.state.propFirm?.status).toBe("active");
  });

  it("still fails the maximum loss across days", () => {
    // Same two days, but the second one runs far enough to break the 10% total.
    const context = ctx(
      [
        c(OPEN, "1.10000", "1.10000", "1.10000", "1.10000"),
        c(OPEN + 3_600_000, "1.10000", "1.10000", "1.09510", "1.09510"),
        c(OPEN + DAY, "1.09510", "1.09510", "1.08950", "1.08950"),
      ],
      rules(),
    );
    longTenLots(context);
    revealNext(context);
    revealNext(context);

    expect(context.state.propFirm?.breach).toMatchObject({
      rule: "total-loss",
      limit: "90000.00",
    });
  });
});

describe("passing", () => {
  it("marks the phase passed at the target without stopping the run", () => {
    const context = ctx(
      [
        c(OPEN, "1.10000", "1.10000", "1.10000", "1.10000"),
        // +$10,000 = the 10% phase-one target.
        c(OPEN + 3_600_000, "1.10000", "1.11000", "1.10000", "1.11000"),
        c(OPEN + 7_200_000, "1.11000", "1.11000", "1.11000", "1.11000"),
      ],
      rules(),
    );
    longTenLots(context);
    revealNext(context);

    expect(context.state.propFirm?.status).toBe("passed");
    // The data is still worth trading, and a firm would not close the account.
    expect(context.state.status).not.toBe("finished");
    expect(revealNext(context)).toBe(true);
  });

  it("counts the day a trade closes on", () => {
    const context = ctx(
      [
        c(OPEN, "1.10000", "1.10000", "1.10000", "1.10000"),
        c(OPEN + 3_600_000, "1.10000", "1.10050", "1.10000", "1.10050"),
      ],
      rules({ minTradingDays: 2 }),
    );
    placeOrder(context, {
      direction: "long",
      sizingMode: "fixed-lots",
      lots: "1",
      takeProfit: "1.10040",
    });
    revealNext(context);

    expect(context.state.propFirm?.tradingDays).toEqual(["2024-03-05"]);
  });
});

describe("rewinding", () => {
  it("is available during a challenge", () => {
    const candles = [
      c(OPEN, "1.10000", "1.10000", "1.10000", "1.10000"),
      c(OPEN + 3_600_000, "1.10000", "1.10000", "1.10000", "1.10000"),
    ];
    const challenge = ctx(candles, rules());
    revealNext(challenge);
    expect(stepBack(challenge)).toBe(true);

    // The same untouched run rewinds freely without the rules attached.
    const practice = ctx(candles);
    revealNext(practice);
    expect(stepBack(practice)).toBe(true);
  });
});
