"use client";

import { NotebookPen, TrendingDown, TrendingUp } from "lucide-react";

import {
  averageConfidence,
  isJournaled,
  ruleAdherence,
} from "@/components/app/journal-utils";
import type { TradeJournal } from "@/lib/backtest/types";
import { formatNewYorkDateTime } from "@/lib/date-time";

export interface ReviewRecord {
  journalId: string;
  number: number;
  direction: "long" | "short";
  entryTime: number;
  pnl: string | null;
  journal: TradeJournal;
}

/**
 * The read-only half of the journal. Until now this view only existed for the
 * sample report, so a trader who previewed the sample and then journaled a real
 * session was shown a form instead of the review they had been promised.
 */
export function JournalReview({
  records,
  onEdit,
}: {
  records: ReviewRecord[];
  onEdit: (journalId: string) => void;
}) {
  const journals = records.map((record) => record.journal);
  const journaled = journals.filter(isJournaled).length;
  const adherence = ruleAdherence(journals);
  const confidence = averageConfidence(journals);
  const written = records.filter((record) => isJournaled(record.journal));

  return (
    <div className="space-y-4 p-4">
      <dl className="grid gap-px overflow-hidden rounded-xl bg-[var(--app-border-color,rgba(255,255,255,0.06))] sm:grid-cols-3">
        <Stat
          label="Journal coverage"
          value={`${journaled} / ${records.length}`}
          detail={
            journaled === records.length
              ? "Every trade reviewed"
              : `${records.length - journaled} still to write up`
          }
        />
        <Stat
          label="Rule adherence"
          value={adherence === null ? "—" : `${adherence}%`}
          detail="Across all checklist items"
        />
        <Stat
          label="Average confidence"
          value={confidence === null ? "—" : `${confidence.toFixed(1)} / 5`}
          detail="Confidence recorded at entry"
        />
      </dl>

      {written.length === 0 ? (
        <div className="rounded-xl bg-[var(--app-panel-2)]/55 px-4 py-10 text-center">
          <NotebookPen size={20} className="mx-auto text-brand-300" aria-hidden />
          <p className="mt-3 text-sm font-semibold">No write-ups yet</p>
          <p className="mt-1 text-xs app-muted">
            Switch to Edit and record why you took a trade and what you would
            repeat. Your notes appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {written
            .slice()
            .reverse()
            .map((record) => (
              <ReviewCard key={record.journalId} record={record} onEdit={onEdit} />
            ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-[var(--app-panel-2)]/60 p-4">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] app-muted">
        {label}
      </dt>
      <dd className="mt-2 font-mono text-xl font-semibold">{value}</dd>
      <dd className="mt-1 text-[11px] app-muted">{detail}</dd>
    </div>
  );
}

function ReviewCard({
  record,
  onEdit,
}: {
  record: ReviewRecord;
  onEdit: (journalId: string) => void;
}) {
  const { journal } = record;
  const pnl = record.pnl === null ? null : Number(record.pnl);
  const positive = (pnl ?? 0) >= 0;
  const followed = journal.ruleChecklist.filter((rule) => rule.followed).length;

  return (
    <article className="rounded-2xl border app-border bg-[var(--app-panel)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
              positive ? "bg-brand-400/10 text-brand-300" : "bg-bear/10 text-bear"
            }`}
          >
            {positive ? <TrendingUp size={16} aria-hidden /> : <TrendingDown size={16} aria-hidden />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Trade {record.number} ·{" "}
              {record.direction === "long" ? "Long" : "Short"}
            </p>
            <p className="mt-1 text-[11px] app-muted">
              {formatNewYorkDateTime(record.entryTime, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {pnl !== null && (
            <p
              className={`font-mono text-sm font-semibold ${positive ? "text-brand-300" : "text-bear"}`}
            >
              {positive ? "+" : "−"}${Math.abs(pnl).toFixed(2)}
            </p>
          )}
          <button
            type="button"
            onClick={() => onEdit(record.journalId)}
            className="rounded-lg border app-border px-2 py-1 text-[11px] app-muted transition-colors hover:text-brand-300"
          >
            Edit
          </button>
        </div>
      </div>

      {(journal.setupTags.length > 0 || journal.mistakeTags.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {journal.setupTags.map((tag) => (
            <span
              key={`s-${tag}`}
              className="rounded-md bg-brand-400/[0.08] px-2 py-1 text-[11px] font-semibold text-brand-300"
            >
              {tag}
            </span>
          ))}
          {journal.mistakeTags.map((tag) => (
            <span
              key={`m-${tag}`}
              className="rounded-md bg-bear/[0.08] px-2 py-1 text-[11px] font-semibold text-bear"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {(journal.entryReason.trim() || journal.exitReview.trim()) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Passage title="Entry thesis" body={journal.entryReason} />
          <Passage title="Exit review" body={journal.exitReview} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t app-border pt-3 text-[11px] app-muted">
        <span>
          {followed}/{journal.ruleChecklist.length} rules followed
        </span>
        <span>
          {journal.emotion || "No emotion recorded"}
          {journal.confidence ? ` · confidence ${journal.confidence}/5` : ""}
        </span>
        <span className="font-mono">
          {journal.realizedR
            ? `${Number(journal.realizedR) >= 0 ? "+" : ""}${journal.realizedR}R`
            : "—"}
        </span>
      </div>
    </article>
  );
}

function Passage({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl bg-[var(--app-panel-2)]/55 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] app-muted">
        {title}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-5">
        {body.trim() || <span className="app-muted">Not recorded</span>}
      </p>
    </div>
  );
}
