"use client";

import { CandlestickChart, NotebookPen, Pencil } from "lucide-react";
import { useState } from "react";

import { averageConfidence, isJournaled, ruleAdherence } from "@/components/app/journal-utils";
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
    row.trades += 1;
    row.wins += pnl > 0 ? 1 : 0;
    row.pnl += pnl;
    row.grossWin += Math.max(0, pnl);
    row.grossLoss += Math.abs(Math.min(0, pnl));
    if (Number.isFinite(r)) { row.r += r; row.rCount += 1; }
    rows.set(label, row);
  }
  return [...rows.values()].sort((a, b) => (b.rCount ? b.r / b.rCount : b.pnl) - (a.rCount ? a.r / a.rCount : a.pnl));
}

export function JournalReview({ sessionId, records, onEdit }: { sessionId?: string; records: ReviewRecord[]; onEdit: (journalId: string) => void }) {
  const journals = records.map((record) => record.journal);
  const journaled = journals.filter(isJournaled).length;
  const adherence = ruleAdherence(journals);
  const confidence = averageConfidence(journals);
  const written = records.filter((record) => isJournaled(record.journal));
  const performanceRecords = records.filter((record) => record.journal.validity !== "experimental");
  const strategies = breakdown(performanceRecords, (record) => record.journal.strategy ? [record.journal.strategy] : record.journal.setupTags);
  const mistakes = breakdown(performanceRecords, (record) => record.journal.mistakeTags);
  const goodLosses = performanceRecords.filter((record) => Number(record.pnl ?? 0) < 0 && ["A", "B"].includes(record.journal.grade ?? "")).length;
  const badWins = performanceRecords.filter((record) => Number(record.pnl ?? 0) > 0 && ["C", "D"].includes(record.journal.grade ?? "")).length;
  const [chartRecord, setChartRecord] = useState<ReviewRecord | null>(null);
  const processMessage = badWins > goodLosses
    ? `${badWins} winning trade${badWins === 1 ? "" : "s"} broke the process, compared with ${goodLosses} well-executed loss${goodLosses === 1 ? "" : "es"}.`
    : `${goodLosses} losing trade${goodLosses === 1 ? "" : "s"} followed the process, compared with ${badWins} poorly executed win${badWins === 1 ? "" : "s"}.`;

  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border app-border bg-[var(--app-panel)] p-5">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Rule adherence</p>
              <p className="mt-2 font-mono text-3xl font-semibold">{adherence === null ? "—" : `${adherence}%`}</p>
              <p className="mt-1 text-xs app-muted">{journaled} of {records.length} trades reviewed</p>
            </div>
            <div
              className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
              style={{ background: `conic-gradient(var(--app-accent) 0 ${adherence ?? 0}%, var(--app-panel-2) ${adherence ?? 0}% 100%)` }}
              role="img"
              aria-label={adherence === null ? "Rule adherence unavailable" : `${adherence}% rule adherence`}
            >
              <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--app-panel)] font-mono text-sm font-semibold">{adherence === null ? "—" : adherence}</span>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <MiniStat label="Average confidence" value={confidence === null ? "—" : `${confidence.toFixed(1)} / 5`} />
            <MiniStat label="Still to review" value={String(Math.max(0, records.length - journaled))} />
          </div>
        </section>

        <section className="rounded-2xl border app-border bg-[var(--app-panel)] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Outcome versus execution</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniStat label="Good losses" value={String(goodLosses)} tone="profit" />
            <MiniStat label="Bad wins" value={String(badWins)} tone="warning" />
          </div>
          <p className="mt-4 border-l-2 border-brand-400 pl-3 text-xs leading-5 app-muted">{processMessage}</p>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b app-border px-4 py-3">
          <div><h3 className="text-sm font-semibold">Decision audit</h3><p className="mt-1 text-[11px] app-muted">Compare execution quality with each trade result.</p></div>
          <span className="font-mono text-[11px] app-muted">{written.length} reviewed</span>
        </div>
        {written.length === 0 ? (
          <div className="px-4 py-10 text-center"><NotebookPen size={20} className="mx-auto text-brand-300" aria-hidden /><p className="mt-3 text-sm font-semibold">No write-ups yet</p><p className="mt-1 text-xs app-muted">Edit a trade to record its thesis, execution grade, and lesson.</p></div>
        ) : (
          <div>
            {written.slice().reverse().map((record) => (
              <AuditRow
                key={record.journalId}
                record={record}
                onEdit={() => onEdit(record.journalId)}
                onViewChart={() => setChartRecord(record)}
                chartAvailable={Boolean(sessionId || record.journal.beforeEntrySnapshot || record.journal.afterExitSnapshot)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <BreakdownTable title="Strategy performance" empty="Assign a strategy or setup tag to compare playbooks." rows={strategies} />
        <BreakdownTable title="Mistake cost" empty="Add mistake tags to compare recurring errors." rows={mistakes} />
      </div>
      {chartRecord && <TradeReviewChartModal sessionId={sessionId} record={chartRecord} onClose={() => setChartRecord(null)} />}
    </div>
  );
}

function AuditRow({ record, onEdit, onViewChart, chartAvailable }: { record: ReviewRecord; onEdit: () => void; onViewChart: () => void; chartAvailable: boolean }) {
  const pnl = record.pnl === null ? null : Number(record.pnl);
  const positive = (pnl ?? 0) >= 0;
  const followed = record.journal.ruleChecklist.filter((rule) => rule.followed).length;
  const rules = record.journal.ruleChecklist.length;
  return (
    <article className="grid gap-3 border-b app-border px-4 py-3 transition-colors last:border-b-0 hover:bg-white/[0.02] md:grid-cols-[minmax(150px,1.2fr)_minmax(110px,.8fr)_minmax(110px,.8fr)_auto] md:items-center">
      <div className="min-w-0"><p className="truncate text-sm font-semibold">Trade {record.number} · {record.symbol ?? "Market"} · {record.direction === "long" ? "Long" : "Short"}</p><p className="mt-1 text-[11px] app-muted">{formatNewYorkDateTime(record.entryTime, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}{record.journal.strategy ? ` · ${record.journal.strategy}` : ""}</p></div>
      <div><p className="text-[10px] uppercase tracking-wide app-muted">Execution</p><p className="mt-1 text-xs font-semibold">Grade {record.journal.grade ?? "—"} · {rules ? `${followed}/${rules} rules` : "No checklist"}</p></div>
      <div><p className="text-[10px] uppercase tracking-wide app-muted">Result</p><p className={`mt-1 font-mono text-xs font-semibold ${positive ? "text-profit" : "text-loss"}`}>{pnl === null ? "—" : `${positive ? "+" : "−"}$${Math.abs(pnl).toFixed(2)}`}{record.journal.realizedR ? ` · ${Number(record.journal.realizedR) >= 0 ? "+" : ""}${record.journal.realizedR}R` : ""}</p></div>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onViewChart} disabled={!chartAvailable} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-400/30 bg-brand-400/[0.07] px-2.5 text-[11px] font-semibold text-brand-300 hover:bg-brand-400/[0.13] disabled:cursor-not-allowed disabled:opacity-40"><CandlestickChart size={12} aria-hidden /> Chart</button>
        <button type="button" onClick={onEdit} className="inline-flex h-8 items-center gap-1.5 rounded-lg border app-border px-2.5 text-[11px] font-semibold app-muted hover:text-brand-300"><Pencil size={12} aria-hidden /> Edit</button>
      </div>
    </article>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "profit" | "warning" }) {
  const toneClass = tone === "profit" ? "text-profit" : tone === "warning" ? "text-amber-300" : "";
  return <div className="rounded-xl bg-[var(--app-panel-2)]/70 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] app-muted">{label}</p><p className={`mt-1.5 font-mono text-lg font-semibold ${toneClass}`}>{value}</p></div>;
}

function BreakdownTable({ title, empty, rows }: { title: string; empty: string; rows: Breakdown[] }) {
  return <section className="overflow-hidden rounded-xl border app-border"><h3 className="border-b app-border px-4 py-3 text-xs font-semibold">{title}</h3>{rows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-[11px]"><thead className="app-muted"><tr><th className="px-4 py-2">Name</th><th>Trades</th><th>Win rate</th><th>PF</th><th className="pr-4">Avg R</th></tr></thead><tbody>{rows.slice(0, 8).map((row) => <tr key={row.label} className="border-t app-border"><td className="max-w-44 truncate px-4 py-2 font-semibold">{row.label}</td><td>{row.trades}</td><td>{Math.round(row.wins / row.trades * 100)}%</td><td className="font-mono">{row.grossLoss ? (row.grossWin / row.grossLoss).toFixed(2) : row.grossWin ? "∞" : "—"}</td><td className={`pr-4 font-mono ${row.r >= 0 ? "text-profit" : "text-loss"}`}>{row.rCount ? `${row.r / row.rCount >= 0 ? "+" : ""}${(row.r / row.rCount).toFixed(2)}R` : "—"}</td></tr>)}</tbody></table></div> : <p className="px-4 py-8 text-center text-xs app-muted">{empty}</p>}</section>;
}
