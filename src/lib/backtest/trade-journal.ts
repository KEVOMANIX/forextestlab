import { d } from "@/lib/decimal";
import type {
  EngineContext,
  TradeChartSnapshot,
  TradeJournal,
  TradeJournalUpdate,
} from "./types";

const SNAPSHOT_CANDLES = 48;

export const DEFAULT_JOURNAL_RULES = [
  { id: "setup", label: "Setup matched my plan", followed: false },
  { id: "risk", label: "Risk was defined before entry", followed: false },
  { id: "trigger", label: "I waited for the entry trigger", followed: false },
  { id: "management", label: "I followed my management rules", followed: false },
] as const;

export function captureTradeSnapshot(
  ctx: EngineContext,
  index = ctx.state.visibleIndex,
): TradeChartSnapshot | null {
  const end = Math.min(index, ctx.candles.length - 1);
  if (end < 0) return null;
  const start = Math.max(0, end - SNAPSHOT_CANDLES + 1);
  return {
    capturedAt: ctx.candles[end]?.timestamp ?? Date.now(),
    index: end,
    symbol: ctx.state.config.symbol,
    timeframe: ctx.state.config.timeframe,
    candles: ctx.candles.slice(start, end + 1).map((candle) => ({
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })),
  };
}

export function plannedRiskReward(
  entryPrice: string,
  stopLoss: string | null,
  takeProfit: string | null,
): string | null {
  if (!stopLoss || !takeProfit) return null;
  const risk = d(entryPrice).minus(stopLoss).abs();
  if (risk.isZero()) return null;
  return d(takeProfit).minus(entryPrice).abs().dividedBy(risk).toFixed(2);
}

export function createTradeJournal(
  ctx: EngineContext,
  entryPrice: string,
  stopLoss: string | null,
  takeProfit: string | null,
): TradeJournal {
  return {
    entryReason: "",
    exitReview: "",
    setupTags: [],
    mistakeTags: [],
    emotion: "",
    confidence: null,
    ruleChecklist: DEFAULT_JOURNAL_RULES.map((rule) => ({ ...rule })),
    plannedRR: plannedRiskReward(entryPrice, stopLoss, takeProfit),
    realizedR: null,
    validity: "valid",
    beforeEntrySnapshot: captureTradeSnapshot(ctx),
    afterExitSnapshot: null,
    updatedAt: Date.now(),
  };
}

export function emptyTradeJournal(
  entryPrice: string,
  stopLoss: string | null,
  takeProfit: string | null,
): TradeJournal {
  return {
    entryReason: "",
    exitReview: "",
    setupTags: [],
    mistakeTags: [],
    emotion: "",
    confidence: null,
    ruleChecklist: DEFAULT_JOURNAL_RULES.map((rule) => ({ ...rule })),
    plannedRR: plannedRiskReward(entryPrice, stopLoss, takeProfit),
    realizedR: null,
    validity: "valid",
    beforeEntrySnapshot: null,
    afterExitSnapshot: null,
    updatedAt: 0,
  };
}

export function normalizeTradeJournal(
  journal: TradeJournal | undefined,
): TradeJournal | undefined {
  if (!journal) return undefined;
  return {
    entryReason: journal.entryReason ?? "",
    exitReview: journal.exitReview ?? "",
    setupTags: journal.setupTags ?? [],
    mistakeTags: journal.mistakeTags ?? [],
    emotion: journal.emotion ?? "",
    confidence: journal.confidence ?? null,
    ruleChecklist:
      journal.ruleChecklist?.length
        ? journal.ruleChecklist
        : DEFAULT_JOURNAL_RULES.map((rule) => ({ ...rule })),
    plannedRR: journal.plannedRR ?? null,
    realizedR: journal.realizedR ?? null,
    validity: journal.validity ?? "valid",
    beforeEntrySnapshot: journal.beforeEntrySnapshot ?? null,
    afterExitSnapshot: journal.afterExitSnapshot ?? null,
    updatedAt: journal.updatedAt ?? 0,
  };
}

export function updateTradeJournal(
  ctx: EngineContext,
  journalId: string,
  update: TradeJournalUpdate,
): boolean {
  const records = [
    ...ctx.state.openPositions,
    ...ctx.state.closedTrades,
  ].filter((record) => (record.journalId ?? record.id) === journalId);
  if (!records.length) return false;
  const source = normalizeTradeJournal(records[0]?.journal);
  if (!source) return false;
  const next: TradeJournal = {
    ...source,
    ...update,
    setupTags: [...new Set(update.setupTags)],
    mistakeTags: [...new Set(update.mistakeTags)],
    ruleChecklist: update.ruleChecklist.map((rule) => ({ ...rule })),
    updatedAt: Date.now(),
  };
  for (const record of records) record.journal = structuredClone(next);
  return true;
}
