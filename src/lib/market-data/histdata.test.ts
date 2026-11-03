import { describe, expect, it } from "vitest";
import { histDataMonthKey, parseHistDataMinute } from "./histdata";

describe("HistData M1", () => {
  it("converts fixed EST to UTC even in summer and splits UTC months", () => {
    const winter = parseHistDataMinute("20240131 190000;1.10;1.20;1.00;1.15;0");
    const summer = parseHistDataMinute("20240701 120000;1.10;1.20;1.00;1.15;0");
    expect(winter?.timestamp).toBe(Date.UTC(2024, 1, 1));
    expect(summer?.timestamp).toBe(Date.UTC(2024, 6, 1, 17));
    expect(histDataMonthKey("histdata_market_data", "EURUSD", winter!.timestamp)).toBe("histdata_market_data/EURUSD/2024/02.parquet");
    expect(winter?.source).toBe("histdata-r2");
  });

  it("rejects bad prices, impossible dates and tick CSV", () => {
    expect(parseHistDataMinute("20240230 120000;1;2;0.5;1;0")).toBeNull();
    expect(parseHistDataMinute("20240101 120000;1;0.5;2;1;0")).toBeNull();
    expect(parseHistDataMinute("20240101 120000000,1,2,0")).toBeNull();
  });
});
