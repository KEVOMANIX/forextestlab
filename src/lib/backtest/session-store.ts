/**
 * Session store — the server-side persistence boundary. The bounded replay
 * window is also sent to the browser so playback is smooth and independent of
 * request latency; server checkpoints remain authoritative for resume/history.
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
import { TIMEFRAME_MS, type Candle, type Timeframe } from "@/lib/market-data/types";
import { createSessionState, publicSessionState } from "./replay-engine";
import { buildSessionConfig } from "./session-config";
import type {
  EngineContext,
  PublicSessionState,
  SessionState,
} from "./types";
import { normalizeReplaySpeed } from "./types";

/** Bounded replay chunk size; longer sessions are extended progressively. */
const MAX_SESSION_CANDLES = 1500;
const MAX_CONTEXT_CANDLES = 3000;
const CONTEXT_LOOKBACK_MS = 183 * 24 * 60 * 60 * 1000;

/**
 * In-memory cache of each session's candle series. A session's candles never
 * change, so this safely avoids re-querying the (possibly remote) database on
 * every replay step. Per-process only — on serverless it warms per instance and
 * simply falls back to a DB fetch on a cold instance.
 */
const candleCache = new Map<string, Candle[]>();
const contextCache = new Map<string, Candle[]>();
const CANDLE_CACHE_MAX = 50;

function cacheCandles(id: string, candles: Candle[]): void {
  if (candleCache.size >= CANDLE_CACHE_MAX) {
    const oldest = candleCache.keys().next().value;
    if (oldest) candleCache.delete(oldest);
  }
  candleCache.set(id, candles);
}

function cacheContext(key: string, candles: Candle[]): void {
  if (contextCache.size >= CANDLE_CACHE_MAX) {
    const oldest = contextCache.keys().next().value;
    if (oldest) contextCache.delete(oldest);
  }
  contextCache.set(key, candles);
}

export interface CreateSessionParams {
  name: string;
  tags?: string[];
  symbols: string[];
  symbol: string;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  startingBalance?: string;
  spreadPips?: string;
  commissionPerLot?: string;
  slippagePips?: string;
  executionPolicy?: "conservative" | "optimistic";
  userId?: string;
}

export interface LoadedSession {
  id: string;
  token: string;
  userId: string | null;
  anonymous: boolean;
  anonymousExpiresAt: Date | null;
  ctx: EngineContext;
  contextCandles: Candle[];
  notes: string;
}

function currentCandleOf(ctx: EngineContext): Candle | null {
  const i = ctx.state.visibleIndex;
  if (i < 0 || i >= ctx.candles.length) return null;
  return ctx.candles[i] ?? null;
}

/** Strip the engine state down to what is safe to send to the browser. */
export function toPublicState(
  ctx: EngineContext,
  anonymous = false,
): PublicSessionState {
  return publicSessionState(ctx, anonymous);
}

/** Candles revealed so far, used to initialise the visible chart series. */
export function visibleCandles(ctx: EngineContext): Candle[] {
  return ctx.candles.slice(0, ctx.state.visibleIndex + 1);
}

export async function visiblePairCandles(
  session: LoadedSession,
  symbol: string,
): Promise<{
  candles: Candle[];
  contextCandles: Candle[];
  pipSize: string;
  pricePrecision: number;
}> {
  const allowed = session.ctx.state.config.symbols?.length
    ? session.ctx.state.config.symbols
    : [session.ctx.state.config.symbol];
  if (!allowed.includes(symbol)) {
    throw new Error("This pair is not part of the session.");
  }
  const definition = getSymbolDefinition(symbol);
  if (!definition) throw new Error("Unknown currency pair.");

  if (symbol === session.ctx.state.config.symbol) {
    return {
      candles: visibleCandles(session.ctx),
      contextCandles: await getChartContext(session, symbol),
      pipSize: definition.pipSize,
      pricePrecision: definition.pricePrecision,
    };
  }

  const current = currentCandleOf(session.ctx)?.timestamp;
  const [series, contextCandles] = await Promise.all([
    fetchSeries(
      symbol,
      session.ctx.state.config.timeframe,
      session.ctx.state.config.startTime,
      session.ctx.state.config.endTime,
    ),
    getChartContext(session, symbol),
  ]);
  return {
    candles: current
      ? series.filter((candle) => candle.timestamp <= current)
      : series.slice(0, session.ctx.state.config.initialVisibleCount),
    contextCandles,
    pipSize: definition.pipSize,
    pricePrecision: definition.pricePrecision,
  };
}

async function fetchChartContext(
  symbol: string,
  replayStartTime: number,
  timeframe: Timeframe,
  before = replayStartTime,
): Promise<Candle[]> {
  const lowerBound = Math.max(0, replayStartTime - CONTEXT_LOOKBACK_MS);
  const endTime = Math.min(before - 1, replayStartTime - 1);
  if (endTime < lowerBound) return [];
  // Fetch a bounded window immediately before `before`. The extra calendar
  // width covers weekends/holidays; slicing from the end keeps it adjacent to
  // the visible chart instead of returning the oldest part of six months.
  const windowMs = TIMEFRAME_MS[timeframe] * MAX_CONTEXT_CANDLES * 3;
  const candles = await getMarketDataProvider().getCandles({
    symbol,
    timeframe,
    startTime: Math.max(lowerBound, endTime - windowMs),
    endTime,
  });
  return candles.slice(-MAX_CONTEXT_CANDLES);
}

export async function getChartContext(
  session: LoadedSession,
  symbol = session.ctx.state.config.symbol,
  timeframe = session.ctx.state.config.timeframe,
): Promise<Candle[]> {
  const key = `${session.id}:${symbol}:${timeframe}`;
  const cached = contextCache.get(key);
  if (cached) return cached;
  const replayStartTime =
    session.ctx.candles[0]?.timestamp ?? session.ctx.state.config.startTime;
  const candles = await fetchChartContext(
    symbol,
    replayStartTime,
    timeframe,
  );
  cacheContext(key, candles);
  return candles;
}

export async function getChartContextPage(
  session: LoadedSession,
  symbol: string,
  timeframe: Timeframe,
  before: number,
): Promise<{ candles: Candle[]; hasMore: boolean }> {
  const allowed = session.ctx.state.config.symbols?.length
    ? session.ctx.state.config.symbols
    : [session.ctx.state.config.symbol];
  if (!allowed.includes(symbol)) throw new Error("This pair is not part of the session.");
  const replayStartTime =
    session.ctx.candles[0]?.timestamp ?? session.ctx.state.config.startTime;
  const candles = await fetchChartContext(
    symbol,
    replayStartTime,
    timeframe,
    before,
  );
  const lowerBound = Math.max(
    0,
    replayStartTime - CONTEXT_LOOKBACK_MS,
  );
  return {
    candles,
    hasMore: Boolean(candles[0] && candles[0].timestamp > lowerBound),
  };
}

async function fetchSeries(
  symbol: string,
  timeframe: Timeframe,
  startTime: number,
  endTime: number,
  limit = MAX_SESSION_CANDLES,
): Promise<Candle[]> {
  const provider = getMarketDataProvider();
  const candles = await provider.getCandles({
    symbol,
    timeframe,
    startTime,
    endTime,
    limit,
  });
  return candles.slice(0, limit);
}

export async function extendReplaySeries(
  session: LoadedSession,
): Promise<{ candles: Candle[]; hasMore: boolean }> {
  const { ctx } = session;
  const last = ctx.candles[ctx.candles.length - 1];
  if (!last || last.timestamp >= ctx.state.config.endTime) {
    return { candles: [], hasMore: false };
  }

  const next = await fetchSeries(
    ctx.state.config.symbol,
    ctx.state.config.timeframe,
    last.timestamp + TIMEFRAME_MS[ctx.state.config.timeframe],
    ctx.state.config.endTime,
  );
  const candles = next.filter((candle) => candle.timestamp > last.timestamp);
  if (candles.length === 0) return { candles: [], hasMore: false };

  ctx.candles.push(...candles);
  ctx.state.totalCandles = ctx.candles.length;
  cacheCandles(session.id, ctx.candles);
  await persistSession(session);

  const newest = candles[candles.length - 1];
  return {
    candles,
    hasMore: Boolean(
      newest &&
      newest.timestamp < ctx.state.config.endTime &&
      candles.length >= MAX_SESSION_CANDLES
    ),
  };
}

export async function createSession(
  params: CreateSessionParams,
): Promise<LoadedSession> {
  const unknownSymbol = params.symbols.find(
    (symbol) => !getSymbolDefinition(symbol),
  );
  if (unknownSymbol) throw new Error(`Unknown symbol "${unknownSymbol}".`);

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

  const source = firstCandle.source;
  const demoData = source === "demo";
  if (!params.userId && !demoData) {
    throw new Error(
      "Create a free account to use saved historical market data. Anonymous access is demonstration-only.",
    );
  }
  const contextCandles = await fetchChartContext(
    params.symbol,
    effectiveStart,
    params.timeframe,
  );

  const config = buildSessionConfig({
    name: params.name,
    symbols: params.symbols,
    tags: params.tags,
    symbol: def.symbol,
    baseCurrency: def.baseCurrency,
    quoteCurrency: def.quoteCurrency,
    pipSize: def.pipSize,
    pricePrecision: def.pricePrecision,
    timeframe: params.timeframe,
    // Preserve the dates the user chose. The candle series can begin later
    // (weekend/holiday) without silently changing the saved test period.
    startTime: params.startTime,
    endTime: params.endTime,
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
  cacheContext(`${id}:${params.symbol}:${params.timeframe}`, contextCandles);

  const instrument = await prisma.marketInstrument.findUnique({
    where: { symbol: def.symbol },
    select: { id: true },
  });

  await prisma.backtestSession.create({
    data: {
      id,
      token,
      userId: params.userId ?? null,
      anonymous: !params.userId,
      anonymousExpiresAt: params.userId
        ? null
        : new Date(Date.now() + 24 * 60 * 60 * 1000),
      instrumentId: instrument?.id ?? (await ensureInstrument(def.symbol)),
      symbol: def.symbol,
      timeframe: params.timeframe,
      startTime: BigInt(params.startTime),
      endTime: BigInt(params.endTime),
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

  return {
    id,
    token,
    userId: params.userId ?? null,
    anonymous: !params.userId,
    anonymousExpiresAt: params.userId
      ? null
      : new Date(Date.now() + 24 * 60 * 60 * 1000),
    ctx: { state, candles: series },
    contextCandles,
    notes: "",
  };
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
  state.speed = normalizeReplaySpeed(Number(state.speed));
  let series = candleCache.get(id);
  if (!series) {
    series = await fetchSeries(
      row.symbol,
      row.timeframe as Timeframe,
      Number(row.startTime),
      Number(row.endTime),
      Math.max(MAX_SESSION_CANDLES, state.totalCandles),
    );
    cacheCandles(id, series);
  }

  return {
    id: row.id,
    token: row.token,
    userId: row.userId,
    anonymous: row.anonymous,
    anonymousExpiresAt: row.anonymousExpiresAt,
    notes: row.notes ?? "",
    ctx: { state, candles: series },
    contextCandles: [],
  };
}

/** Persist the engine state and refresh relational projections. */
export async function persistSession(
  session: LoadedSession,
  options: { resetProjections?: boolean } = {},
): Promise<void> {
  const { state } = session.ctx;

  await prisma.backtestSession.update({
    where: { id: session.id },
    data: {
      status: state.status,
      speed: state.speed,
      visibleIndex: state.visibleIndex,
      totalCandles: state.totalCandles,
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

  if (options.resetProjections) {
    await prisma.simulatedTrade.deleteMany({ where: { sessionId: session.id } });
    await prisma.equitySnapshot.deleteMany({ where: { sessionId: session.id } });
    return;
  }

  // The common replay tick has no closed trades, so avoid a second database
  // round-trip on every candle. Projection work starts only after a trade exits.
  if (state.closedTrades.length === 0) return;

  // Mirror closed trades (append-only).
  const existingTrades = await prisma.simulatedTrade.count({
    where: { sessionId: session.id },
  });
  const tradesToInsert = state.closedTrades.slice(
    existingTrades,
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
