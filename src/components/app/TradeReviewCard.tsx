"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BellOff,
  Check,
  ChevronLeft,
  ChevronRight,
  NotebookPen,
  Save,
  X,
} from "lucide-react";

import type {
  ClosedTrade,
  OpenPosition,
  TradeJournal,
  TradeJournalUpdate,
} from "@/lib/backtest/types";
import { emptyTradeJournal } from "@/lib/backtest/trade-journal";

/**
 * The journal prompt that sits on the chart while replay is paused.
 *
 * Two moments are worth capturing, and they are deliberately separate. The
 * reason for a trade is asked at entry, before the outcome exists to colour it
 * — answer "did I wait for my trigger?" after seeing a winner and the answer is
 * always yes. The review is asked at exit, when the outcome is the subject.
 *
 * It is a card rather than a modal on purpose. A dialog that seizes the screen
 * on every stop-out gets dismissed reflexively by the fifth trade, which trains
 * exactly the habit journalling is meant to build. Replay can resume with the
 * card still open; nothing here blocks the session.
 *
 * It is also deliberately small. The card sits over the candles the trade was
 * taken on, and those candles are the context the answer is written from — a
 * panel wide enough to be comfortable is a panel covering the evidence.
 */

export type JournalPrompt =
  | { kind: "entry"; id: string; journalId: string; position: OpenPosition }
  | { kind: "exit"; id: string; journalId: string; trade: ClosedTrade };

const EXIT_LABELS: Record<string, string> = {
  "stop-loss": "Stop loss",
  "take-profit": "Take profit",
  manual: "Closed by hand",
  "session-end": "Session ended",
};

function editable(journal: TradeJournal): TradeJournalUpdate {
  return {
    entryReason: journal.entryReason,
    exitReview: journal.exitReview,
    setupTags: [...journal.setupTags],
    mistakeTags: [...journal.mistakeTags],
    emotion: journal.emotion,
    confidence: journal.confidence,
    ruleChecklist: journal.ruleChecklist.map((rule) => ({ ...rule })),
    validity: journal.validity,
  };
}

function parseTags(value: string): string[] {
  return [
    ...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean)),
  ].slice(0, 12);
}

function money(value: string | number | null | undefined, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `${amount >= 0 ? "+" : ""}${amount.toFixed(2)} ${currency}`;
}

function promptJournal(prompt: JournalPrompt): TradeJournal {
  if (prompt.kind === "entry") {
    const { position } = prompt;
    return (
      position.journal ??
      emptyTradeJournal(position.entryPrice, position.stopLoss, position.takeProfit)
    );
  }
  const { trade } = prompt;
  return (
    trade.journal ??
    emptyTradeJournal(trade.entryPrice, trade.stopLoss, trade.takeProfit)
  );
}

export function TradeReviewCard({
  prompts,
  index,
  symbol,
  accountCurrency,
  anonymous,
  onIndexChange,
  onSave,
  onOpenJournal,
  onDismiss,
  onMute,
}: {
  prompts: JournalPrompt[];
  index: number;
  symbol: string;
  accountCurrency: string;
  /** Anonymous sessions have nowhere to persist a journal. */
  anonymous: boolean;
  onIndexChange: (index: number) => void;
  onSave: (journalId: string, journal: TradeJournalUpdate) => Promise<void> | void;
  onOpenJournal: () => void;
  onDismiss: () => void;
  onMute: () => void;
}) {
  const prompt = prompts[Math.min(index, prompts.length - 1)];
  const journal = prompt ? promptJournal(prompt) : null;

  const [draft, setDraft] = useState<TradeJournalUpdate | null>(
    journal ? editable(journal) : null,
  );
  const [mistakeText, setMistakeText] = useState(
    journal ? journal.mistakeTags.join(", ") : "",
  );
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const savedHash = useRef("");

  // Reload the draft when the card pages to another trade, keyed on the journal
  // rather than the array position so paging back and forth is lossless.
  const journalId = prompt?.journalId ?? null;
  useEffect(() => {
    if (!journal) return;
    const next = editable(journal);
    setDraft(next);
    setMistakeText(next.mistakeTags.join(", "));
    savedHash.current = JSON.stringify(next);
    setSaveState("saved");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalId]);

  useEffect(() => {
    if (!journalId || !draft || anonymous) return;
    const hash = JSON.stringify(draft);
    if (hash === savedHash.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        await onSave(journalId, draft);
        savedHash.current = hash;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [anonymous, draft, journalId, onSave]);

  const stats = useMemo(() => {
    if (prompt?.kind !== "exit") return null;
    const { trade } = prompt;
    const risk = Number(trade.initialRiskAmount ?? Number.NaN);
    const pnl = Number(trade.pnl);
    return {
      pnl,
      // R is only meaningful when the trade actually had a defined risk.
      r: Number.isFinite(risk) && risk > 0 ? pnl / risk : null,
      best: trade.maxFavorablePnl,
      worst: trade.maxAdversePnl,
      pips: trade.pips,
    };
  }, [prompt]);

  if (!prompt || !draft) return null;

  const patch = (value: Partial<TradeJournalUpdate>) =>
    setDraft((current) => (current ? { ...current, ...value } : current));

  const isExit = prompt.kind === "exit";
  const direction = isExit ? prompt.trade.direction : prompt.position.direction;
  const long = direction === "long";
  const lots = isExit ? prompt.trade.lots : prompt.position.lots;
  const won = isExit && Number(prompt.trade.pnl) >= 0;

  return (
    <aside
      data-testid="trade-review-card"
      aria-label={isExit ? "Review the closed trade" : "Why this trade?"}
      className="pointer-events-auto absolute right-16 top-3 z-[46] flex w-[17rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg border app-border bg-[var(--app-panel-solid)] text-[11px] shadow-2xl"
    >
      <header className="flex items-center gap-1.5 border-b app-border px-2 py-1.5">
        <span
          className={`shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide ${
            isExit
              ? won
                ? "bg-brand-400/15 text-[var(--app-accent-text)]"
                : "bg-bear/15 text-bear"
              : "bg-[var(--app-panel-2)] app-muted"
          }`}
        >
          {isExit ? EXIT_LABELS[prompt.trade.exitReason] ?? "Closed" : "Opened"}
        </span>
        <span className="min-w-0 truncate font-mono text-[11px] font-semibold">
          {symbol} · {long ? "BUY" : "SELL"} {lots}
        </span>
        {prompts.length > 1 && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[9px] app-muted">
            <button
              type="button"
              aria-label="Previous trade"
              disabled={index === 0}
              onClick={() => onIndexChange(index - 1)}
              className="grid h-4 w-4 place-items-center rounded hover:bg-[var(--app-panel-2)] disabled:opacity-30"
            >
              <ChevronLeft size={11} aria-hidden />
            </button>
            {index + 1} / {prompts.length}
            <button
              type="button"
              aria-label="Next trade"
              disabled={index >= prompts.length - 1}
              onClick={() => onIndexChange(index + 1)}
              className="grid h-4 w-4 place-items-center rounded hover:bg-[var(--app-panel-2)] disabled:opacity-30"
            >
              <ChevronRight size={11} aria-hidden />
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={`grid h-5 w-5 shrink-0 place-items-center rounded app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)] ${
            prompts.length > 1 ? "" : "ml-auto"
          }`}
        >
          <X size={12} aria-hidden />
        </button>
      </header>

      <div className="space-y-2 p-2">
        {stats && (
          <dl className="grid grid-cols-4 gap-1.5 rounded-md bg-[var(--app-panel-2)] px-2 py-1.5 text-center">
            <Stat
              label="P&L"
              value={money(stats.pnl, accountCurrency).replace(` ${accountCurrency}`, "")}
              tone={stats.pnl >= 0 ? "good" : "bad"}
            />
            <Stat
              label="R"
              value={stats.r == null ? "—" : `${stats.r >= 0 ? "+" : ""}${stats.r.toFixed(2)}`}
              tone={stats.r == null ? "flat" : stats.r >= 0 ? "good" : "bad"}
            />
            <Stat label="Pips" value={stats.pips} tone="flat" />
            <Stat
              label="Best / worst"
              value={`${Number(stats.best ?? 0).toFixed(0)} / ${Number(stats.worst ?? 0).toFixed(0)}`}
              tone="flat"
            />
          </dl>
        )}

        {isExit && draft.entryReason.trim() && (
          // Shown, not editable: this was written before the outcome was known,
          // and rewriting it now would quietly turn a record into a rationalisation.
          <div className="rounded-md border app-border px-2 py-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wide app-muted">
              Why you took it
            </p>
            <p className="mt-0.5 leading-4">{draft.entryReason}</p>
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-[10px] font-medium app-muted">
            {isExit ? "What happened?" : "Why this trade?"}
          </span>
          <textarea
            rows={2}
            // Only the exit card takes focus. The entry prompt arrives while
            // replay may still be running, and stealing the caret there would
            // send the next Space or `b` into a textarea instead of the market.
            autoFocus={isExit}
            value={isExit ? draft.exitReview : draft.entryReason}
            onChange={(event) =>
              patch(
                isExit
                  ? { exitReview: event.target.value }
                  : { entryReason: event.target.value },
              )
            }
            placeholder={
              isExit
                ? "Did it play out as planned?"
                : "The setup, the trigger, and what invalidates it."
            }
            className="w-full resize-none rounded-md border app-border bg-[var(--app-panel-2)] px-2 py-1.5 leading-4 text-[var(--app-text)] placeholder:app-muted focus:border-brand-400/60"
          />
        </label>

        {isExit ? (
          <>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium app-muted">
                Mistakes (comma separated)
              </span>
              <input
                value={mistakeText}
                onChange={(event) => {
                  setMistakeText(event.target.value);
                  patch({ mistakeTags: parseTags(event.target.value) });
                }}
                placeholder="early entry, moved stop"
                className="w-full rounded-md border app-border bg-[var(--app-panel-2)] px-2 py-1 text-[var(--app-text)] placeholder:app-muted focus:border-brand-400/60"
              />
            </label>
            <div className="flex gap-1">
              {(["valid", "invalid", "experimental"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => patch({ validity: value })}
                  aria-pressed={draft.validity === value}
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold capitalize ${
                    draft.validity === value
                      ? "border-brand-400/40 bg-brand-400/10 text-brand-300"
                      : "app-border app-muted hover:text-[var(--app-text)]"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </>
        ) : (
          <ul className="space-y-0.5">
            {draft.ruleChecklist.map((rule, position) => (
              <li key={rule.id}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={rule.followed}
                  onClick={() =>
                    patch({
                      ruleChecklist: draft.ruleChecklist.map((entry, i) =>
                        i === position ? { ...entry, followed: !entry.followed } : entry,
                      ),
                    })
                  }
                  className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left leading-4 hover:bg-[var(--app-panel-2)]"
                >
                  <span
                    aria-hidden
                    className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm border ${
                      rule.followed
                        ? "border-brand-400 bg-brand-400/20 text-brand-300"
                        : "app-border"
                    }`}
                  >
                    {rule.followed && <Check size={9} />}
                  </span>
                  {rule.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex items-center gap-1.5 border-t app-border px-2 py-1 text-[9px]">
        <span
          className={`inline-flex items-center gap-1 ${
            saveState === "error" ? "text-bear" : "app-muted"
          }`}
        >
          {saveState === "saved" ? <Check size={10} /> : <Save size={10} />}
          {anonymous
            ? "Sign in to save"
            : saveState === "saving"
              ? "Autosaving…"
              : saveState === "error"
                ? "Autosave failed"
                : "Saved"}
        </span>
        <button
          type="button"
          onClick={onMute}
          title="Stop prompting for the rest of this session"
          className="ml-auto inline-flex items-center gap-1 rounded px-1 py-0.5 app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"
        >
          <BellOff size={10} aria-hidden /> Not this session
        </button>
        <button
          type="button"
          onClick={onOpenJournal}
          className="inline-flex items-center gap-1 rounded bg-[var(--app-panel-2)] px-1.5 py-0.5 font-semibold hover:text-[var(--app-accent-text)]"
        >
          <NotebookPen size={10} aria-hidden /> Full journal
        </button>
      </footer>
    </aside>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "flat";
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[8px] uppercase tracking-wide app-muted">{label}</dt>
      <dd
        className={`truncate font-mono text-[11px] font-semibold ${
          tone === "good"
            ? "text-[var(--app-accent-text)]"
            : tone === "bad"
              ? "text-bear"
              : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
