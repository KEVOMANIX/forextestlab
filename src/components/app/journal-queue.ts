import type { ClosedTrade, OpenPosition } from "@/lib/backtest/types";

import type { JournalPrompt } from "./TradeReviewCard";

/**
 * Which trades interrupt a replay run, and how the resulting prompts queue up.
 *
 * Kept apart from the component because the interesting behaviour is all in the
 * merge: a scalp that opens and closes inside one candle, three stops filling
 * within a few hundred milliseconds at speed, or a trader paging back to an
 * earlier card while a new one arrives. Those are worth testing directly rather
 * than through a chart.
 */

export interface JournalQueue {
  prompts: JournalPrompt[];
  index: number;
}

export const EMPTY_JOURNAL_QUEUE: JournalQueue = { prompts: [], index: 0 };

/**
 * True for exits the trader did not choose.
 *
 * Closing by hand already had their attention, and pausing for it is one more
 * click rather than a prompt. `session-end` has its own modal. An ambiguous
 * candle qualifies precisely because the execution policy picked the side.
 */
export function needsReview(trade: ClosedTrade): boolean {
  return (
    trade.intrabarAmbiguous ||
    trade.exitReason === "stop-loss" ||
    trade.exitReason === "take-profit"
  );
}

export function journalIdOf(record: OpenPosition | ClosedTrade): string {
  return record.journalId ?? record.id;
}

/**
 * The prompts a state change produces.
 *
 * A position that opened and closed in the same batch yields only its exit
 * prompt: both refer to one journal row, and two cards editing the same record
 * would race, with the later autosave silently dropping the earlier answer.
 */
export function buildJournalPrompts({
  opened,
  closed,
  promptEntryReason,
  pauseOnTradeClose,
}: {
  opened: OpenPosition[];
  closed: ClosedTrade[];
  promptEntryReason: boolean;
  pauseOnTradeClose: boolean;
}): { prompts: JournalPrompt[]; reviewed: ClosedTrade[] } {
  const reviewed = pauseOnTradeClose ? closed.filter(needsReview) : [];
  const exits: JournalPrompt[] = reviewed.map((trade) => ({
    kind: "exit",
    id: `exit-${trade.id}`,
    journalId: journalIdOf(trade),
    trade,
  }));
  const closedNow = new Set(exits.map((item) => item.journalId));
  const entries: JournalPrompt[] = promptEntryReason
    ? opened
        .filter((position) => !closedNow.has(journalIdOf(position)))
        .map((position) => ({
          kind: "entry",
          id: `entry-${position.id}`,
          journalId: journalIdOf(position),
          position,
        }))
    : [];
  return { prompts: [...entries, ...exits], reviewed };
}

/**
 * Fold new prompts into the queue.
 *
 * `focusLast` is set when something paused the run: the card jumps to the trade
 * that stopped it. Otherwise the trader keeps their place, because an entry
 * prompt arriving must not yank the card off whatever they are writing.
 */
export function mergeJournalPrompts(
  current: JournalQueue,
  incoming: JournalPrompt[],
  { focusLast, limit }: { focusLast: boolean; limit: number },
): JournalQueue {
  if (incoming.length === 0) return current;
  const arriving = new Set(incoming.map((item) => item.id));
  // An entry prompt is superseded by that journal's exit prompt, for the same
  // reason two cards for one row cannot coexist.
  const superseded = new Set(
    incoming.filter((item) => item.kind === "exit").map((item) => item.journalId),
  );
  const kept = current.prompts.filter(
    (item) =>
      !arriving.has(item.id) &&
      !(item.kind === "entry" && superseded.has(item.journalId)),
  );
  const focused = current.prompts[current.index] ?? null;
  const prompts = [...kept, ...incoming].slice(-limit);
  if (focusLast) return { prompts, index: prompts.length - 1 };
  // Follow the card the trader was on, wherever the merge moved it.
  const stillThere = focused
    ? prompts.findIndex((item) => item.id === focused.id)
    : -1;
  return {
    prompts,
    index: stillThere >= 0 ? stillThere : Math.min(current.index, prompts.length - 1),
  };
}

/** Drop the prompt being shown and settle on a neighbour. */
export function dismissJournalPrompt(current: JournalQueue): JournalQueue {
  const prompts = current.prompts.filter((_, index) => index !== current.index);
  return { prompts, index: Math.min(current.index, Math.max(0, prompts.length - 1)) };
}
