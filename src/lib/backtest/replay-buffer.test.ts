import { describe, expect, it, vi } from "vitest";

import {
  replayBufferTargetCandles,
  retryReplayChunk,
  updateReplayFetchLatency,
} from "./replay-buffer";

describe("replay data reservoir", () => {
  it("keeps at least a full server page ready at ordinary speeds", () => {
    expect(replayBufferTargetCandles(60, "1m", 2_300)).toBe(1_500);
  });

  it("holds thirty seconds of one-minute candles at maximum speed", () => {
    expect(replayBufferTargetCandles(7_200, "1m", 4_500)).toBe(3_600);
  });

  it("expands when observed fetch latency exceeds the baseline reserve", () => {
    expect(replayBufferTargetCandles(7_200, "1m", 10_000)).toBe(4_800);
  });

  it("reacts faster to degraded latency than recovered latency", () => {
    expect(updateReplayFetchLatency(4_000, 8_000)).toBe(6_000);
    expect(updateReplayFetchLatency(4_000, 2_000)).toBe(3_600);
  });

  it("retries a transient chunk failure without surfacing starvation", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, candles: [1] });
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      retryReplayChunk(load, [250, 750, 1_500], wait),
    ).resolves.toEqual({ ok: true, candles: [1] });
    expect(load).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });
});
