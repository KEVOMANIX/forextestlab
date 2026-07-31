import { describe, expect, it } from "vitest";

import type { ClosedTrade, ExitReason, OpenPosition } from "@/lib/backtest/types";

import {
  buildJournalPrompts,
  dismissJournalPrompt,
  EMPTY_JOURNAL_QUEUE,
  mergeJournalPrompts,
  needsReview,
  type JournalQueue,
} from "./journal-queue";
import type { JournalPrompt } from "./TradeReviewCard";

function position(id: string, journalId = id): OpenPosition {
  return {
    id,
    journalId,
    direction: "long",
    entryPrice: "1.08000",
    entryIndex: 0,
    entryTime: 0,
    lots: "0.10",
    stopLoss: null,
    takeProfit: null,
    commission: "0",
    unrealizedPnl: "0",
  };
}

function trade(
  id: string,
  exitReason: ExitReason,
  extra: Partial<ClosedTrade> = {},
): ClosedTrade {
  return {
    id,
    journalId: id,
    direction: "long",
    entryPrice: "1.08000",
    exitPrice: "1.08100",
    entryTime: 0,
    exitTime: 1,
    entryIndex: 0,
    exitIndex: 1,
    lots: "0.10",
    stopLoss: null,
    takeProfit: null,
    commission: "0",
    pnl: "1",
    pips: "10",
    exitReason,
    intrabarAmbiguous: false,
    ...extra,
  };
}

const options = { promptEntryReason: true, pauseOnTradeClose: true };
const merge = { focusLast: true, limit: 12 };

describe("needsReview", () => {
  it("only interrupts for exits the trader did not choose", () => {
    expect(needsReview(trade("a", "stop-loss"))).toBe(true);
    expect(needsReview(trade("b", "take-profit"))).toBe(true);
    // Closing by hand already had their attention; the session ending has its
    // own modal.
    expect(needsReview(trade("c", "manual"))).toBe(false);
    expect(needsReview(trade("d", "session-end"))).toBe(false);
  });

  it("interrupts for an ambiguous candle whatever side the policy picked", () => {
    expect(
      needsReview(trade("e", "manual", { intrabarAmbiguous: true })),
    ).toBe(true);
  });
});

describe("buildJournalPrompts", () => {
  it("prompts at entry and at an unchosen exit", () => {
    const { prompts, reviewed } = buildJournalPrompts({
      opened: [position("pos_1")],
      closed: [trade("t_1", "stop-loss")],
      ...options,
    });
    expect(prompts.map((p) => `${p.kind}:${p.journalId}`)).toEqual([
      "entry:pos_1",
      "exit:t_1",
    ]);
    expect(reviewed).toHaveLength(1);
  });

  it("gives a trade that opened and closed in one batch only its exit card", () => {
    // Two cards over one journal row would race: the later autosave writes the
    // whole record and would drop the other's answer.
    const { prompts } = buildJournalPrompts({
      opened: [position("pos_1", "j1")],
      closed: [trade("t_1", "take-profit", { journalId: "j1" })],
      ...options,
    });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.kind).toBe("exit");
  });

  it("honours each preference independently", () => {
    const opened = [position("pos_1")];
    const closed = [trade("t_1", "stop-loss")];
    expect(
      buildJournalPrompts({ opened, closed, promptEntryReason: false, pauseOnTradeClose: true })
        .prompts.map((p) => p.kind),
    ).toEqual(["exit"]);
    const noPause = buildJournalPrompts({
      opened,
      closed,
      promptEntryReason: true,
      pauseOnTradeClose: false,
    });
    expect(noPause.prompts.map((p) => p.kind)).toEqual(["entry"]);
    // Nothing to review means nothing to pause for.
    expect(noPause.reviewed).toEqual([]);
  });
});

describe("mergeJournalPrompts", () => {
  const entry = (journalId: string): JournalPrompt => ({
    kind: "entry",
    id: `entry-${journalId}`,
    journalId,
    position: position(journalId),
  });
  const exit = (journalId: string): JournalPrompt => ({
    kind: "exit",
    id: `exit-${journalId}`,
    journalId,
    trade: trade(journalId, "stop-loss"),
  });

  it("replaces a journal's entry card with its exit card", () => {
    const queue = mergeJournalPrompts(
      { prompts: [entry("j1")], index: 0 },
      [exit("j1")],
      merge,
    );
    expect(queue.prompts).toHaveLength(1);
    expect(queue.prompts[0]!.kind).toBe("exit");
    expect(queue.index).toBe(0);
  });

  it("focuses the trade that paused the run", () => {
    const queue = mergeJournalPrompts(
      { prompts: [exit("j1"), exit("j2")], index: 0 },
      [exit("j3")],
      merge,
    );
    expect(queue.index).toBe(2);
    expect(queue.prompts[queue.index]!.journalId).toBe("j3");
  });

  it("keeps the trader on the card they were writing when nothing paused", () => {
    // An entry prompt arriving must not yank the card away mid-sentence, even
    // though the merge shifts positions around it.
    const queue = mergeJournalPrompts(
      { prompts: [exit("j1"), exit("j2")], index: 0 },
      [entry("j3")],
      { focusLast: false, limit: 12 },
    );
    expect(queue.prompts[queue.index]!.journalId).toBe("j1");
  });

  it("does not queue the same prompt twice", () => {
    const queue = mergeJournalPrompts(
      { prompts: [exit("j1")], index: 0 },
      [exit("j1")],
      merge,
    );
    expect(queue.prompts).toHaveLength(1);
  });

  it("drops the oldest past the cap and still points at a real card", () => {
    const full: JournalQueue = {
      prompts: Array.from({ length: 3 }, (_, i) => exit(`j${i}`)),
      index: 0,
    };
    const queue = mergeJournalPrompts(full, [exit("j9")], { focusLast: true, limit: 3 });
    expect(queue.prompts).toHaveLength(3);
    expect(queue.prompts[0]!.journalId).toBe("j1");
    expect(queue.index).toBe(2);
    expect(queue.prompts[queue.index]).toBeDefined();
  });

  it("leaves the queue alone when nothing arrives", () => {
    const current: JournalQueue = { prompts: [exit("j1")], index: 0 };
    expect(mergeJournalPrompts(current, [], merge)).toBe(current);
  });
});

describe("dismissJournalPrompt", () => {
  const exit = (journalId: string): JournalPrompt => ({
    kind: "exit",
    id: `exit-${journalId}`,
    journalId,
    trade: trade(journalId, "stop-loss"),
  });

  it("settles on a neighbour after dropping the last card in the queue", () => {
    const queue = dismissJournalPrompt({
      prompts: [exit("j1"), exit("j2")],
      index: 1,
    });
    expect(queue.prompts.map((p) => p.journalId)).toEqual(["j1"]);
    expect(queue.index).toBe(0);
  });

  it("empties cleanly", () => {
    expect(dismissJournalPrompt({ prompts: [exit("j1")], index: 0 })).toEqual(
      EMPTY_JOURNAL_QUEUE,
    );
  });
});
