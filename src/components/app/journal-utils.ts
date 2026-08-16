import type { TradeJournal, TradeJournalUpdate } from "@/lib/backtest/types";

/** The server caps a tag at 32 characters; keep the field honest about it. */
export const MAX_TAG_LENGTH = 32;
export const MAX_TAGS = 12;

/**
 * A short list of feelings covers most of what traders record, and picking from
 * it keeps the field aggregatable. Anything else can still be typed.
 */
export const EMOTION_PRESETS = [
  "Calm",
  "Confident",
  "Patient",
  "Anxious",
  "Impatient",
  "Frustrated",
  "Hesitant",
  "Greedy",
] as const;

/** Trim, collapse runs of whitespace, and clip to what the server accepts. */
export function normaliseTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
}

/**
 * Add tags to a list, dropping blanks and case-insensitive duplicates. The
 * first spelling of a tag wins, so "London open" does not become a second tag
 * beside "london open" — the autocomplete then keeps everyone on one spelling,
 * which is what makes tags worth grouping on later.
 */
export function mergeTags(existing: string[], incoming: string[]): string[] {
  const seen = new Map<string, string>();
  for (const tag of [...existing, ...incoming]) {
    const clean = normaliseTag(tag);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, clean);
  }
  return [...seen.values()].slice(0, MAX_TAGS);
}

export function removeTag(tags: string[], tag: string): string[] {
  const key = normaliseTag(tag).toLowerCase();
  return tags.filter((item) => normaliseTag(item).toLowerCase() !== key);
}

/**
 * Whether a trade has actually been journaled. Rules and confidence are
 * pre-filled or defaulted, so they cannot count — only something the trader
 * wrote or chose does.
 */
export function isJournaled(journal: TradeJournal | TradeJournalUpdate): boolean {
  return Boolean(
    journal.entryReason.trim() ||
      journal.exitReview.trim() ||
      journal.setupTags.length ||
      journal.mistakeTags.length ||
      journal.emotion.trim(),
  );
}

/** Every distinct tag used across a session, newest spelling first seen wins. */
export function collectTags(
  journals: Array<TradeJournal | TradeJournalUpdate>,
  field: "setupTags" | "mistakeTags",
): string[] {
  return mergeTags(
    [],
    journals.flatMap((journal) => journal[field]),
  ).sort((a, b) => a.localeCompare(b));
}

export function ruleAdherence(
  journals: Array<TradeJournal | TradeJournalUpdate>,
): number | null {
  const rules = journals.flatMap((journal) => journal.ruleChecklist);
  if (!rules.length) return null;
  return Math.round(
    (rules.filter((rule) => rule.followed).length / rules.length) * 100,
  );
}

export function averageConfidence(
  journals: Array<TradeJournal | TradeJournalUpdate>,
): number | null {
  const scores = journals
    .map((journal) => journal.confidence)
    .filter((score): score is number => typeof score === "number");
  if (!scores.length) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
