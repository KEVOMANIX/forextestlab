/**
 * Session store — the server-side boundary that owns the full candle series and
 * enforces FUTURE-DATA PROTECTION: the complete series is fetched and held on
 * the server; only candles up to `visibleIndex` are ever exposed to the client.
 *
 * The engine SessionState is persisted as JSON (authoritative for stepping);
 * closed trades and equity points are also mirrored into relational tables for
 * history/results queries and to satisfy the data model.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import { getMarketDataProvider } from "@/lib/market-data";
import { getSymbolDefinition } from "@/lib/market-data/symbols";
import type { Candle, Timeframe } from "@/lib/market-data/types";
import { createSessionState } from "./replay-engine";
import { buildSessionConfig } from "./session-config";
import type {
  EngineContext,
  PublicSessionState,
  SessionState,
} from "./types";

/** Bound the candle count per session so reloads stay fast. */
const MAX_SESSION_CANDLES = 1500;

/**
 * In-memory cache of each session's candle series. A session's candles never
 * change, so this safely avoids re-querying the (possibly remote) database on
 * every replay step. Per-process only — on serverless it warms per instance and
 * simply falls back to a DB fetch on a cold instance.
 */
const candleCache = new Map<string, Candle[]>();
const CANDLE_CACHE_MAX = 50;

function cacheCandles(id: string, candles: Candle[]): void {
  if (candleCache.size >= CANDLE_CACHE_MAX) {
    const oldest = candleCache.keys().next().value;
    if (oldest) candleCache.delete(oldest);
  }
  candleCache.set(id, candles);
}

export interface CreateSessionParams {
  symbol: string;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  startingBalance?: string;
  spreadPips?: string;
  commissionPerLot?: string;
  slippagePips?: string;
  executionPolicy?: "conservative" | "optimistic";
}

export interface LoadedSession {
  id: string;
  token: string;
  ctx: EngineContext;
  notes: string;
}

function currentCandleOf(ctx: EngineContext): Candle | null {
  const i = ctx.state.visibleIndex;
  if (i < 0 || i >= ctx.candles.length) return null;
  return ctx.candles[i] ?? null;
}

/** Strip the engine state down to what is safe to send to the browser. */
export function toPublicState(ctx: EngineContext): PublicSessionState {
  const { state } = ctx;
  const candle = currentCandleOf(ctx);
  return {
    sessionId: state.sessionId,
    config: state.config,
    status: state.status,
    speed: state.speed,
    visibleIndex: state.visibleIndex,
    totalCandles: state.totalCandles,
    balance: state.balance,
    equity: state.equity,
    maxDrawdown: state.maxDrawdown,
    maxDrawdownPercent: state.maxDrawdownPercent,
    currentPrice: candle ? candle.close : null,
    currentTime: candle ? candle.timestamp : null,
    openPosition: state.openPosition,
    closedTrades: state.closedTrades,
    equityCurve: state.equityCurve,
    lockedBeforeIndex: state.lockedBeforeIndex,
    dataSource: state.dataSource,
    demoData: state.demoData,
  };
}

/** Candles revealed so far (never includes future candles). */
export function visibleCandles(ctx: EngineContext): Candle[] {
  return ctx.candles.slice(0, ctx.state.visibleIndex + 1);
}

async function fetchSeries(
  symbol: string,
  timeframe: Timeframe,
  startTime: number,
  endTime: number,
): Promise<Candle[]> {
  const provider = getMarketDataProvider();
  const candles = await provider.getCandles({
    symbol,
    timeframe,
    startTime,
    endTime,
  });
  return candles.slice(0, MAX_SESSION_CANDLES);
}

export async function createSession(
  params: CreateSessionParams,
): Promise<LoadedSession> {
  const def = getSymbolDefinition(params.symbol);
  if (!def) throw new Error(`Unknown symbol "${params.symbol}".`);

  const series = await fetchSeries(
    params.symbol,
    params.timeframe,
    params.startTime,
    params.endTime,
  );
  if (series.length < 2) {
    throw new Error("Not enough historical data for the selected range.");
  }

  // Clamp the stored range to the actual series so reloads reconstruct it exactly.
  const firstCandle = series[0];
  const lastCandle = series[series.length - 1];
  if (!firstCandle || !lastCandle) {
    throw new Error("Historical data could not be loaded.");
  }
  const effectiveStart = firstCandle.timestamp;
  const effectiveEnd = lastCandle.timestamp;

  const source = firstCandle.source;
  const demoData = source === "demo";

  const config = buildSessionConfig({
    symbol: def.symbol,
    baseCurrency: def.baseCurrency,
    quoteCurrency: def.quoteCurrency,
    pipSize: def.pipSize,
    pricePrecision: def.pricePrecision,
    timeframe: params.timeframe,
    startTime: effectiveStart,
    endTime: effectiveEnd,
    startingBalance: params.startingBalance,
    spreadPips: params.spreadPips,
    commissionPerLot: params.commissionPerLot,
    slippagePips: params.slippagePips,
    executionPolicy: params.executionPolicy,
  });

  const id = randomUUID();
  const token = randomUUID();
  const state = createSessionState(
    id,
    config,
    series.length,
    series,
    source,
    demoData,
  );

  cacheCandles(id, series);

  const instrument = await prisma.marketInstrument.findUnique({
    where: { symbol: def.symbol },
    select: { id: true },
  });

  await prisma.backtestSession.create({
    data: {
      id,
      token,
      instrumentId: instrument?.id ?? (await ensureInstrument(def.symbol)),
      symbol: def.symbol,
      timeframe: params.timeframe,
      startTime: BigInt(effectiveStart),
      endTime: BigInt(effectiveEnd),
      status: state.status,
      speed: state.speed,
      visibleIndex: state.visibleIndex,
      totalCandles: state.totalCandles,
      lockedBeforeIndex: state.lockedBeforeIndex,
      startingBalance: config.startingBalance,
      balance: state.balance,
      equity: state.equity,
      maxEquity: state.maxEquity,
      maxDrawdown: state.maxDrawdown,
      maxDrawdownPercent: state.maxDrawdownPercent,
      accountCurrency: config.accountCurrency,
      spreadPips: config.spreadPips,
      commissionPerLot: config.commissionPerLot,
      slippagePips: config.slippagePips,
      executionPolicy: config.executionPolicy,
      dataSource: source,
      demoData,
      notes: "",
      stateJson: JSON.stringify(state),
    },
  });

  return { id, token, ctx: { state, candles: series }, notes: "" };
}

async function ensureInstrument(symbol: string): Promise<string> {
  const def = getSymbolDefinition(symbol);
  if (!def) throw new Error(`Unknown symbol "${symbol}".`);
  const created = await prisma.marketInstrument.upsert({
    where: { symbol: def.symbol },
    update: {},
    create: {
      symbol: def.symbol,
      displayName: def.displayName,
      baseCurrency: def.baseCurrency,
      quoteCurrency: def.quoteCurrency,
      pipSize: def.pipSize,
      pricePrecision: def.pricePrecision,
      enabled: true,
    },
    select: { id: true },
  });
  return created.id;
}

export async function loadSession(id: string): Promise<LoadedSession | null> {
  const row = await prisma.backtestSession.findUnique({ where: { id } });
  if (!row) return null;

  const state = JSON.parse(row.stateJson) as SessionState;
  let series = candleCache.get(id);
  if (!series) {
    series = await fetchSeries(
      row.symbol,
      row.timeframe as Timeframe,
      Number(row.startTime),
      Number(row.endTime),
    );
    cacheCandles(id, series);
  }

  return {
    id: row.id,
    token: row.token,
    notes: row.notes ?? "",
    ctx: { state, candles: series },
  };
}

/** Persist the engine state and refresh relational projections. */
export async function persistSession(
  session: LoadedSession,
): Promise<void> {
  const { state } = session.ctx;

  await prisma.backtestSession.update({
    where: { id: session.id },
    data: {
      status: state.status,
      speed: state.speed,
      visibleIndex: state.visibleIndex,
      lockedBeforeIndex: state.lockedBeforeIndex,
      balance: state.balance,
      equity: state.equity,
      maxEquity: state.maxEquity,
      maxDrawdown: state.maxDrawdown,
      maxDrawdownPercent: state.maxDrawdownPercent,
      notes: session.notes,
      stateJson: JSON.stringify(state),
    },
  });

  // Mirror closed trades (append-only, reset on restart).
  const existingTrades = await prisma.simulatedTrade.count({
    where: { sessionId: session.id },
  });
  if (state.closedTrades.length < existingTrades) {
    // Restart happened: clear projections and rewrite.
    await prisma.simulatedTrade.deleteMany({ where: { sessionId: session.id } });
    await prisma.equitySnapshot.deleteMany({ where: { sessionId: session.id } });
  }
  const tradesToInsert = state.closedTrades.slice(
    state.closedTrades.length < existingTrades ? 0 : existingTrades,
  );
  if (tradesToInsert.length > 0) {
    await prisma.simulatedTrade.createMany({
      data: tradesToInsert.map((t) => ({
        sessionId: session.id,
        direction: t.direction,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        entryTime: BigInt(t.entryTime),
        exitTime: BigInt(t.exitTime),
        entryIndex: t.entryIndex,
        exitIndex: t.exitIndex,
        lots: t.lots,
        stopLoss: t.stopLoss,
        takeProfit: t.takeProfit,
        commission: t.commission,
        pnl: t.pnl,
        pips: t.pips,
        exitReason: t.exitReason,
        intrabarAmbiguous: t.intrabarAmbiguous,
      })),
    });
  }
}
