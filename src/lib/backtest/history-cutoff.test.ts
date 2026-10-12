import { describe, expect, it } from "vitest";
import { historyCutoff } from "./history-cutoff";

describe("history checkpoint clock", () => {
  const oldClock = Date.parse("2020-02-12T18:33:00Z");
  const savedClock = Date.parse("2020-06-08T13:04:00Z");
  it("serves adjacent history after lightweight saves advance beyond stateJson", () => {
    const before = Date.parse("2020-05-26T00:00:00Z");
    expect(historyCutoff(before, oldClock, BigInt(savedClock))).toBe(before);
  });
  it("never exposes candles beyond the persisted replay clock", () => {
    expect(historyCutoff(Date.parse("2021-01-01"), oldClock, BigInt(savedClock))).toBe(savedClock + 1);
  });
  it("respects a persisted rewind even when the cached engine is ahead", () => {
    expect(historyCutoff(savedClock, savedClock, BigInt(oldClock))).toBe(oldClock + 1);
  });
  it("supports legacy sessions without a persisted clock", () => {
    expect(historyCutoff(savedClock, oldClock, null)).toBe(oldClock + 1);
  });
});
