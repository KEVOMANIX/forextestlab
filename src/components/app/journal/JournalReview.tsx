"use client";

import Image from "next/image";

import { CandlestickChart, NotebookPen, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";

import {
  averageConfidence,
  isJournaled,
  ruleAdherence,
} from "@/components/app/journal-utils";
import type { TradeJournal } from "@/lib/backtest/types";
import { formatNewYorkDateTime } from "@/lib/date-time";
import { TradeReviewChartModal } from "./TradeReviewChartModal";

export interface ReviewRecord {
  journalId: string;
  number: number;
  direction: "long" | "short";
  entryTime: number;
  exitTime: number;
  symbol: string | null;
  entryPrice: string;
  exitPrice: string;
  stopLoss: string | null;
  takeProfit: string | null;
  pnl: string | null;
  maxFavorablePnl: string | null;
  maxAdversePnl: string | null;
  journal: TradeJournal;
}

type Breakdown = { label: string; trades: number; wins: number; pnl: number; grossWin: number; grossLoss: number; r: number; rCount: number };

function breakdown(records: ReviewRecord[], labels: (record: ReviewRecord) => string[]): Breakdown[] {
  const rows = new Map<string, Breakdown>();
  for (const record of records) for (const label of labels(record).filter(Boolean)) {
    const row = rows.get(label) ?? { label, trades: 0, wins: 0, pnl: 0, grossWin: 0, grossLoss: 0, r: 0, rCount: 0 };
    const pnl = Number(record.pnl ?? 0);
    const r = Number(record.journal.realizedR);
    row.trades += 1; row.wins += pnl > 0 ? 1 : 0; row.pnl += pnl; row.grossWin += Math.max(0, pnl); row.grossLoss += Math.abs(Math.min(0, pnl));
    if (Number.isFinite(r)) { row.r += r; row.rCount += 1; }
    rows.set(label, row);
  }
  return [...rows.values()].sort((a, b) => (b.rCount ? b.r / b.rCount : b.pnl) - (a.rCount ? a.r / a.rCount : a.pnl));
}

/**
 * The read-only half of the journal. Until now this view only existed for the
 * sample report, so a trader who previewed the sample and then journaled a real
 * session was shown a form instead of the review they had been promised.
 */
export function JournalReview({
  sessionId,
  records,
  onEdit,
}: {
  sessionId?: string;
  records: ReviewRecord[];
  onEdit: (journalId: string) => void;
}) {
  const journals = records.map((record) => record.journal);
  const journaled = journals.filter(isJournaled).length;
  const adherence = ruleAdherence(journals);
  const confidence = averageConfidence(journals);
  const written = records.filter((record) => isJournaled(record.journal));
  const strategies = breakdown(records, (record) => record.journal.strategy ? [record.journal.strategy] : record.journal.setupTags);
  const mistakes = breakdown(records, (record) => record.journal.mistakeTags);
  const goodLosses = records.filter((record) => Number(record.pnl ?? 0) < 0 && ["A", "B"].includes(record.journal.grade ?? "")).length;
  const badWins = records.filter((record) => Number(record.pnl ?? 0) > 0 && ["C", "D"].includes(record.journal.grade ?? "")).length;
  const [chartRecord, setChartRecord] = useState<ReviewRecord | null>(null);

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

      <div className="grid gap-3 lg:grid-cols-2">
        <BreakdownTable title="Strategy performance" empty="Assign a strategy or setup tag to compare your playbooks." rows={strategies} />
        <BreakdownTable title="Mistake cost" empty="Add mistake tags to see which behaviors cost the most." rows={mistakes} />
      </div>

      <div className="grid gap-3 rounded-xl border app-border p-4 sm:grid-cols-3">
        <div><p className="text-[11px] uppercase tracking-wide app-muted">Good losses</p><p className="mt-1 font-mono text-xl font-semibold text-brand-300">{goodLosses}</p></div>
        <div><p className="text-[11px] uppercase tracking-wide app-muted">Bad wins</p><p className="mt-1 font-mono text-xl font-semibold text-amber-300">{badWins}</p></div>
        <div><p className="text-[11px] uppercase tracking-wide app-muted">Process signal</p><p className="mt-1 text-sm font-semibold">{badWins > goodLosses ? "Winning is masking weak execution" : "Execution quality supports the results"}</p></div>
      </div>

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
              <ReviewCard key={record.journalId} record={record} onEdit={onEdit} onViewChart={() => setChartRecord(record)} chartAvailable={Boolean(sessionId || record.journal.beforeEntrySnapshot || record.journal.afterExitSnapshot)} />
            ))}
        </div>
      )}
      {chartRecord && <TradeReviewChartModal sessionId={sessionId} record={chartRecord} onClose={() => setChartRecord(null)} />}
    </div>
  );
}

function BreakdownTable({ title, empty, rows }: { title: string; empty: string; rows: Breakdown[] }) {
  return <section className="overflow-hidden rounded-xl border app-border"><h3 className="border-b app-border px-4 py-3 text-xs font-semibold">{title}</h3>{rows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-[11px]"><thead className="app-muted"><tr><th className="px-4 py-2">Name</th><th>Trades</th><th>Win rate</th><th>PF</th><th className="pr-4">Avg R</th></tr></thead><tbody>{rows.slice(0, 8).map((row) => <tr key={row.label} className="border-t app-border"><td className="max-w-44 truncate px-4 py-2 font-semibold">{row.label}</td><td>{row.trades}</td><td>{Math.round(row.wins / row.trades * 100)}%</td><td className="font-mono">{row.grossLoss ? (row.grossWin / row.grossLoss).toFixed(2) : row.grossWin ? "∞" : "—"}</td><td className={`pr-4 font-mono ${row.r >= 0 ? "text-profit" : "text-loss"}`}>{row.rCount ? `${row.r / row.rCount >= 0 ? "+" : ""}${(row.r / row.rCount).toFixed(2)}R` : "—"}</td></tr>)}</tbody></table></div> : <p className="px-4 py-8 text-center text-xs app-muted">{empty}</p>}</section>;
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
  onViewChart,
  chartAvailable,
}: {
  record: ReviewRecord;
  onEdit: (journalId: string) => void;
  onViewChart: () => void;
  chartAvailable: boolean;
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
              positive ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"
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
            {(journal.strategy || journal.grade) && <p className="mt-1 text-[11px] text-brand-300">{journal.strategy || "Unassigned strategy"}{journal.grade ? ` · Grade ${journal.grade}` : ""}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {pnl !== null && (
            <p
              className={`font-mono text-sm font-semibold ${positive ? "text-profit" : "text-loss"}`}
            >
              {positive ? "+" : "−"}${Math.abs(pnl).toFixed(2)}
            </p>
          )}
          <button type="button" onClick={onViewChart} disabled={!chartAvailable} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-400/30 bg-brand-400/[0.07] px-2.5 py-1 text-[11px] font-semibold text-brand-300 transition-colors hover:bg-brand-400/[0.13] disabled:cursor-not-allowed disabled:opacity-40" title={chartAvailable ? "Open interactive marked trade chart" : "Chart data is unavailable for this trade"}><CandlestickChart size={12} /> View chart</button>
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
              className="rounded-md bg-loss/[0.08] px-2 py-1 text-[11px] font-semibold text-loss"
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

      {journal.lesson.trim() && <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">Next-trade action</p><p className="mt-1 text-xs leading-5">{journal.lesson}</p></div>}
      {journal.attachments.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2">{journal.attachments.map((attachment) => <Image unoptimized width={320} height={96} key={attachment.id} src={attachment.dataUrl} alt={attachment.name} className="h-24 w-full rounded-lg border app-border object-cover" />)}</div>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t app-border pt-3 text-[11px] app-muted">
        <span>
          {followed}/{journal.ruleChecklist.length} rules followed
        </span>
        <span>
          {journal.emotion || "No emotion recorded"}
          {journal.confidence ? ` · confidence ${journal.confidence}/5` : ""}
        </span>
        <span className="font-mono">MFE {record.maxFavorablePnl === null ? "—" : Number(record.maxFavorablePnl).toFixed(2)} · MAE {record.maxAdversePnl === null ? "—" : Number(record.maxAdversePnl).toFixed(2)}</span>
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
