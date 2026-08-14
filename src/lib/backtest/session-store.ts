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
import { MAX_BUFFER_CANDLES } from "./replay-buffer";
import {
  assertSessionAllowed,
  getUserEntitlements,
  planEntitlements,
} from "@/lib/billing/entitlements";
import { getMarketDataProvider } from "@/lib/market-data";
import { getSymbolDefinition } from "@/lib/market-data/symbols";
import { nextTimeframeTimestamp, TIMEFRAME_MS, type Candle, type Timeframe } from "@/lib/market-data/types";
import { createSessionState, normalizeSessionState, publicSessionState } from "./replay-engine";
import type { PropFirmRules } from "./prop-firm";
import { buildSessionConfig } from "./session-config";
import type {
  EngineContext,
  PublicSessionState,
  SessionState,
} from "./types";
import { normalizeReplaySpeed } from "./types";
import { TRIAL_SESSION_LIMIT } from "@/lib/trial-device";
import {
  prepareSessionSnapshot,
  readSessionSnapshot,
} from "./state-snapshot-store";

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
  propFirm?: PropFirmRules;
  userId?: string;
  trialDeviceId?: string | null;
  trialSession?: boolean;
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
  stateObjectKey: string | null;
}

/**
 * Cache parsed state for active sessions in the long-running Lightsail process.
 * Mutations are still persisted before their response is returned, so a
 * restart safely falls back to PostgreSQL without losing progress.
 */
const activeSessionCache = new Map<string, LoadedSession>();
const ACTIVE_SESSION_CACHE_MAX = 20;

function cacheActiveSession(session: LoadedSession): LoadedSession {
  activeSessionCache.delete(session.id);
  activeSessionCache.set(session.id, session);
  while (activeSessionCache.size > ACTIVE_SESSION_CACHE_MAX) {
    const oldest = activeSessionCache.keys().next().value;
    if (!oldest) break;
    activeSessionCache.delete(oldest);
  }
  return session;
}

export function dropActiveSession(id: string): void {
  activeSessionCache.delete(id);
  candleCache.delete(id);
}

/**
 * Minimal persisted data needed to resume a session in the browser.
 *
 * Keep `stateJson` opaque here. Parsing and cloning a large trading history in
 * a Worker can exhaust the free-plan CPU allowance; the browser already
 * normalises persisted state when it hydrates its local replay engine.
 */
export interface ResumeSessionSnapshot {
  token: string;
  userId: string | null;
  anonymous: boolean;
  anonymousExpiresAt: Date | null;
  notes: string;
  stateJson: string;
  visibleIndex: number;
  status: string;
  candles: Candle[];
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

/**
 * Revealed candles plus a bounded runway ahead of the reveal cursor — enough
 * for the client's own local replay engine to play smoothly without a fetch
 * on every candle, but never the rest of the session.
 *
 * This used to be `ctx.candles` in full. That was every candle this server
 * process had ever fetched for the session — which, after enough
 * `extendReplaySeries` calls over a long or fast-replayed session, is
 * unbounded and can run far ahead of `visibleIndex`. A trader opening dev
 * tools (or just a slow network letting a response arrive after the fact)
 * could read outcomes the replay had not reached yet.
 */
export function bufferedReplayCandles(ctx: EngineContext): Candle[] {
  return ctx.candles.slice(0, ctx.state.visibleIndex + 1 + MAX_BUFFER_CANDLES);
}

/**
 * Chart data for one of the session's symbols.
 *
 * `full` returns the revealed slice plus the same bounded runway
 * `bufferedReplayCandles` grants the session's own symbol, instead of just
 * the revealed candles, so a multi-chart layout can advance its extra cells
 * on the browser's replay clock instead of a network round-trip per candle —
 * without handing over the rest of the session for a pair the trader is not
 * even trading.
 */
export async function visiblePairCandles(
  session: LoadedSession,
  symbol: string,
  full = false,
  after?: number,
  requestedClock?: number,
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
    const candles = full ? bufferedReplayCandles(session.ctx) : visibleCandles(session.ctx);
    return {
      candles: after == null ? candles : candles.filter((candle) => candle.timestamp > after),
      contextCandles: after == null ? await getChartContext(session, symbol) : [],
      pipSize: definition.pipSize,
      pricePrecision: definition.pricePrecision,
    };
  }

  const primary = session.ctx.candles;
  const serverClock = currentCandleOf(session.ctx)?.timestamp;
  const requested = Number.isFinite(requestedClock)
    ? Math.min(requestedClock!, primary.at(-1)?.timestamp ?? requestedClock!)
    : serverClock;
  let clockIndex = session.ctx.state.visibleIndex;
  if (requested != null) {
    let low = 0;
    let high = primary.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((primary[mid]?.timestamp ?? 0) <= requested) low = mid + 1;
      else high = mid;
    }
    clockIndex = Math.max(0, low - 1);
  }
  const current = primary[clockIndex]?.timestamp ?? serverClock;
  // Match the exact final timestamp in the primary chart's candle buffer.
  const bufferCutoff =
    primary[Math.min(primary.length - 1, clockIndex + MAX_BUFFER_CANDLES)]?.timestamp ??
    current;
  await ensureSessionPairCandles(session, [symbol]);
  const series = session.ctx.pairCandles?.[symbol] ?? [];
  const contextCandles = after == null ? await getChartContext(session, symbol) : [];
  const visible = full
    ? bufferCutoff != null
      ? series.filter((candle) => candle.timestamp <= bufferCutoff)
      : series.slice(0, session.ctx.state.config.initialVisibleCount + MAX_BUFFER_CANDLES)
    : current != null
      ? series.filter((candle) => candle.timestamp <= current)
      : series.slice(0, session.ctx.state.config.initialVisibleCount);
  return {
    candles: after == null ? visible : visible.filter((candle) => candle.timestamp > after),
    contextCandles,
    pipSize: definition.pipSize,
    pricePrecision: definition.pricePrecision,
  };
}

/**
 * Keep every active symbol loaded through the primary series' latest timestamp.
 * The primary symbol remains the replay clock; secondary series may omit market
 * bars, but they can never silently end merely because they were added later.
 */
export async function ensureSessionPairCandles(
  session: LoadedSession,
  symbols = session.ctx.state.config.symbols ?? [session.ctx.state.config.symbol],
): Promise<void> {
  const { ctx } = session;
  const target = ctx.candles.at(-1)?.timestamp;
  if (target == null) return;
  const pairCandles = (ctx.pairCandles ??= {});
  await Promise.all(
    symbols
      .filter((symbol) => symbol !== ctx.state.config.symbol)
      .map(async (symbol) => {
        const current = pairCandles[symbol] ?? [];
        let start = current.at(-1)
          ? nextTimeframeTimestamp(
              current.at(-1)!.timestamp,
              ctx.state.config.timeframe,
            )
          : ctx.state.config.startTime;
        const additions: Candle[] = [];
        let pages = 0;
        while (start <= target && pages < 100) {
          pages += 1;
          const page = await fetchSeries(
            symbol,
            ctx.state.config.timeframe,
            start,
            target,
          );
          const fresh = page.filter(
            (candle) => candle.timestamp >= start && candle.timestamp <= target,
          );
          if (!fresh.length) break;
          additions.push(...fresh);
          const newest = fresh.at(-1)!;
          if (newest.timestamp >= target) break;
          const next = nextTimeframeTimestamp(
            newest.timestamp,
            ctx.state.config.timeframe,
          );
          if (next <= start) break;
          start = next;
        }
        if (additions.length) {
          const merged = [...current, ...additions];
          pairCandles[symbol] = merged.filter(
            (candle, index) =>
              index === 0 || candle.timestamp !== merged[index - 1]?.timestamp,
          );
        } else if (!pairCandles[symbol]) {
          pairCandles[symbol] = [];
        }
      }),
  );
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

export async function loadResumeSessionSnapshot(
  id: string,
): Promise<ResumeSessionSnapshot | null> {
  const row = await prisma.backtestSession.findUnique({
    where: { id },
    select: {
      token: true,
      userId: true,
      anonymous: true,
      anonymousExpiresAt: true,
      notes: true,
      stateJson: true,
      stateObjectKey: true,
      symbol: true,
      timeframe: true,
      startTime: true,
      endTime: true,
      visibleIndex: true,
      status: true,
      totalCandles: true,
    },
  });
  if (!row) return null;
  const stateJson = await readSessionSnapshot(row.stateJson, row.stateObjectKey);

  let series = candleCache.get(id);
  if (!series) {
    series = await fetchSeries(
      row.symbol,
      row.timeframe as Timeframe,
      Number(row.startTime),
      Number(row.endTime),
      Math.max(MAX_SESSION_CANDLES, row.totalCandles),
    );
    cacheCandles(id, series);
  }

  return {
    token: row.token,
    userId: row.userId,
    anonymous: row.anonymous,
    anonymousExpiresAt: row.anonymousExpiresAt,
    notes: row.notes ?? "",
    stateJson,
    visibleIndex: row.visibleIndex,
    status: row.status,
    candles: series.slice(0, row.visibleIndex + 1 + MAX_BUFFER_CANDLES),
  };
}

/**
 * The next chunk of replay candles beyond what the browser currently holds.
 *
 * `clientCandleCount` is how many candles the caller's own local engine array
 * holds — not necessarily `ctx.candles.length`. Since a response only ever
 * ships `bufferedReplayCandles` (revealed plus a bounded runway, see there),
 * a session resumed after a long or fast-replayed run can have this server
 * process already holding candles well past what any response ever sent: a
 * long play session extends `ctx.candles` in step with the trader's own
 * pace, then a page reload's initial response caps what goes out again. That
 * surplus is served straight from `ctx.candles` — no provider round trip —
 * and only once the caller has caught up to it does this reach out for
 * anything actually new. Skipping this and always fetching from `ctx.candles`'s
 * own tail would silently skip whatever the surplus was, leaving a gap in the
 * browser's candle array with no error to say so.
 */
export async function extendReplaySeries(
  session: LoadedSession,
  clientCandleCount: number,
): Promise<{ candles: Candle[]; hasMore: boolean }> {
  const { ctx } = session;

  if (clientCandleCount < ctx.candles.length) {
    const page = ctx.candles.slice(clientCandleCount, clientCandleCount + MAX_BUFFER_CANDLES);
    const tail = ctx.candles[ctx.candles.length - 1];
    const cachedReachedEnd = Boolean(tail && tail.timestamp >= ctx.state.config.endTime);
    const remainingCached = ctx.candles.length - (clientCandleCount + page.length);
    return { candles: page, hasMore: remainingCached > 0 || !cachedReachedEnd };
  }

  const last = ctx.candles[ctx.candles.length - 1];
  if (!last || last.timestamp >= ctx.state.config.endTime) {
    return { candles: [], hasMore: false };
  }

  const next = await fetchSeries(
    ctx.state.config.symbol,
    ctx.state.config.timeframe,
    nextTimeframeTimestamp(last.timestamp, ctx.state.config.timeframe),
    ctx.state.config.endTime,
  );
  const candles = next.filter((candle) => candle.timestamp > last.timestamp);
  if (candles.length === 0) return { candles: [], hasMore: false };

  ctx.candles.push(...candles);
  ctx.state.totalCandles = ctx.candles.length;
  await ensureSessionPairCandles(session);
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

  if (params.userId) {
    const entitlements = await getUserEntitlements(params.userId);
    assertSessionAllowed(entitlements, params);
    if (
      entitlements.plan === "free" &&
      (!params.trialSession ||
        params.symbol !== "EURUSD" ||
        params.symbols.length !== 1)
    ) {
      throw new Error(
        "Trial sessions use EUR/USD and a randomly selected one-month period.",
      );
    }
  }

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
      "Create a free account to use saved historical market data. Anonymous access uses sample data only.",
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
    propFirm: params.propFirm,
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

  const instrumentId = instrument?.id ?? (await ensureInstrument(def.symbol));
  const initialStateJson = JSON.stringify(state);
  const sessionData = {
      id,
      token,
      userId: params.userId ?? null,
      anonymous: !params.userId,
      anonymousExpiresAt: params.userId
        ? null
        : new Date(Date.now() + 24 * 60 * 60 * 1000),
      instrumentId,
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
      stateJson: initialStateJson,
      stateSizeBytes: Buffer.byteLength(initialStateJson),
  };

  if (params.userId) {
    await prisma.$transaction(async (tx) => {
      const profile = await tx.userProfile.findUnique({
        where: { id: params.userId },
        select: {
          billingStatus: true,
          proAccessUntil: true,
        },
      });
      if (!profile) throw new Error("Account profile not found.");

      const entitlements = planEntitlements(profile);
      assertSessionAllowed(entitlements, params);
      if (entitlements.plan === "free") {
        if (
          !params.trialSession ||
          params.symbol !== "EURUSD" ||
          params.symbols.length !== 1
        ) {
          throw new Error(
            "Trial sessions use EUR/USD and a randomly selected one-month period.",
          );
        }
        if (!params.trialDeviceId) {
          throw new Error(
            "Your trial device could not be verified. Refresh the page and try again.",
          );
        }
        await tx.trialDevice.upsert({
          where: { id: params.trialDeviceId },
          create: { id: params.trialDeviceId },
          update: {},
        });
        const claimed = await tx.trialDevice.updateMany({
          where: {
            id: params.trialDeviceId,
            sessionsUsed: { lt: TRIAL_SESSION_LIMIT },
          },
          data: {
            sessionsUsed: { increment: 1 },
            lastUsedAt: new Date(),
          },
        });
        if (claimed.count !== 1) {
          throw new Error(
            "This device has used its three trial sessions. Upgrade to continue with unlimited sessions.",
          );
        }
        await tx.backtestSession.create({
          data: { ...sessionData, trialDeviceId: params.trialDeviceId },
          select: { id: true },
        });
        return;
      }
      await tx.backtestSession.create({
        data: sessionData,
        select: { id: true },
      });
    });
  } else {
    await prisma.backtestSession.create({
      data: sessionData,
      select: { id: true },
    });
  }

  return cacheActiveSession({
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
    stateObjectKey: null,
  });
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
  const cachedSession = activeSessionCache.get(id);
  if (cachedSession) return cacheActiveSession(cachedSession);

  const row = await prisma.backtestSession.findUnique({ where: { id } });
  if (!row) return null;

  const stateJson = await readSessionSnapshot(row.stateJson, row.stateObjectKey);
  const state = normalizeSessionState(JSON.parse(stateJson) as SessionState);
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

  return cacheActiveSession({
    id: row.id,
    token: row.token,
    userId: row.userId,
    anonymous: row.anonymous,
    anonymousExpiresAt: row.anonymousExpiresAt,
    notes: row.notes ?? "",
    stateObjectKey: row.stateObjectKey,
    ctx: { state, candles: series },
    contextCandles: [],
  });
}

/** Persist the engine state and refresh relational projections. */
export async function persistSession(
  session: LoadedSession,
  options: { resetProjections?: boolean } = {},
): Promise<void> {
  const { state } = session.ctx;
  const snapshot = await prepareSessionSnapshot(
    session.id,
    state,
    session.stateObjectKey,
  );

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
      stateJson: snapshot.stateJson,
      stateObjectKey: snapshot.stateObjectKey,
      stateSizeBytes: snapshot.stateSizeBytes,
    },
    // Without a select Prisma returns the large stateJson we just uploaded.
    // The caller discards it, but Supabase still counts that return as egress.
    select: { id: true },
  });

  session.stateObjectKey = snapshot.stateObjectKey;

  cacheActiveSession(session);

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
