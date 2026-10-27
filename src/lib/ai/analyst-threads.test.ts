import { describe, expect, it } from "vitest";

import { groupThreads, parseThreads, threadTitle, upsertThread, type AnalystThread } from "./analyst-threads";

const NOW = new Date(2026, 9, 27, 15).getTime();
const DAY = 86_400_000;

function thread(id: string, updatedAt: number, extra: Partial<AnalystThread> = {}): AnalystThread {
  return { id, title: `Chat ${id}`, sessionId: null, pinned: false, updatedAt, messages: [], ...extra };
}

describe("AI Analyst saved chats", () => {
  it("titles a chat from the first line of its question", () => {
    expect(threadTitle("  Why do I lose on EUR/USD?\nmore detail")).toBe("Why do I lose on EUR/USD?");
    expect(threadTitle("x".repeat(80))).toHaveLength(60);
  });

  it("drops anything malformed from storage", () => {
    const good = thread("a", NOW);
    expect(parseThreads(JSON.stringify([good, { id: 1 }, null, { ...good, id: "b", messages: [{ role: "x", text: "" }] }]))).toEqual([good]);
    expect(parseThreads("not json")).toEqual([]);
    expect(parseThreads(null)).toEqual([]);
  });

  it("keeps the newest first and never lets a pinned chat fall off", () => {
    let threads = [thread("pinned", NOW - 100 * DAY, { pinned: true })];
    for (let index = 0; index < 55; index += 1) threads = upsertThread(threads, thread(`t${index}`, NOW - (55 - index) * 1000));
    expect(threads).toHaveLength(50);
    expect(threads[0]!.id).toBe("t54");
    expect(threads.some((item) => item.id === "pinned")).toBe(true);
    expect(threads.some((item) => item.id === "t0")).toBe(false);
  });

  it("groups chats into pinned, today, this week and earlier, filtered by search", () => {
    const threads = [thread("a", NOW - 1000), thread("b", NOW - 3 * DAY), thread("c", NOW - 30 * DAY), thread("d", NOW - 40 * DAY, { pinned: true, title: "Gold review" })];
    const groups = groupThreads(threads, "", NOW);
    expect([groups.pinned, groups.today, groups.week, groups.earlier].map((group) => group.map((item) => item.id))).toEqual([["d"], ["a"], ["b"], ["c"]]);
    expect(groupThreads(threads, "gold", NOW).pinned.map((item) => item.id)).toEqual(["d"]);
    expect(groupThreads(threads, "gold", NOW).today).toEqual([]);
  });
});
