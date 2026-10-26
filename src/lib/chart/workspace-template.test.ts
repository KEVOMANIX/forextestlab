import { describe, expect, it } from "vitest";
import { EMPTY_WORKSPACE } from "@/lib/workspace";
import { newestChartView, reusableWorkspace, templateView } from "./workspace-template";
import { chartPriceFormat, spreadReadout } from "./price-format";

describe("reusable chart templates", () => {
  it("preserves unsynced local indicator edits on reload and accepts newer cloud edits", () => {
    const local = { indicators: ["sessions"], preferencesUpdatedAt: 200 };
    const remote = { indicators: [], preferencesUpdatedAt: 100 };
    expect(newestChartView(local, remote)).toBe(local);
    expect(newestChartView(remote, local)).toBe(local);
    expect(newestChartView(null, remote)).toBe(remote);
  });
  it("keeps session inputs and drawing styles without copying market coordinates or orders", () => {
    const indicators = [{ kind: "sessions", inputs: { timezone: "America/New_York", londonStart: "02:30" } }];
    const original = { ...EMPTY_WORKSPACE, layout: { symbol: "EURUSD" },
      cellViews: { "cell-1:EURUSD": { indicators, chartType: "candles", timeframe: "15m", range: { from: 1, to: 20 } } },
      drawings: { EURUSD: [{ price: 1.08 }] }, toolDefaults: { rectangle: { color: "red" } } };
    const template = reusableWorkspace(original);
    expect(template.cellViews["cell-1:EURUSD"]).toEqual({ indicators, chartType: "candles" });
    expect(template.toolDefaults).toEqual(original.toolDefaults);
    expect(template.drawings).toEqual({});
    expect(template.layout).toBeNull();
    expect(template.orderTicketDefaults).toBeNull();
    expect(original.drawings.EURUSD).toHaveLength(1);
  });
  it("ignores malformed views", () => {
    expect(templateView(null)).toEqual({});
    expect(templateView({ indicators: "bad", range: {} })).toEqual({});
  });
});

describe("instrument price axes", () => {
  it("converts an index pip into points and retains FX pips", () => {
    expect(spreadReadout("USA500IDXUSD", 2, 0.1)).toBe("0.2 pts");
    expect(spreadReadout("USA30IDXUSD", 1, 1)).toBe("1.0 pts");
    expect(spreadReadout("EURUSD", 0.8, 0.0001)).toBe("0.8 pips");
  });
  it("retains forex precision", () => {
    expect(chartPriceFormat(5, 0.0001)).toEqual({ type: "price", precision: 5, minMove: 0.00001 });
  });
  it("keeps index axis decimals consistent with live prices", () => {
    const format = chartPriceFormat(3, 1);
    if (format.type !== "custom") throw new Error("Expected custom index format");
    expect(format.formatter(54000)).toBe("54000.000");
    expect(format.formatter(52784.427)).toBe("52784.427");
    expect(format.minMove).toBe(0.001);
  });
});
