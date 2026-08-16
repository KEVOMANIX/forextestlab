import { describe, expect, it } from "vitest";

import {
  averageConfidence,
  collectTags,
  isJournaled,
  mergeTags,
  normaliseTag,
  removeTag,
  ruleAdherence,
} from "./journal-utils";
import type { TradeJournalUpdate } from "@/lib/backtest/types";

const journal = (patch: Partial<TradeJournalUpdate> = {}): TradeJournalUpdate => ({
  entryReason: "",
  exitReview: "",
  setupTags: [],
  mistakeTags: [],
  emotion: "",
  confidence: null,
  ruleChecklist: [],
  validity: "valid",
  ...patch,
});

describe("tag handling", () => {
  it("collapses whitespace and clips to the server's limit", () => {
    expect(normaliseTag("  London   open  ")).toBe("London open");
    expect(normaliseTag("x".repeat(40))).toHaveLength(32);
  });

  it("keeps the first spelling and drops case-insensitive duplicates", () => {
    expect(mergeTags(["London open"], ["london open", "FOMO", "fomo"])).toEqual([
      "London open",
      "FOMO",
    ]);
  });

  it("drops blanks and caps the list at twelve", () => {
    expect(mergeTags([], ["  ", "a", ""])).toEqual(["a"]);
    expect(
      mergeTags([], Array.from({ length: 20 }, (_, i) => `tag${i}`)),
    ).toHaveLength(12);
  });

  it("removes a tag regardless of how it is capitalised", () => {
    expect(removeTag(["Breakout", "FOMO"], "breakout")).toEqual(["FOMO"]);
  });

  it("gathers every distinct tag across a session", () => {
    expect(
      collectTags(
        [
          journal({ setupTags: ["Breakout", "London open"] }),
          journal({ setupTags: ["breakout", "Pullback"] }),
        ],
        "setupTags",
      ),
    ).toEqual(["Breakout", "London open", "Pullback"]);
  });
});

describe("journal coverage", () => {
  it("counts a trade as journaled only once the trader has written something", () => {
    expect(isJournaled(journal())).toBe(false);
    // Rules and confidence are pre-filled, so they must not count on their own.
    expect(
      isJournaled(
        journal({
          confidence: 4,
          ruleChecklist: [{ id: "r1", label: "Risk defined", followed: true }],
        }),
      ),
    ).toBe(false);
    expect(isJournaled(journal({ entryReason: "  swept liquidity " }))).toBe(true);
    expect(isJournaled(journal({ setupTags: ["breakout"] }))).toBe(true);
    expect(isJournaled(journal({ emotion: "calm" }))).toBe(true);
  });
});

describe("journal roll-ups", () => {
  it("reports rule adherence as a percentage, or nothing without rules", () => {
    expect(ruleAdherence([journal()])).toBeNull();
    expect(
      ruleAdherence([
        journal({
          ruleChecklist: [
            { id: "a", label: "a", followed: true },
            { id: "b", label: "b", followed: false },
            { id: "c", label: "c", followed: true },
            { id: "d", label: "d", followed: true },
          ],
        }),
      ]),
    ).toBe(75);
  });

  it("averages only the trades that recorded a confidence", () => {
    expect(averageConfidence([journal(), journal()])).toBeNull();
    expect(
      averageConfidence([
        journal({ confidence: 4 }),
        journal({ confidence: 2 }),
        journal(),
      ]),
    ).toBe(3);
  });
});
