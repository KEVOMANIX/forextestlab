"use client";

import { Camera, Check, FlaskConical, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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

function tagText(tags: string[]): string {
  return tags.join(", ");
}

function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);
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
      <figcaption className="flex items-center justify-between border-b app-border px-2.5 py-1.5 text-[10px] app-muted">
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
  const [selectedId, setSelectedId] = useState<string | null>(records[0]?.journalId ?? null);
  const selected = records.find((record) => record.journalId === selectedId) ?? records[0] ?? null;
  const [draft, setDraft] = useState<TradeJournalUpdate | null>(selected ? editable(selected.journal) : null);
  const [setupText, setSetupText] = useState(selected ? tagText(selected.journal.setupTags) : "");
  const [mistakeText, setMistakeText] = useState(selected ? tagText(selected.journal.mistakeTags) : "");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const savedHash = useRef("");

  useEffect(() => {
    if (!selected) return;
    const next = editable(selected.journal);
    setDraft(next);
    setSetupText(tagText(next.setupTags));
    setMistakeText(tagText(next.mistakeTags));
    savedHash.current = JSON.stringify(next);
    setSelectedId(selected.journalId);
    setSaveState("saved");
  }, [selected?.journalId, selected?.journal.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected || !draft || anonymous) return;
    const hash = JSON.stringify(draft);
    if (hash === savedHash.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        await onSave(selected.journalId, draft);
        savedHash.current = hash;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [anonymous, draft, onSave, selected]);

  if (!records.length) {
    return <p className="p-4 text-sm app-muted">A journal will be created automatically when you place a trade.</p>;
  }
  if (!selected || !draft) return null;

  const patch = (value: Partial<TradeJournalUpdate>) => setDraft((current) => current ? { ...current, ...value } : current);
  return (
    <div className="grid min-h-[360px] md:grid-cols-[210px_minmax(0,1fr)]">
      <aside className="border-b app-border p-2 md:border-b-0 md:border-r">
        <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider app-muted">Trade journals</p>
        <div className="flex gap-1 overflow-x-auto md:block md:max-h-[470px] md:space-y-1 md:overflow-y-auto">
          {records.map((record, index) => (
            <button key={record.journalId} type="button" onClick={() => setSelectedId(record.journalId)} className={`min-w-40 rounded-lg border p-2 text-left text-xs md:block md:w-full ${record.journalId === selected.journalId ? "border-brand-400/40 bg-brand-400/10" : "app-border hover:bg-white/[0.03]"}`}>
              <span className="flex items-center justify-between gap-2">
                <strong className={record.direction === "long" ? "text-brand-300" : "text-bear"}>#{records.length - index} {record.direction === "long" ? "BUY" : "SELL"}</strong>
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] uppercase app-muted">{record.open ? "open" : record.journal.validity}</span>
              </span>
              <span className="mt-1 block font-mono app-muted">{record.entryPrice} · {record.lots} lots</span>
              {record.pnl !== null && <span className={`mt-1 block font-mono ${Number(record.pnl) >= 0 ? "text-brand-300" : "text-bear"}`}>{Number(record.pnl) >= 0 ? "+" : ""}{Number(record.pnl).toFixed(2)}</span>}
            </button>
          ))}
        </div>
      </aside>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {(["valid", "invalid", "experimental"] as const).map((value) => (
              <button key={value} type="button" onClick={() => patch({ validity: value })} aria-pressed={draft.validity === value} className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize ${draft.validity === value ? "border-brand-400/40 bg-brand-400/10 text-brand-300" : "app-border app-muted"}`}>
                {value === "experimental" && <FlaskConical size={10} className="mr-1 inline" />}{value}
              </button>
            ))}
          </div>
          <span className={`inline-flex items-center gap-1 text-[10px] ${saveState === "error" ? "text-bear" : "app-muted"}`}>
            {saveState === "saved" ? <Check size={11} /> : <Save size={11} />}{anonymous ? "Sign in to save journals" : saveState === "saving" ? "Autosaving…" : saveState === "error" ? "Autosave failed" : "Saved"}
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className="text-xs"><span className="mb-1 block app-muted">Entry reason</span><textarea rows={4} className="app-input w-full resize-y" value={draft.entryReason} onChange={(event) => patch({ entryReason: event.target.value })} placeholder="Why was this entry valid?" /></label>
          <label className="text-xs"><span className="mb-1 block app-muted">Exit review</span><textarea rows={4} className="app-input w-full resize-y" value={draft.exitReview} onChange={(event) => patch({ exitReview: event.target.value })} placeholder="What happened, and what would you repeat or change?" /></label>
          <label className="text-xs"><span className="mb-1 block app-muted">Setup tags <span className="text-[10px]">(comma separated)</span></span><input className="app-input w-full" value={setupText} onChange={(event) => { setSetupText(event.target.value); patch({ setupTags: parseTags(event.target.value) }); }} placeholder="breakout, pullback, London open" /></label>
          <label className="text-xs"><span className="mb-1 block app-muted">Mistake tags <span className="text-[10px]">(comma separated)</span></span><input className="app-input w-full" value={mistakeText} onChange={(event) => { setMistakeText(event.target.value); patch({ mistakeTags: parseTags(event.target.value) }); }} placeholder="FOMO, early exit, oversized" /></label>
          <label className="text-xs"><span className="mb-1 block app-muted">Emotion</span><input className="app-input w-full" value={draft.emotion} onChange={(event) => patch({ emotion: event.target.value })} placeholder="Calm, anxious, impatient…" maxLength={40} /></label>
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
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold"><Camera size={13} /> Chart snapshots <span className="app-muted">({selected.journal.beforeEntrySnapshot ? 1 : 0}/{selected.journal.afterExitSnapshot ? 1 : 0})</span></summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Snapshot snapshot={selected.journal.beforeEntrySnapshot} label="Before entry" />
            <Snapshot snapshot={selected.journal.afterExitSnapshot} label="After exit" />
          </div>
        </details>
      </div>
    </div>
  );
}
