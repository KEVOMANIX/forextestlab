"use client";

import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  NotebookPen,
  PenLine,
  RotateCcw,
  Save,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  EMOTION_PRESETS,
  collectTags,
  isJournaled,
} from "@/components/app/journal-utils";
import {
  JournalReview,
  type ReviewRecord,
} from "@/components/app/journal/JournalReview";
import { TagField } from "@/components/app/journal/TagField";
import type {
  ClosedTrade,
  OpenPosition,
  TradeChartSnapshot,
  TradeJournal,
  TradeJournalUpdate,
} from "@/lib/backtest/types";
import { emptyTradeJournal } from "@/lib/backtest/trade-journal";

type JournalRecord = {
  journalId: string;
  direction: "long" | "short";
  entryPrice: string;
  entryTime: number;
  lots: string;
  pnl: string | null;
  open: boolean;
  journal: TradeJournal;
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

function Snapshot({ snapshot, label }: { snapshot: TradeChartSnapshot | null; label: string }) {
  if (!snapshot?.candles.length) {
    return (
      <div className="grid h-28 place-items-center rounded-lg border border-dashed app-border text-[11px] app-muted">
        <span className="inline-flex items-center gap-1.5"><Camera size={13} /> {label} unavailable for an older trade</span>
      </div>
    );
  }
  const width = 360;
  const height = 112;
  const values = snapshot.candles.flatMap((candle) => [Number(candle.high), Number(candle.low)]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const step = width / snapshot.candles.length;
  const y = (value: string) => 5 + (1 - (Number(value) - min) / spread) * (height - 10);
  return (
    <figure className="overflow-hidden rounded-lg border app-border bg-[var(--app-bg)]">
      <figcaption className="flex items-center justify-between border-b app-border px-2.5 py-1.5 text-[11px] app-muted">
        <span className="inline-flex items-center gap-1"><Camera size={11} /> {label}</span>
        <span>{snapshot.symbol} · {snapshot.timeframe} · {new Date(snapshot.capturedAt).toLocaleString()}</span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full" role="img" aria-label={`${label} candlestick snapshot`}>
        {snapshot.candles.map((candle, index) => {
          const rising = Number(candle.close) >= Number(candle.open);
          const x = index * step + step / 2;
          const openY = y(candle.open);
          const closeY = y(candle.close);
          return (
            <g key={`${candle.timestamp}-${index}`} stroke={rising ? "#22c3a0" : "#f4646c"} fill={rising ? "#22c3a0" : "#f4646c"}>
              <line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} strokeWidth=".7" />
              <rect x={x - Math.max(1, step * 0.3)} y={Math.min(openY, closeY)} width={Math.max(2, step * 0.6)} height={Math.max(1, Math.abs(closeY - openY))} />
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function TradeJournalEditor({
  openPositions = [],
  closedTrades = [],
  anonymous = false,
  onSave,
}: {
  openPositions?: OpenPosition[];
  closedTrades?: ClosedTrade[];
  anonymous?: boolean;
  onSave: (journalId: string, journal: TradeJournalUpdate) => Promise<void> | void;
}) {
  const records = useMemo(() => {
    const byId = new Map<string, JournalRecord>();
    for (const position of openPositions) {
      const journalId = position.journalId ?? position.id;
      byId.set(journalId, {
        journalId,
        direction: position.direction,
        entryPrice: position.entryPrice,
        entryTime: position.entryTime,
        lots: position.lots,
        pnl: null,
        open: true,
        journal: position.journal ?? emptyTradeJournal(position.entryPrice, position.stopLoss, position.takeProfit),
      });
    }
    for (const trade of closedTrades) {
      const journalId = trade.journalId ?? trade.id;
      const previous = byId.get(journalId);
      byId.set(journalId, {
        journalId,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        entryTime: trade.entryTime,
        lots: previous ? String(Number(previous.lots) + Number(trade.lots)) : trade.lots,
        pnl: String(Number(previous?.pnl ?? 0) + Number(trade.pnl)),
        open: previous?.open ?? false,
        journal: trade.journal ?? previous?.journal ?? emptyTradeJournal(trade.entryPrice, trade.stopLoss, trade.takeProfit),
      });
    }
    return [...byId.values()].sort((a, b) => b.entryTime - a.entryTime);
  }, [closedTrades, openPositions]);

  /** Ledger numbering: the oldest trade is #1, matching the trades table. */
  const numberOf = useCallback(
    (journalId: string) =>
      records.length - records.findIndex((record) => record.journalId === journalId),
    [records],
  );

  const [mode, setMode] = useState<"review" | "edit">("edit");
  const [query, setQuery] = useState("");
  const [unwrittenOnly, setUnwrittenOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(records[0]?.journalId ?? null);
  const selected = records.find((record) => record.journalId === selectedId) ?? records[0] ?? null;
  const [draft, setDraft] = useState<TradeJournalUpdate | null>(selected ? editable(selected.journal) : null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const savedHash = useRef("");
  // Held in a ref so the debounce below depends only on the draft. A parent
  // that passes a fresh callback each render would otherwise restart the timer
  // on every keystroke's re-render and the save would never fire.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const journals = useMemo(() => records.map((record) => record.journal), [records]);
  const setupSuggestions = useMemo(() => collectTags(journals, "setupTags"), [journals]);
  const mistakeSuggestions = useMemo(() => collectTags(journals, "mistakeTags"), [journals]);
  const journaledCount = useMemo(() => journals.filter(isJournaled).length, [journals]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => {
      if (unwrittenOnly && isJournaled(record.journal)) return false;
      if (!needle) return true;
      return [
        record.journal.entryReason,
        record.journal.exitReview,
        record.journal.emotion,
        ...record.journal.setupTags,
        ...record.journal.mistakeTags,
        `#${numberOf(record.journalId)}`,
        record.direction === "long" ? "buy long" : "sell short",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [numberOf, query, records, unwrittenOnly]);

  useEffect(() => {
    if (!selected) return;
    const next = editable(selected.journal);
    setDraft(next);
    savedHash.current = JSON.stringify(next);
    setSelectedId(selected.journalId);
    setSaveState("saved");
  }, [selected?.journalId, selected?.journal.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(
    async (journalId: string, value: TradeJournalUpdate) => {
      const hash = JSON.stringify(value);
      setSaveState("saving");
      try {
        await onSaveRef.current(journalId, value);
        savedHash.current = hash;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [],
  );

  const selectedJournalId = selected?.journalId;
  useEffect(() => {
    if (!selectedJournalId || !draft || anonymous) return;
    if (JSON.stringify(draft) === savedHash.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => void persist(selectedJournalId, draft), 700);
    return () => window.clearTimeout(timer);
  }, [anonymous, draft, persist, selectedJournalId]);

  // Losing a write-up to a mistimed tab close is worse than a browser prompt.
  useEffect(() => {
    if (saveState !== "error") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const step = useCallback(
    (delta: number) => {
      if (!selected) return;
      const index = visible.findIndex((record) => record.journalId === selected.journalId);
      const next = visible[(index === -1 ? 0 : index) + delta];
      if (next) setSelectedId(next.journalId);
    },
    [selected, visible],
  );

  const nextUnwritten = useCallback(() => {
    const target = records.find((record) => !isJournaled(record.journal));
    if (!target) return;
    setSelectedId(target.journalId);
    setMode("edit");
  }, [records]);

  if (!records.length) {
    return <p className="p-4 text-sm app-muted">A journal will be created automatically when you place a trade.</p>;
  }
  if (!selected || !draft) return null;

  const patch = (value: Partial<TradeJournalUpdate>) =>
    setDraft((current) => (current ? { ...current, ...value } : current));
  const position = visible.findIndex((record) => record.journalId === selected.journalId);
  const reviewRecords: ReviewRecord[] = records.map((record) => ({
    journalId: record.journalId,
    number: numberOf(record.journalId),
    direction: record.direction,
    entryTime: record.entryTime,
    pnl: record.pnl,
    journal: record.journal,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b app-border px-3 py-2.5">
        <div className="inline-flex rounded-lg border app-border bg-[var(--app-panel-2)] p-1" role="tablist" aria-label="Journal view">
          {([["review", "Review", NotebookPen], ["edit", "Edit", PenLine]] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${mode === value ? "bg-white/[0.08] text-[var(--app-text)]" : "app-muted hover:text-[var(--app-text)]"}`}
            >
              <Icon size={13} aria-hidden /> {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px] app-muted">
          <span>
            <strong className="font-mono text-[var(--app-text)]">{journaledCount}</strong> of {records.length} journaled
          </span>
          {journaledCount < records.length && (
            <button
              type="button"
              onClick={nextUnwritten}
              className="rounded-lg border app-border px-2 py-1 transition-colors hover:text-brand-300"
            >
              Next unwritten
            </button>
          )}
        </div>
      </div>

      {mode === "review" ? (
        <JournalReview
          records={reviewRecords}
          onEdit={(journalId) => {
            setSelectedId(journalId);
            setMode("edit");
          }}
        />
      ) : (
        <div className="grid min-h-[360px] grid-cols-[minmax(0,1fr)] md:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="min-w-0 border-b app-border p-2 md:border-b-0 md:border-r">
            <div className="relative mb-2">
              <Search size={13} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 app-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notes and tags"
                aria-label="Search trade journals"
                className="w-full rounded-lg border app-border bg-[var(--app-panel-2)] py-1.5 pl-8 pr-2 text-xs outline-none transition-colors focus:border-brand-400/60"
              />
            </div>
            <label className="mb-2 flex items-center gap-2 px-1 text-[11px] app-muted">
              <input
                type="checkbox"
                checked={unwrittenOnly}
                onChange={(event) => setUnwrittenOnly(event.target.checked)}
                className="accent-brand-400"
              />
              Unwritten only
            </label>
            <div className="flex gap-1 overflow-x-auto md:block md:max-h-[430px] md:space-y-1 md:overflow-y-auto">
              {visible.map((record) => (
                <button key={record.journalId} type="button" onClick={() => setSelectedId(record.journalId)} className={`min-w-40 rounded-lg border p-2 text-left text-xs md:block md:w-full ${record.journalId === selected.journalId ? "border-brand-400/40 bg-brand-400/10" : "app-border hover:bg-white/[0.03]"}`}>
                  <span className="flex items-center justify-between gap-2">
                    <strong className={record.direction === "long" ? "text-brand-300" : "text-bear"}>#{numberOf(record.journalId)} {record.direction === "long" ? "BUY" : "SELL"}</strong>
                    <span className="flex items-center gap-1">
                      {!isJournaled(record.journal) && <span title="No write-up yet" aria-label="No write-up yet" className="h-1.5 w-1.5 rounded-full bg-amber-300" />}
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase app-muted">{record.open ? "open" : record.journal.validity}</span>
                    </span>
                  </span>
                  <span className="mt-1 block font-mono app-muted">{record.entryPrice} · {record.lots} lots</span>
                  {record.pnl !== null && <span className={`mt-1 block font-mono ${Number(record.pnl) >= 0 ? "text-brand-300" : "text-bear"}`}>{Number(record.pnl) >= 0 ? "+" : ""}{Number(record.pnl).toFixed(2)}</span>}
                </button>
              ))}
              {!visible.length && <p className="px-1 py-6 text-center text-[11px] app-muted">No trades match that search.</p>}
            </div>
          </aside>

          <div className="min-w-0 space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                {(["valid", "invalid", "experimental"] as const).map((value) => (
                  <button key={value} type="button" onClick={() => patch({ validity: value })} aria-pressed={draft.validity === value} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${draft.validity === value ? "border-brand-400/40 bg-brand-400/10 text-brand-300" : "app-border app-muted"}`}>
                    {value === "experimental" && <FlaskConical size={10} className="mr-1 inline" />}{value}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-[11px] app-muted">
                  <button type="button" onClick={() => step(-1)} disabled={position <= 0} aria-label="Previous trade" className="rounded border app-border p-1 disabled:opacity-30"><ChevronLeft size={12} /></button>
                  <span className="font-mono">{position === -1 ? "—" : position + 1} / {visible.length}</span>
                  <button type="button" onClick={() => step(1)} disabled={position === -1 || position >= visible.length - 1} aria-label="Next trade" className="rounded border app-border p-1 disabled:opacity-30"><ChevronRight size={12} /></button>
                </div>
                {saveState === "error" && !anonymous ? (
                  <button
                    type="button"
                    onClick={() => void persist(selected.journalId, draft)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-bear/40 px-2 py-1 text-[11px] font-semibold text-bear transition-colors hover:bg-bear/10"
                  >
                    <RotateCcw size={11} aria-hidden /> Autosave failed — retry
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] app-muted">
                    {saveState === "saved" ? <Check size={11} /> : <Save size={11} />}
                    {anonymous ? "Sign in to save journals" : saveState === "saving" ? "Autosaving…" : "Saved"}
                  </span>
                )}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <label className="text-xs"><span className="mb-1 block app-muted">Entry reason</span><textarea rows={4} className="app-input w-full resize-y" value={draft.entryReason} onChange={(event) => patch({ entryReason: event.target.value })} placeholder="Why was this entry valid?" /></label>
              <label className="text-xs"><span className="mb-1 block app-muted">Exit review</span><textarea rows={4} className="app-input w-full resize-y" value={draft.exitReview} onChange={(event) => patch({ exitReview: event.target.value })} placeholder="What happened, and what would you repeat or change?" /></label>
              <TagField label="Setup tags" hint="(what you saw)" tone="brand" value={draft.setupTags} suggestions={setupSuggestions} onChange={(setupTags) => patch({ setupTags })} />
              <TagField label="Mistake tags" hint="(what went wrong)" tone="bear" value={draft.mistakeTags} suggestions={mistakeSuggestions} onChange={(mistakeTags) => patch({ mistakeTags })} />
              <div className="text-xs">
                <span className="mb-1 block app-muted">Emotion</span>
                <div className="flex flex-wrap gap-1.5">
                  {EMOTION_PRESETS.map((emotion) => (
                    <button
                      key={emotion}
                      type="button"
                      aria-pressed={draft.emotion === emotion}
                      onClick={() => patch({ emotion: draft.emotion === emotion ? "" : emotion })}
                      className={`rounded-md border px-2 py-1 transition-colors ${draft.emotion === emotion ? "border-brand-400/40 bg-brand-400/10 text-brand-200" : "app-border app-muted hover:text-[var(--app-text)]"}`}
                    >
                      {emotion}
                    </button>
                  ))}
                </div>
                <input className="app-input mt-2 w-full" value={draft.emotion} onChange={(event) => patch({ emotion: event.target.value })} placeholder="Or describe it yourself" maxLength={40} aria-label="Emotion" />
              </div>
              <label className="text-xs"><span className="mb-1 block app-muted">Confidence: {draft.confidence ? `${draft.confidence}/5` : "Not set"}</span><input type="range" min="1" max="5" step="1" value={draft.confidence ?? 3} onChange={(event) => patch({ confidence: Number(event.target.value) })} className="w-full accent-brand-400" /></label>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
              <fieldset>
                <legend className="mb-2 text-xs font-semibold">Rule-followed checklist</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {draft.ruleChecklist.map((rule, index) => (
                    <label key={rule.id} className="flex items-center gap-2 rounded-lg border app-border p-2 text-xs">
                      <input type="checkbox" checked={rule.followed} onChange={(event) => patch({ ruleChecklist: draft.ruleChecklist.map((item, itemIndex) => itemIndex === index ? { ...item, followed: event.target.checked } : item) })} className="accent-brand-400" />
                      <span>{rule.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <dl className="grid grid-cols-2 gap-2 rounded-lg border app-border p-3 text-xs">
                <div><dt className="app-muted">Planned R:R</dt><dd className="mt-1 font-mono font-semibold">{selected.journal.plannedRR ? `1:${selected.journal.plannedRR}` : "—"}</dd></div>
                <div><dt className="app-muted">Realized R</dt><dd className={`mt-1 font-mono font-semibold ${Number(selected.journal.realizedR) >= 0 ? "text-brand-300" : "text-bear"}`}>{selected.journal.realizedR ? `${selected.journal.realizedR}R` : "—"}</dd></div>
              </dl>
            </div>

            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold">
                <Camera size={13} /> Chart snapshots
                <span className="app-muted">
                  {[
                    selected.journal.beforeEntrySnapshot && "before entry",
                    selected.journal.afterExitSnapshot && "after exit",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "none captured"}
                </span>
              </summary>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <Snapshot snapshot={selected.journal.beforeEntrySnapshot} label="Before entry" />
                <Snapshot snapshot={selected.journal.afterExitSnapshot} label="After exit" />
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
