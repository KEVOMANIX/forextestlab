/**
 * Browser-side API client for the backtester. No secrets here — it only calls
 * our own server endpoints and carries the per-session token (issued at
 * creation) in a header to authorise mutating actions.
 */

import {
  TIMEFRAME_MS,
  type Candle,
  type MarketSymbol,
  type Timeframe,
} from "@/lib/market-data/types";
import type { PropFirmRules } from "./prop-firm";
import type { PublicSessionState, ReplaySpeed } from "./types";
import type { ActionInput } from "./schemas";

export interface CreateSessionBody {
  name: string;
  tags?: string[];
  symbols: string[];
  startTime: number;
  endTime: number;
  startingBalance?: string;
  spreadPips?: string;
  executionPolicy?: "conservative" | "optimistic";
  propFirm?: PropFirmRules;
}

export interface CreatedSession {
  ok: true;
  sessionId: string;
  token: string;
  state: PublicSessionState;
  candles: Candle[];
  replayCandles: Candle[];
  contextCandles: Candle[];
}
interface ActionOk {
  ok: true;
  state: PublicSessionState;
  newCandle: Candle | null;
}
interface StateOk {
  ok: true;
  state: PublicSessionState;
  candles: Candle[];
  replayCandles: Candle[];
  contextCandles: Candle[];
  notes: string;
}
interface ApiErr {
  ok: false;
  error: string;
  state?: PublicSessionState;
}

export interface PairChartData {
  symbol: string;
  candles: Candle[];
  contextCandles: Candle[];
  pipSize: string;
  pricePrecision: number;
}

export interface ChartHistoryPage {
  candles: Candle[];
  hasMore: boolean;
  timeframe: Timeframe;
}

interface ReplayExtensionOk {
  ok: true;
  candles: Candle[];
  hasMore: boolean;
}

async function parse<T>(res: Response): Promise<T | ApiErr> {
  try {
    return (await res.json()) as T | ApiErr;
  } catch {
    return { ok: false, error: `Request failed (${res.status}).` };
  }
}

export async function fetchSymbols(): Promise<MarketSymbol[]> {
  const res = await fetch("/api/backtest/symbols", { cache: "no-store" });
  const data = await parse<{ ok: true; symbols: MarketSymbol[] }>(res);
  return data.ok ? data.symbols : [];
}

export async function fetchRanges(
  symbol: string,
): Promise<{ startTime: number; endTime: number }[]> {
  const res = await fetch(
    `/api/backtest/ranges?symbol=${symbol}`,
    { cache: "no-store" },
  );
  const data = await parse<{
    ok: true;
    ranges: { startTime: number; endTime: number }[];
  }>(res);
  return data.ok ? data.ranges : [];
}

export async function createSession(
  body: CreateSessionBody,
): Promise<CreatedSession | ApiErr> {
  const res = await fetch("/api/backtest/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse<CreatedSession>(res) as Promise<CreatedSession | ApiErr>;
}

export async function createTrialSession(): Promise<CreatedSession | ApiErr> {
  const res = await fetch("/api/backtest/trial", { method: "POST" });
  return parse<CreatedSession>(res) as Promise<CreatedSession | ApiErr>;
}

export async function sendAction(
  sessionId: string,
  token: string | null,
  action: ActionInput,
): Promise<ActionOk | ApiErr> {
  const res = await fetch(`/api/backtest/sessions/${sessionId}/action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-session-token": token } : {}),
    },
    body: JSON.stringify(action),
  });
  return parse<ActionOk>(res) as Promise<ActionOk | ApiErr>;
}

export async function extendReplay(
  sessionId: string,
  token: string | null,
): Promise<ReplayExtensionOk | ApiErr> {
  try {
    const res = await fetch(`/api/backtest/sessions/${sessionId}/extend`, {
      method: "POST",
      headers: token ? { "x-session-token": token } : undefined,
    });
    return parse<ReplayExtensionOk>(res) as Promise<ReplayExtensionOk | ApiErr>;
  } catch {
    return { ok: false, error: "More replay data could not be loaded." };
  }
}

export async function extendSessionRange(
  sessionId: string,
  token: string | null,
  endTime: number,
): Promise<ReplayExtensionOk | ApiErr> {
  try {
    const res = await fetch(`/api/backtest/sessions/${sessionId}/extend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-session-token": token } : {}),
      },
      body: JSON.stringify({ endTime }),
    });
    return parse<ReplayExtensionOk>(res) as Promise<ReplayExtensionOk | ApiErr>;
  } catch {
    return { ok: false, error: "The additional market data could not be loaded." };
  }
}

export async function getState(sessionId: string): Promise<StateOk | ApiErr> {
  return getStateWithToken(sessionId, null);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Backoff for retrying a resume's state fetch. Short and few: this delays a
 * page load, not a background poll, and a real outage should surface rather
 * than hide behind a long retry loop.
 */
const RESUME_RETRY_DELAYS_MS = [400, 1200];

export async function getStateWithToken(
  sessionId: string,
  token: string | null,
): Promise<StateOk | ApiErr> {
  const attempt = () =>
    fetch(`/api/backtest/sessions/${sessionId}`, {
      cache: "no-store",
      headers: token ? { "x-session-token": token } : undefined,
    });

  let res: Response | null = null;
  try {
    res = await attempt();
  } catch {
    // A dropped connection on the very first try is worth one immediate retry
    // before falling into the backoff loop below.
  }

  // A transient server error — a database connection pool timeout under load,
  // say — must not cost the trader their whole session on a page reload. A
  // 4xx means the token or session itself is the problem, which retrying
  // cannot fix, so only the server's own failures (or none at all, on a
  // dropped connection) get a second chance.
  for (
    let index = 0;
    (!res || res.status >= 500) && index < RESUME_RETRY_DELAYS_MS.length;
    index += 1
  ) {
    await sleep(RESUME_RETRY_DELAYS_MS[index]!);
    try {
      res = await attempt();
    } catch {
      res = null;
    }
  }

  if (!res) {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
  return parse<StateOk>(res) as Promise<StateOk | ApiErr>;
}

export async function getPairChart(
  sessionId: string,
  token: string | null,
  symbol: string,
  /** Fetch the whole session series so the browser can reveal it on its own clock. */
  full = false,
): Promise<({ ok: true } & PairChartData) | ApiErr> {
  const res = await fetch(
    `/api/backtest/sessions/${sessionId}/pair?symbol=${encodeURIComponent(symbol)}${full ? "&full=1" : ""}`,
    {
      cache: "no-store",
      headers: token ? { "x-session-token": token } : undefined,
    },
  );
  return parse<{ ok: true } & PairChartData>(res) as Promise<
    ({ ok: true } & PairChartData) | ApiErr
  >;
}

/** Widen a running session's chartable symbols. Returns the new symbol list. */
export async function addSessionPair(
  sessionId: string,
  token: string | null,
  symbol: string,
): Promise<{ ok: true; symbols: string[] } | ApiErr> {
  try {
    const res = await fetch(`/api/backtest/sessions/${sessionId}/pair`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-session-token": token } : {}),
      },
      body: JSON.stringify({ symbol }),
    });
    return parse<{ ok: true; symbols: string[] }>(res) as Promise<
      { ok: true; symbols: string[] } | ApiErr
    >;
  } catch {
    return { ok: false, error: "That symbol could not be added to this session." };
  }
}

export async function getChartHistory(
  sessionId: string,
  token: string | null,
  symbol: string,
  timeframe: Timeframe,
  before: number,
): Promise<({ ok: true } & ChartHistoryPage) | ApiErr> {
  const query = new URLSearchParams({ symbol, timeframe, before: String(before) });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`/api/backtest/sessions/${sessionId}/context?${query}`, {
      cache: "no-store",
      headers: token ? { "x-session-token": token } : undefined,
      signal: controller.signal,
    });
    return parse<{ ok: true } & ChartHistoryPage>(res) as Promise<
      ({ ok: true } & ChartHistoryPage) | ApiErr
    >;
  } catch {
    return {
      ok: false,
      error: "Chart history took too long to load. The visible replay data is still available.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Convert a market-time multiplier into wall-clock replay cadence. */
export function replayIntervalMs(
  speed: ReplaySpeed,
  timeframe: Timeframe,
  stepCount = 1,
): number {
  return Math.max(16, (TIMEFRAME_MS[timeframe] * stepCount) / speed);
}

/**
 * Number of logical replay ticks owed after elapsed wall time. A tick can
 * contain the selected 1m/5m/15m/etc step, so speed remains market-time based.
 */
export function replayStepsDue(
  elapsedMs: number,
  speed: ReplaySpeed,
  timeframe: Timeframe,
  stepCount = 1,
  maxBatch = 64,
): number {
  const idealInterval = Math.max(
    0.01,
    (TIMEFRAME_MS[timeframe] * stepCount) / speed,
  );
  return Math.min(
    maxBatch,
    Math.max(0, Math.floor(elapsedMs / idealInterval + 1e-9)),
  );
}

export function nextReplayBatch(
  accumulatorMs: number,
  speed: ReplaySpeed,
  timeframe: Timeframe,
  stepCount = 1,
  maxBatch = 64,
): { batchSize: number; remainingMs: number } {
  const cadenceMs = Math.max(
    0.01,
    (TIMEFRAME_MS[timeframe] * stepCount) / speed,
  );
  const batchSize = replayStepsDue(
    accumulatorMs,
    speed,
    timeframe,
    stepCount,
    maxBatch,
  );
  return {
    batchSize,
    remainingMs: Math.max(0, accumulatorMs - batchSize * cadenceMs),
  };
}
