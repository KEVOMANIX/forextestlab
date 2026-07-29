import { describe, expect, it, vi } from "vitest";

import {
  publishReplayVisual,
  subscribeReplayVisual,
} from "./replay-visual-bus";

describe("replay visual update messages", () => {
  it("delivers compact updates only to the matching session", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribeReplayVisual("session-a", first);
    const unsubscribeSecond = subscribeReplayVisual("session-b", second);

    publishReplayVisual({
      sessionId: "session-a",
      currentTime: 1_700_000_000_000,
      visibleIndex: 42,
    });

    expect(first).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledWith({
      sessionId: "session-a",
      currentTime: 1_700_000_000_000,
      visibleIndex: 42,
    });
    expect(second).not.toHaveBeenCalled();
    unsubscribeFirst();
    unsubscribeSecond();
  });

  it("stops delivering messages after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeReplayVisual("session-a", listener);
    unsubscribe();
    publishReplayVisual({
      sessionId: "session-a",
      currentTime: 1,
      visibleIndex: 1,
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
