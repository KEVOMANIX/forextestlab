import { describe, expect, it } from "vitest";
import { adjacentHistory } from "./adjacent-history";
import type { Candle } from "@/lib/market-data/types";
const candle = (date: string): Candle => ({ timestamp: Date.parse(date), open: "1", high: "1", low: "1", close: "1" });
describe("cached history adjacency", () => {
  it("does not join December directly to June and leaves June as the pagination boundary", () => {
    const december = candle("2024-12-20T12:00:00Z");
    const june = candle("2025-06-02T12:00:00Z");
    expect(adjacentHistory([december, june], Date.parse("2025-06-02T12:01:00Z"), "1m")).toEqual([june]);
  });
  it("ignores an entirely stale prefix so adjacent history can be loaded", () => {
    expect(adjacentHistory([candle("2024-12-20")], Date.parse("2025-06-02"), "1m")).toEqual([]);
  });
  it("preserves ordinary weekend boundaries", () => {
    const history = [candle("2025-05-30T20:59:00Z"), candle("2025-06-01T21:03:00Z")];
    expect(adjacentHistory(history, Date.parse("2025-06-01T21:04:00Z"), "1m")).toEqual(history);
  });
  it("keeps monthly history across varying month lengths and excludes future cache rows", () => {
    const history = [candle("2025-01-01"), candle("2025-02-01"), candle("2025-03-01")];
    expect(adjacentHistory([...history, candle("2025-07-01")], Date.parse("2025-04-01"), "1M")).toEqual(history);
  });
});
