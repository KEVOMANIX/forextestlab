"use client";

import Image from "next/image";

import {
  Camera,
  CandlestickChart,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FlaskConical,
  Maximize2,
  NotebookPen,
  PenLine,
  Paperclip,
  Plus,
  RotateCcw,
  Rows3,
  Save,
  Search,
  Trash2,
  Upload,
  X,
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
import { TradeReviewChartModal } from "@/components/app/journal/TradeReviewChartModal";
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
  maxFavorablePnl: string | null;
  maxAdversePnl: string | null;
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
    emotionIntensity: journal.emotionIntensity,
    confidence: journal.confidence,
    strategy: journal.strategy,
    grade: journal.grade,
    lesson: journal.lesson,
    attachments: [...journal.attachments],
    ruleChecklist: journal.ruleChecklist.map((rule) => ({ ...rule })),
    validity: journal.validity,
  };
}

function Snapshot({ snapshot, label, record, onOpen }: { snapshot: TradeChartSnapshot | null; label: string; record: ReviewRecord; onOpen: () => void }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  if (!snapshot?.candles.length) return <div className="grid h-56 place-items-center rounded-xl border border-dashed app-border text-[11px] app-muted"><span className="inline-flex items-center gap-1.5"><Camera size={13} /> {label} unavailable for an older trade</span></div>;
  const width = 720; const height = 220;
  const levelValues = [record.entryPrice, record.stopLoss, record.takeProfit, label === "After exit" ? record.exitPrice : null].filter((value): value is string => Boolean(value)).map(Number);
  const values = snapshot.candles.flatMap((candle) => [Number(candle.high), Number(candle.low)]).concat(levelValues);
  const min = Math.min(...values); const max = Math.max(...values); const spread = max - min || 1; const step = width / snapshot.candles.length;
  const y = (value: string | number) => 9 + (1 - (Number(value) - min) / spread) * (height - 18);
  const hovered = hoverIndex == null ? null : snapshot.candles[hoverIndex];
  const markerPointsUp = label === "Before entry" ? record.direction === "long" : record.direction === "short";
  const levels = [{ value: record.entryPrice, label: "Entry", color: "#60a5fa" }, ...(record.stopLoss ? [{ value: record.stopLoss, label: "Stop", color: "#f05b67" }] : []), ...(record.takeProfit ? [{ value: record.takeProfit, label: "Target", color: "#22c55e" }] : []), ...(label === "After exit" ? [{ value: record.exitPrice, label: "Exit", color: "#fbbf24" }] : [])];
  return <figure className="overflow-hidden rounded-xl border app-border bg-[var(--app-bg)]">
    <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b app-border px-3 py-2 text-[11px] app-muted"><span className="inline-flex items-center gap-1.5 font-semibold text-[var(--app-text)]"><Camera size={12} /> {label}</span><span className="flex items-center gap-3"><span>{snapshot.symbol} · {snapshot.timeframe} · {new Date(snapshot.capturedAt).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET</span><button type="button" onClick={onOpen} className="inline-flex items-center gap-1 rounded-md border app-border px-2 py-1 font-semibold text-brand-300 hover:bg-brand-400/10"><Maximize2 size={11} /> Interactive</button></span></figcaption>
    <div className="relative">{hovered && <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border app-border bg-[var(--app-bg)]/95 px-2 py-1 font-mono text-[10px] shadow-lg"><span className="app-muted">{new Date(hovered.timestamp).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" })}</span><span className="ml-2">O {hovered.open} · H {hovered.high} · L {hovered.low} · C {hovered.close}</span></div>}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full cursor-crosshair" role="img" aria-label={`${label} candlestick snapshot`} onMouseLeave={() => setHoverIndex(null)} onMouseMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setHoverIndex(Math.max(0, Math.min(snapshot.candles.length - 1, Math.floor(((event.clientX - rect.left) / rect.width) * snapshot.candles.length)))); }}>
        {[.25, .5, .75].map((ratio) => <line key={ratio} x1="0" x2={width} y1={height * ratio} y2={height * ratio} stroke="rgba(148,163,184,.08)" />)}
        {levels.map((level) => <g key={`${label}-${level.label}`}><line x1="0" x2={width} y1={y(level.value)} y2={y(level.value)} stroke={level.color} strokeWidth=".8" strokeDasharray="2 3" opacity=".65" /><text x={width - 4} y={Math.max(10, y(level.value) - 3)} textAnchor="end" fill={level.color} fontSize="8">{level.label}</text></g>)}
        {snapshot.candles.map((candle, index) => { const rising = Number(candle.close) >= Number(candle.open); const x = index * step + step / 2; const openY = y(candle.open); const closeY = y(candle.close); return <g key={`${candle.timestamp}-${index}`} stroke={rising ? "#22c55e" : "#f05b67"} fill={rising ? "#22c55e" : "#f05b67"}><line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} strokeWidth=".7" /><rect x={x - Math.max(1, step * .3)} y={Math.min(openY, closeY)} width={Math.max(2, step * .6)} height={Math.max(1, Math.abs(closeY - openY))} /></g>; })}
        <path d={markerPointsUp ? `M ${width - step / 2} ${height - 5} l -5 -8 h 3 v -7 h 4 v 7 h 3 z` : `M ${width - step / 2} 5 l -5 8 h 3 v 7 h 4 v -7 h 3 z`} fill={label === "Before entry" ? (record.direction === "long" ? "#22c55e" : "#f05b67") : "#fbbf24"} />
        {hoverIndex !== null && <line x1={(hoverIndex + .5) * step} x2={(hoverIndex + .5) * step} y1="0" y2={height} stroke="rgba(255,255,255,.35)" strokeWidth=".7" strokeDasharray="3 3" />}
      </svg>
    </div>
  </figure>;
}

export function TradeJournalEditor({
  sessionId,
  openPositions = [],
  closedTrades = [],
  anonymous = false,
  onSave,
}: {
  sessionId?: string;
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
        maxFavorablePnl: position.maxFavorablePnl ?? null,
        maxAdversePnl: position.maxAdversePnl ?? null,
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
        maxFavorablePnl: trade.maxFavorablePnl ?? previous?.maxFavorablePnl ?? null,
        maxAdversePnl: trade.maxAdversePnl ?? previous?.maxAdversePnl ?? null,
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
  const [gradeFilter, setGradeFilter] = useState<"all" | "A" | "B" | "C" | "D">("all");
  const [selectedId, setSelectedId] = useState<string | null>(records[0]?.journalId ?? null);
  const [chartOpen, setChartOpen] = useState(false);
  const [snapshotLayout, setSnapshotLayout] = useState<"stacked" | "compare">("stacked");
  const [previewAttachment, setPreviewAttachment] = useState<{ name: string; dataUrl: string } | null>(null);
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
      if (gradeFilter !== "all" && record.journal.grade !== gradeFilter) return false;
      if (!needle) return true;
      return [
        record.journal.entryReason,
        record.journal.exitReview,
        record.journal.emotion,
        record.journal.strategy,
        record.journal.grade ?? "",
        record.journal.lesson,
        ...record.journal.setupTags,
        ...record.journal.mistakeTags,
        `#${numberOf(record.journalId)}`,
        record.direction === "long" ? "buy long" : "sell short",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [gradeFilter, numberOf, query, records, unwrittenOnly]);

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

  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      event.preventDefault();
      step(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [step]);

  if (!records.length) {
    return <p className="p-4 text-sm app-muted">A journal will be created automatically when you place a trade.</p>;
  }
  if (!selected || !draft) return null;

  const patch = (value: Partial<TradeJournalUpdate>) =>
    setDraft((current) => (current ? { ...current, ...value } : current));
  const addRule = () => {
    const label = window.prompt("Rule to add to this playbook");
    if (!label?.trim() || draft.ruleChecklist.length >= 12) return;
    patch({ ruleChecklist: [...draft.ruleChecklist, { id: crypto.randomUUID(), label: label.trim().slice(0, 100), followed: false }] });
  };
  const addAttachment = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/") || file.size > 750_000 || draft.attachments.length >= 3) return;
    const reader = new FileReader();
    reader.onload = () => patch({ attachments: [...draft.attachments, { id: crypto.randomUUID(), name: file.name.slice(0, 120), type: file.type, dataUrl: String(reader.result) }] });
    reader.readAsDataURL(file);
  };
  const position = visible.findIndex((record) => record.journalId === selected.journalId);
  const reviewRecords: ReviewRecord[] = records.map((record) => ({
    journalId: record.journalId,
    number: numberOf(record.journalId),
    direction: record.direction,
    entryTime: record.entryTime,
    exitTime: record.open ? record.entryTime : closedTrades.filter((trade) => (trade.journalId ?? trade.id) === record.journalId).reduce((latest, trade) => Math.max(latest, trade.exitTime), record.entryTime),
    symbol: [...closedTrades, ...openPositions].find((item) => (item.journalId ?? item.id) === record.journalId)?.symbol ?? null,
    entryPrice: record.entryPrice,
    exitPrice: closedTrades.filter((trade) => (trade.journalId ?? trade.id) === record.journalId).sort((a, b) => b.exitTime - a.exitTime)[0]?.exitPrice ?? record.entryPrice,
    stopLoss: closedTrades.find((trade) => (trade.journalId ?? trade.id) === record.journalId)?.initialStopLoss ?? closedTrades.find((trade) => (trade.journalId ?? trade.id) === record.journalId)?.stopLoss ?? null,
    takeProfit: closedTrades.find((trade) => (trade.journalId ?? trade.id) === record.journalId)?.initialTakeProfit ?? closedTrades.find((trade) => (trade.journalId ?? trade.id) === record.journalId)?.takeProfit ?? null,
    pnl: record.pnl,
    maxFavorablePnl: record.maxFavorablePnl,
    maxAdversePnl: record.maxAdversePnl,
    journal: record.journal,
  }));
  const selectedReview = reviewRecords.find((record) => record.journalId === selected.journalId) ?? null;

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
          sessionId={sessionId}
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
            <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value as typeof gradeFilter)} aria-label="Filter journal by grade" className="mb-2 w-full rounded-lg border app-border bg-[var(--app-panel-2)] px-2 py-1.5 text-[11px] outline-none"><option value="all">All execution grades</option>{["A", "B", "C", "D"].map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select>
            <div className="flex gap-1 overflow-x-auto md:block md:max-h-[430px] md:space-y-1 md:overflow-y-auto">
              {visible.map((record) => (
                <button key={record.journalId} type="button" onClick={() => setSelectedId(record.journalId)} className={`min-w-40 rounded-lg border p-2 text-left text-xs md:block md:w-full ${record.journalId === selected.journalId ? "border-brand-400/40 bg-brand-400/10" : "app-border hover:bg-white/[0.03]"}`}>
                  <span className="flex items-center justify-between gap-2">
                    <strong className={record.direction === "long" ? "text-profit" : "text-loss"}>#{numberOf(record.journalId)} {record.direction === "long" ? "BUY" : "SELL"}</strong>
                    <span className="flex items-center gap-1">
                      {!isJournaled(record.journal) && <span title="No write-up yet" aria-label="No write-up yet" className="h-1.5 w-1.5 rounded-full bg-amber-300" />}
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase app-muted">{record.open ? "open" : record.journal.validity}</span>
                    </span>
                  </span>
                  <span className="mt-1 block font-mono app-muted">{record.entryPrice} · {record.lots} lots</span>
                  {record.pnl !== null && <span className={`mt-1 block font-mono ${Number(record.pnl) >= 0 ? "text-profit" : "text-loss"}`}>{Number(record.pnl) >= 0 ? "+" : ""}{Number(record.pnl).toFixed(2)}</span>}
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
                <button type="button" onClick={() => setChartOpen(true)} disabled={!selectedReview || (!sessionId && !selected.journal.beforeEntrySnapshot && !selected.journal.afterExitSnapshot)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-400/30 bg-brand-400/[0.07] px-3 text-[11px] font-semibold text-brand-300 hover:bg-brand-400/[0.13] disabled:cursor-not-allowed disabled:opacity-40" title={!sessionId && !selected.journal.beforeEntrySnapshot && !selected.journal.afterExitSnapshot ? "Chart data is unavailable for this trade" : "Open interactive marked trade chart"}><CandlestickChart size={13} /> View chart</button>
                <div className="flex items-center gap-1 text-[11px] app-muted">
                  <button type="button" onClick={() => step(-1)} disabled={position <= 0} aria-label="Previous trade" className="rounded border app-border p-1 disabled:opacity-30"><ChevronLeft size={12} /></button>
                  <span className="font-mono">{position === -1 ? "—" : position + 1} / {visible.length}</span>
                  <button type="button" onClick={() => step(1)} disabled={position === -1 || position >= visible.length - 1} aria-label="Next trade" className="rounded border app-border p-1 disabled:opacity-30"><ChevronRight size={12} /></button>
                </div>
                {saveState === "error" && !anonymous ? (
                  <button
                    type="button"
                    onClick={() => void persist(selected.journalId, draft)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-loss/40 px-2 py-1 text-[11px] font-semibold text-loss transition-colors hover:bg-loss/10"
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
              <label className="text-xs"><span className="mb-1 block app-muted">Strategy / playbook</span><input className="app-input w-full" value={draft.strategy} maxLength={80} onChange={(event) => patch({ strategy: event.target.value })} placeholder="e.g. London breakout" /></label>
              <div className="text-xs"><span className="mb-1 block app-muted">Execution grade</span><div className="flex gap-1.5">{(["A", "B", "C", "D"] as const).map((grade) => <button key={grade} type="button" aria-pressed={draft.grade === grade} onClick={() => patch({ grade: draft.grade === grade ? null : grade })} className={`grid h-9 w-9 place-items-center rounded-lg border font-mono font-bold ${draft.grade === grade ? "border-brand-400/50 bg-brand-400/10 text-brand-300" : "app-border app-muted"}`}>{grade}</button>)}</div></div>
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
              <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs"><span className="mb-1 block app-muted">Confidence: {draft.confidence ? `${draft.confidence}/5` : "Not set"}</span><input type="range" min="1" max="5" step="1" value={draft.confidence ?? 3} onChange={(event) => patch({ confidence: Number(event.target.value) })} className="w-full accent-brand-400" /></label><label className="text-xs"><span className="mb-1 block app-muted">Emotion intensity: {draft.emotionIntensity ? `${draft.emotionIntensity}/5` : "Not set"}</span><input type="range" min="1" max="5" step="1" value={draft.emotionIntensity ?? 3} onChange={(event) => patch({ emotionIntensity: Number(event.target.value) })} className="w-full accent-brand-400" /></label></div>
              <label className="text-xs lg:col-span-2"><span className="mb-1 block app-muted">Lesson for the next trade</span><textarea rows={2} className="app-input w-full resize-y" value={draft.lesson} maxLength={2000} onChange={(event) => patch({ lesson: event.target.value })} placeholder="One specific action to repeat or change" /></label>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
              <fieldset>
                <legend className="mb-2 flex w-full items-center justify-between gap-3 text-xs font-semibold"><span>Playbook checklist</span><button type="button" onClick={addRule} disabled={draft.ruleChecklist.length >= 12} className="inline-flex items-center gap-1 rounded-md border app-border px-2 py-1 text-[10px] app-muted hover:text-brand-300"><Plus size={11} /> Add rule</button></legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {draft.ruleChecklist.map((rule, index) => (
                    <label key={rule.id} className="flex items-center gap-2 rounded-lg border app-border p-2 text-xs">
                      <input type="checkbox" checked={rule.followed} onChange={(event) => patch({ ruleChecklist: draft.ruleChecklist.map((item, itemIndex) => itemIndex === index ? { ...item, followed: event.target.checked } : item) })} className="accent-brand-400" />
                      <span className="min-w-0 flex-1">{rule.label}</span><button type="button" aria-label={`Remove ${rule.label}`} onClick={(event) => { event.preventDefault(); patch({ ruleChecklist: draft.ruleChecklist.filter((_, itemIndex) => itemIndex !== index) }); }} className="app-muted hover:text-loss"><Trash2 size={12} /></button>
                    </label>
                  ))}
                </div>
              </fieldset>
              <dl className="grid grid-cols-2 gap-2 rounded-lg border app-border p-3 text-xs">
                <div><dt className="app-muted">Planned R:R</dt><dd className="mt-1 font-mono font-semibold">{selected.journal.plannedRR ? `1:${selected.journal.plannedRR}` : "—"}</dd></div>
                <div><dt className="app-muted">Realized R</dt><dd className={`mt-1 font-mono font-semibold ${Number(selected.journal.realizedR) >= 0 ? "text-profit" : "text-loss"}`}>{selected.journal.realizedR ? `${selected.journal.realizedR}R` : "—"}</dd></div>
              </dl>
            </div>

            <section className="rounded-xl border app-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="inline-flex items-center gap-2 text-xs font-semibold"><Camera size={13} /> Visual trade review</h3><p className="mt-1 text-[11px] app-muted">Hover for candle OHLC. Open the interactive chart to change timeframe, zoom, and inspect the marked trade.</p></div><div className="inline-flex rounded-lg border app-border bg-[var(--app-panel-2)] p-1"><button type="button" onClick={() => setSnapshotLayout("stacked")} aria-pressed={snapshotLayout === "stacked"} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${snapshotLayout === "stacked" ? "bg-white/[0.08] text-[var(--app-text)]" : "app-muted"}`}><Rows3 size={11} /> Focus</button><button type="button" onClick={() => setSnapshotLayout("compare")} aria-pressed={snapshotLayout === "compare"} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${snapshotLayout === "compare" ? "bg-white/[0.08] text-[var(--app-text)]" : "app-muted"}`}><Columns2 size={11} /> Compare</button></div></div>
              {selectedReview && <dl className="mt-3 grid gap-px overflow-hidden rounded-lg bg-[var(--app-border-color,rgba(255,255,255,.06))] sm:grid-cols-4">{[["Planned R:R", selectedReview.journal.plannedRR ? `1:${selectedReview.journal.plannedRR}` : "—"], ["Realized", selectedReview.journal.realizedR ? `${selectedReview.journal.realizedR}R` : "—"], ["Holding time", selectedReview.exitTime > selectedReview.entryTime ? `${Math.max(1, Math.round((selectedReview.exitTime - selectedReview.entryTime) / 60000))} min` : "Open"], ["Result", selectedReview.pnl == null ? "Open" : `${Number(selectedReview.pnl) >= 0 ? "+" : ""}${Number(selectedReview.pnl).toFixed(2)}`]].map(([label, value]) => <div key={label} className="bg-[var(--app-panel)] px-3 py-2"><dt className="text-[9px] uppercase tracking-wide app-muted">{label}</dt><dd className="mt-1 font-mono text-xs font-semibold">{value}</dd></div>)}</dl>}
              {selectedReview && <div className={`mt-3 grid gap-3 ${snapshotLayout === "compare" ? "lg:grid-cols-2" : "grid-cols-1"}`}><Snapshot snapshot={selected.journal.beforeEntrySnapshot} label="Before entry" record={selectedReview} onOpen={() => setChartOpen(true)} /><Snapshot snapshot={selected.journal.afterExitSnapshot} label="After exit" record={selectedReview} onOpen={() => setChartOpen(true)} /></div>}
            </section>

            <section tabIndex={0} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addAttachment(event.dataTransfer.files[0]); }} onPaste={(event) => addAttachment(event.clipboardData.files[0])} className="rounded-xl border border-dashed app-border p-3 outline-none transition-colors focus:border-brand-400/50">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xs font-semibold">Trade evidence</h3><p className="mt-1 text-[11px] app-muted">Drop, paste, or upload up to 3 images, 750 KB each.</p></div><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border app-border px-3 py-2 text-[11px] font-semibold hover:text-brand-300"><Upload size={12} /> Add image<input type="file" accept="image/*" className="sr-only" disabled={draft.attachments.length >= 3} onChange={(event) => { addAttachment(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div>
              {draft.attachments.length === 0 && <div className="mt-3 grid h-20 place-items-center rounded-lg bg-white/[0.02] text-[11px] app-muted"><span className="inline-flex items-center gap-2"><Paperclip size={13} /> Drop a chart, paste from clipboard, or choose an image</span></div>}
              {draft.attachments.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-3">{draft.attachments.map((attachment) => <figure key={attachment.id} className="group relative overflow-hidden rounded-lg border app-border"><button type="button" onClick={() => setPreviewAttachment(attachment)} className="block w-full"><Image unoptimized width={640} height={360} src={attachment.dataUrl} alt={attachment.name} className="h-36 w-full object-cover transition-transform group-hover:scale-[1.02]" /></button><figcaption className="truncate px-2 py-1 text-[10px] app-muted">{attachment.name}</figcaption><button type="button" aria-label={`Remove ${attachment.name}`} onClick={() => patch({ attachments: draft.attachments.filter((item) => item.id !== attachment.id) })} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-md bg-black/70 text-white"><Trash2 size={11} /></button></figure>)}</div>}
            </section>
          </div>
        </div>
      )}
      {chartOpen && selectedReview && <TradeReviewChartModal sessionId={sessionId} record={selectedReview} onClose={() => setChartOpen(false)} />}
      {previewAttachment && <div className="fixed inset-0 z-[140] grid place-items-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-label={previewAttachment.name} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewAttachment(null); }}><div className="relative max-h-full max-w-6xl"><Image unoptimized width={1600} height={1000} src={previewAttachment.dataUrl} alt={previewAttachment.name} className="max-h-[88vh] w-auto rounded-xl object-contain shadow-2xl" /><button type="button" onClick={() => setPreviewAttachment(null)} aria-label="Close image preview" className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-lg bg-black/75 text-white"><X size={16} /></button><p className="mt-2 text-center text-xs text-white/75">{previewAttachment.name}</p></div></div>}
    </div>
  );
}
