"use client";

import Image from "next/image";

import {
  CandlestickChart,
  Check,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  NotebookPen,
  PenLine,
  Paperclip,
  Plus,
  RotateCcw,
  Save,
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

export function TradeJournalEditor({
  sessionId,
  openPositions = [],
  closedTrades = [],
  anonymous = false,
  onSave,
  onClose,
}: {
  sessionId?: string;
  openPositions?: OpenPosition[];
  closedTrades?: ClosedTrade[];
  anonymous?: boolean;
  onSave: (journalId: string, journal: TradeJournalUpdate) => Promise<void> | void;
  onClose?: () => void;
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
  const [reviewStep, setReviewStep] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(records[0]?.journalId ?? null);
  const [chartOpen, setChartOpen] = useState(false);
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

  const visible = records;

  useEffect(() => {
    if (!selected) return;
    const next = editable(selected.journal);
    setDraft(next);
    savedHash.current = JSON.stringify(next);
    setSelectedId(selected.journalId);
    setReviewStep(0);
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

  const selectTrade = useCallback(
    async (journalId: string) => {
      if (journalId === selectedJournalId) return;
      if (!anonymous && selectedJournalId && draft && JSON.stringify(draft) !== savedHash.current) {
        await persist(selectedJournalId, draft);
      }
      setSelectedId(journalId);
      setReviewStep(0);
    },
    [anonymous, draft, persist, selectedJournalId],
  );

  const step = useCallback(
    (delta: number) => {
      if (!selected) return;
      const index = visible.findIndex((record) => record.journalId === selected.journalId);
      const next = visible[(index === -1 ? 0 : index) + delta];
      if (next) void selectTrade(next.journalId);
    },
    [selectTrade, selected, visible],
  );

  const nextUnwritten = useCallback(() => {
    const target = records.find((record) => !isJournaled(record.journal));
    if (!target) return;
    void selectTrade(target.journalId);
    setMode("edit");
  }, [records, selectTrade]);

  const closeEditor = useCallback(async () => {
    if (!anonymous && selectedJournalId && draft && JSON.stringify(draft) !== savedHash.current) {
      await persist(selectedJournalId, draft);
    }
    onClose?.();
  }, [anonymous, draft, onClose, persist, selectedJournalId]);

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
  const reviewSteps = ["Setup", "Execution", "Outcome", "Lesson"] as const;
  const selectedSymbol = selectedReview?.symbol ?? "Market";

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
              onClick={() => { setMode(value); if (value === "edit") setReviewStep(0); }}
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
          {onClose && (
            <button
              type="button"
              onClick={() => void closeEditor()}
              aria-label="Close journal"
              title="Close journal"
              className="grid h-8 w-8 place-items-center rounded-lg border app-border transition-colors hover:border-brand-400/40 hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"
            >
              <X size={15} aria-hidden />
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
            setReviewStep(0);
          }}
        />
      ) : (
        <div className="min-h-[520px] p-3 sm:p-4">
          <div className="mx-auto grid max-w-[1240px] gap-4 xl:grid-cols-[15rem_minmax(0,1fr)] xl:items-start">
            <aside className="overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)] xl:sticky xl:top-3">
              <div className="flex items-center justify-between border-b app-border px-3.5 py-3">
                <div>
                  <p className="text-xs font-semibold">Trades</p>
                  <p className="mt-0.5 text-[10px] app-muted">Select a trade to review</p>
                </div>
                <span className="font-mono text-[10px] app-muted">{records.length}</span>
              </div>
              <div className="flex gap-2 overflow-x-auto p-2 xl:block xl:max-h-[calc(100vh-15rem)] xl:space-y-1 xl:overflow-y-auto">
                {reviewRecords.map((record) => {
                  const active = record.journalId === selected.journalId;
                  const reviewed = isJournaled(record.journal);
                  const pnl = record.pnl === null ? null : Number(record.pnl);
                  return (
                    <button
                      key={record.journalId}
                      type="button"
                      onClick={() => void selectTrade(record.journalId)}
                      aria-current={active ? "true" : undefined}
                      className={`min-w-48 rounded-xl border px-3 py-2.5 text-left transition-colors xl:w-full xl:min-w-0 ${active ? "border-brand-400/55 bg-brand-400/[0.1]" : "border-transparent hover:border-[var(--app-border-color)] hover:bg-[var(--app-panel-2)]/55"}`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className={`text-[11px] font-semibold ${active ? "text-brand-300" : "text-[var(--app-text)]"}`}>Trade {record.number}</span>
                        <span className={`h-1.5 w-1.5 rounded-full ${reviewed ? "bg-brand-400" : "bg-[var(--app-muted)] opacity-45"}`} title={reviewed ? "Reviewed" : "Not reviewed"} />
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-3 text-[10px] app-muted">
                        <span>{record.symbol ?? "Market"} · {record.direction === "long" ? "Long" : "Short"}</span>
                        <span className={`font-mono font-semibold ${pnl === null ? "app-muted" : pnl >= 0 ? "text-profit" : "text-loss"}`}>{pnl === null ? "Open" : `${pnl >= 0 ? "+" : "−"}$${Math.abs(pnl).toFixed(2)}`}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="min-w-0 max-w-4xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Trade {numberOf(selected.journalId)} · {selectedSymbol}</p>
                <h3 className="mt-1 text-xl font-semibold">Review the decision</h3>
                <p className="mt-1 text-xs app-muted">{selected.direction === "long" ? "Long" : "Short"} at {selected.entryPrice} · {selected.lots} lots</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setChartOpen(true)} disabled={!selectedReview || (!sessionId && !selected.journal.beforeEntrySnapshot && !selected.journal.afterExitSnapshot)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-400/30 bg-brand-400/[0.07] px-3 text-[11px] font-semibold text-brand-300 hover:bg-brand-400/[0.13] disabled:cursor-not-allowed disabled:opacity-40"><CandlestickChart size={13} /> Interactive chart</button>
              </div>
            </div>

            <div className="my-6 flex items-start justify-center" role="tablist" aria-label="Journal review steps">
              {reviewSteps.map((label, index) => (
                <div key={label} className="flex items-center last:flex-none">
                  <button type="button" role="tab" aria-selected={reviewStep === index} onClick={() => setReviewStep(index)} className={`group flex min-w-16 flex-col items-center gap-1.5 text-[10px] font-semibold transition-colors ${reviewStep === index ? "text-[var(--app-text)]" : index < reviewStep ? "text-brand-300" : "app-muted"}`}>
                    <span className={`grid h-7 w-7 place-items-center rounded-full border font-mono ${reviewStep === index ? "border-brand-400 bg-brand-400 text-surface-950" : index < reviewStep ? "border-brand-400/50 bg-brand-400/10" : "app-border bg-[var(--app-panel-2)]"}`}>{index < reviewStep ? <Check size={13} /> : index + 1}</span>
                    {label}
                  </button>
                  {index < reviewSteps.length - 1 && <span className={`mt-3 h-px w-8 sm:w-16 ${index < reviewStep ? "bg-brand-400/60" : "bg-[var(--app-border-color)]"}`} aria-hidden />}
                </div>
              ))}
            </div>

            <section className="rounded-2xl border app-border bg-[var(--app-panel)] p-4 sm:p-6">
              {reviewStep === 0 && (
                <div className="space-y-5">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Setup</p><h4 className="mt-1 text-lg font-semibold">What made this trade valid?</h4><p className="mt-1 text-xs app-muted">Record the evidence that existed before entry.</p></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-xs"><span className="mb-1.5 block font-medium app-muted">Strategy / playbook</span><input className="app-input h-10 w-full" value={draft.strategy} maxLength={80} onChange={(event) => patch({ strategy: event.target.value })} placeholder="e.g. London sweep" /></label>
                    <div className="text-xs"><span className="mb-1.5 block font-medium app-muted">Setup validity</span><div className="grid grid-cols-3 gap-2">{(["valid", "invalid", "experimental"] as const).map((value) => <button key={value} type="button" onClick={() => patch({ validity: value })} aria-pressed={draft.validity === value} className={`h-10 rounded-lg border text-[11px] font-semibold capitalize ${draft.validity === value ? "border-brand-400/50 bg-brand-400/10 text-brand-300" : "app-border app-muted"}`}>{value === "experimental" && <FlaskConical size={10} className="mr-1 inline" />}{value}</button>)}</div></div>
                  </div>
                  <label className="block text-xs"><span className="mb-1.5 block font-medium app-muted">Entry thesis</span><textarea rows={5} className="app-input w-full resize-y" value={draft.entryReason} onChange={(event) => patch({ entryReason: event.target.value })} placeholder="What did you see, and why was the entry valid?" /></label>
                  <TagField label="Setup tags" hint="(what you saw)" tone="brand" value={draft.setupTags} suggestions={setupSuggestions} onChange={(setupTags) => patch({ setupTags })} />
                </div>
              )}

              {reviewStep === 1 && (
                <div className="space-y-5">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Execution</p><h4 className="mt-1 text-lg font-semibold">Did you follow the process?</h4><p className="mt-1 text-xs app-muted">Judge the execution independently from the result.</p></div>
                  <fieldset>
                    <legend className="mb-2 flex w-full items-center justify-between gap-3 text-xs font-semibold"><span>Playbook checklist</span><button type="button" onClick={addRule} disabled={draft.ruleChecklist.length >= 12} className="inline-flex items-center gap-1 rounded-lg border app-border px-2.5 py-1.5 text-[10px] app-muted hover:text-brand-300"><Plus size={11} /> Add rule</button></legend>
                    <div className="grid gap-2 sm:grid-cols-2">{draft.ruleChecklist.map((rule, index) => <label key={rule.id} className="flex min-h-11 items-center gap-2 rounded-xl border app-border bg-[var(--app-panel-2)]/35 p-2.5 text-xs"><input type="checkbox" checked={rule.followed} onChange={(event) => patch({ ruleChecklist: draft.ruleChecklist.map((item, itemIndex) => itemIndex === index ? { ...item, followed: event.target.checked } : item) })} className="h-4 w-4 accent-brand-400" /><span className="min-w-0 flex-1">{rule.label}</span><button type="button" aria-label={`Remove ${rule.label}`} onClick={(event) => { event.preventDefault(); patch({ ruleChecklist: draft.ruleChecklist.filter((_, itemIndex) => itemIndex !== index) }); }} className="app-muted hover:text-loss"><Trash2 size={12} /></button></label>)}</div>
                  </fieldset>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="text-xs"><span className="mb-1.5 block font-medium app-muted">Emotion at entry</span><div className="flex flex-wrap gap-1.5">{EMOTION_PRESETS.map((emotion) => <button key={emotion} type="button" aria-pressed={draft.emotion === emotion} onClick={() => patch({ emotion: draft.emotion === emotion ? "" : emotion })} className={`rounded-lg border px-2.5 py-1.5 transition-colors ${draft.emotion === emotion ? "border-brand-400/40 bg-brand-400/10 text-brand-200" : "app-border app-muted hover:text-[var(--app-text)]"}`}>{emotion}</button>)}</div><input className="app-input mt-2 w-full" value={draft.emotion} onChange={(event) => patch({ emotion: event.target.value })} placeholder="Or describe it" maxLength={40} aria-label="Emotion" /></div>
                    <div className="space-y-4 rounded-xl border app-border bg-[var(--app-panel-2)]/35 p-4"><label className="block text-xs"><span className="mb-2 flex justify-between app-muted"><span>Confidence</span><b className="text-[var(--app-text)]">{draft.confidence ? `${draft.confidence}/5` : "Not set"}</b></span><input type="range" min="1" max="5" step="1" value={draft.confidence ?? 3} onChange={(event) => patch({ confidence: Number(event.target.value) })} className="w-full accent-brand-400" /></label><label className="block text-xs"><span className="mb-2 flex justify-between app-muted"><span>Emotion intensity</span><b className="text-[var(--app-text)]">{draft.emotionIntensity ? `${draft.emotionIntensity}/5` : "Not set"}</b></span><input type="range" min="1" max="5" step="1" value={draft.emotionIntensity ?? 3} onChange={(event) => patch({ emotionIntensity: Number(event.target.value) })} className="w-full accent-brand-400" /></label></div>
                  </div>
                </div>
              )}

              {reviewStep === 2 && (
                <div className="space-y-5">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Outcome</p><h4 className="mt-1 text-lg font-semibold">What happened after entry?</h4><p className="mt-1 text-xs app-muted">Compare the result with the original plan.</p></div>
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_230px]">
                    <label className="text-xs"><span className="mb-1.5 block font-medium app-muted">Exit review</span><textarea rows={5} className="app-input w-full resize-y" value={draft.exitReview} onChange={(event) => patch({ exitReview: event.target.value })} placeholder="What happened, and what would you repeat or change?" /></label>
                    <div className="rounded-xl border app-border bg-[var(--app-panel-2)]/35 p-4"><p className="text-[10px] font-semibold uppercase tracking-wide app-muted">Execution grade</p><div className="mt-3 flex gap-2">{(["A", "B", "C", "D"] as const).map((grade) => <button key={grade} type="button" aria-pressed={draft.grade === grade} onClick={() => patch({ grade: draft.grade === grade ? null : grade })} className={`grid h-10 w-10 place-items-center rounded-lg border font-mono font-bold ${draft.grade === grade ? "border-brand-400/50 bg-brand-400/10 text-brand-300" : "app-border app-muted"}`}>{grade}</button>)}</div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="app-muted">Planned R:R</dt><dd className="mt-1 font-mono font-semibold">{selected.journal.plannedRR ? `1:${selected.journal.plannedRR}` : "—"}</dd></div><div><dt className="app-muted">Realized R</dt><dd className={`mt-1 font-mono font-semibold ${Number(selected.journal.realizedR) >= 0 ? "text-profit" : "text-loss"}`}>{selected.journal.realizedR ? `${selected.journal.realizedR}R` : "—"}</dd></div></dl></div>
                  </div>
                  <TagField label="Mistake tags" hint="(what went wrong)" tone="bear" value={draft.mistakeTags} suggestions={mistakeSuggestions} onChange={(mistakeTags) => patch({ mistakeTags })} />
                  <section tabIndex={0} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addAttachment(event.dataTransfer.files[0]); }} onPaste={(event) => addAttachment(event.clipboardData.files[0])} className="rounded-xl border border-dashed app-border p-3 outline-none transition-colors focus:border-brand-400/50"><div className="flex flex-wrap items-center justify-between gap-3"><div><h5 className="text-xs font-semibold">Trade evidence</h5><p className="mt-1 text-[11px] app-muted">Up to 3 images, 750 KB each.</p></div><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border app-border px-3 py-2 text-[11px] font-semibold hover:text-brand-300"><Upload size={12} /> Add image<input type="file" accept="image/*" className="sr-only" disabled={draft.attachments.length >= 3} onChange={(event) => { addAttachment(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div>{draft.attachments.length === 0 && <div className="mt-3 grid h-16 place-items-center rounded-lg bg-white/[0.02] text-[11px] app-muted"><span className="inline-flex items-center gap-2"><Paperclip size={13} /> Drop or paste a chart image</span></div>}{draft.attachments.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-3">{draft.attachments.map((attachment) => <figure key={attachment.id} className="group relative overflow-hidden rounded-lg border app-border"><button type="button" onClick={() => setPreviewAttachment(attachment)} className="block w-full"><Image unoptimized width={640} height={360} src={attachment.dataUrl} alt={attachment.name} className="h-28 w-full object-cover" /></button><figcaption className="truncate px-2 py-1 text-[10px] app-muted">{attachment.name}</figcaption><button type="button" aria-label={`Remove ${attachment.name}`} onClick={() => patch({ attachments: draft.attachments.filter((item) => item.id !== attachment.id) })} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-md bg-black/70 text-white"><Trash2 size={11} /></button></figure>)}</div>}</section>
                </div>
              )}

              {reviewStep === 3 && (
                <div className="space-y-5">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-300">Lesson</p><h4 className="mt-1 text-lg font-semibold">What changes on the next trade?</h4><p className="mt-1 text-xs app-muted">Finish with one specific action you can repeat or correct.</p></div>
                  <label className="block text-xs"><span className="mb-1.5 block font-medium app-muted">Next-trade action</span><textarea rows={5} className="app-input w-full resize-y" value={draft.lesson} maxLength={2000} onChange={(event) => patch({ lesson: event.target.value })} placeholder="One specific action to repeat or change" /></label>
                  <div className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-[var(--app-panel-2)]/55 p-3"><p className="text-[10px] uppercase app-muted">Setup</p><p className="mt-1 truncate text-xs font-semibold">{draft.strategy || "Not assigned"}</p></div><div className="rounded-xl bg-[var(--app-panel-2)]/55 p-3"><p className="text-[10px] uppercase app-muted">Rules</p><p className="mt-1 text-xs font-semibold">{draft.ruleChecklist.filter((rule) => rule.followed).length} / {draft.ruleChecklist.length}</p></div><div className="rounded-xl bg-[var(--app-panel-2)]/55 p-3"><p className="text-[10px] uppercase app-muted">Grade</p><p className="mt-1 text-xs font-semibold">{draft.grade ?? "—"}</p></div><div className="rounded-xl bg-[var(--app-panel-2)]/55 p-3"><p className="text-[10px] uppercase app-muted">Result</p><p className={`mt-1 font-mono text-xs font-semibold ${Number(selected.pnl ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>{selected.pnl === null ? "Open" : `${Number(selected.pnl) >= 0 ? "+" : ""}${Number(selected.pnl).toFixed(2)}`}</p></div></div>
                  <div className="rounded-xl border border-brand-400/20 bg-brand-400/[0.06] p-4"><p className="text-xs font-semibold">Review complete</p><p className="mt-1 text-[11px] app-muted">Your changes autosave and this trade will appear in the Process Console.</p></div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t app-border pt-4">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setReviewStep((current) => Math.max(0, current - 1))} disabled={reviewStep === 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg border app-border px-3 text-xs font-semibold app-muted hover:text-[var(--app-text)] disabled:opacity-30"><ChevronLeft size={13} /> Back</button>
                  {saveState === "error" && !anonymous ? <button type="button" onClick={() => void persist(selected.journalId, draft)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-loss/40 px-3 text-[11px] font-semibold text-loss"><RotateCcw size={11} /> Retry save</button> : <span className="inline-flex items-center gap-1 text-[11px] app-muted">{saveState === "saved" ? <Check size={11} /> : <Save size={11} />}{anonymous ? "Sign in to save" : saveState === "saving" ? "Autosaving…" : "Saved"}</span>}
                </div>
                {reviewStep < reviewSteps.length - 1 ? <button type="button" onClick={() => setReviewStep((current) => Math.min(reviewSteps.length - 1, current + 1))} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-surface-950 hover:bg-brand-400">Continue to {reviewSteps[reviewStep + 1]} <ChevronRight size={13} /></button> : <button type="button" onClick={() => setMode("review")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-surface-950 hover:bg-brand-400">Finish review <Check size={13} /></button>}
              </div>
            </section>
            </div>
          </div>
        </div>
      )}
      {chartOpen && selectedReview && <TradeReviewChartModal sessionId={sessionId} record={selectedReview} onClose={() => setChartOpen(false)} />}
      {previewAttachment && <div className="fixed inset-0 z-[140] grid place-items-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-label={previewAttachment.name} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewAttachment(null); }}><div className="relative max-h-full max-w-6xl"><Image unoptimized width={1600} height={1000} src={previewAttachment.dataUrl} alt={previewAttachment.name} className="max-h-[88vh] w-auto rounded-xl object-contain shadow-2xl" /><button type="button" onClick={() => setPreviewAttachment(null)} aria-label="Close image preview" className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-lg bg-black/75 text-white"><X size={16} /></button><p className="mt-2 text-center text-xs text-white/75">{previewAttachment.name}</p></div></div>}
    </div>
  );
}
