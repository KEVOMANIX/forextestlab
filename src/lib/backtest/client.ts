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
}

interface CreateOk {
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
): Promise<CreateOk | ApiErr> {
  const res = await fetch("/api/backtest/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse<CreateOk>(res) as Promise<CreateOk | ApiErr>;
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

export async function getState(sessionId: string): Promise<StateOk | ApiErr> {
  return getStateWithToken(sessionId, null);
}

export async function getStateWithToken(
  sessionId: string,
  token: string | null,
): Promise<StateOk | ApiErr> {
  const res = await fetch(`/api/backtest/sessions/${sessionId}`, {
    cache: "no-store",
    headers: token ? { "x-session-token": token } : undefined,
  });
  return parse<StateOk>(res) as Promise<StateOk | ApiErr>;
}

export async function getPairChart(
  sessionId: string,
  token: string | null,
  symbol: string,
): Promise<({ ok: true } & PairChartData) | ApiErr> {
  const res = await fetch(
    `/api/backtest/sessions/${sessionId}/pair?symbol=${encodeURIComponent(symbol)}`,
    {
      cache: "no-store",
      headers: token ? { "x-session-token": token } : undefined,
    },
  );
  return parse<{ ok: true } & PairChartData>(res) as Promise<
    ({ ok: true } & PairChartData) | ApiErr
  >;
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
 * Browsers cannot reliably redraw faster than one frame every ~16 ms. At
 * higher replay multipliers, process several replay steps in that frame so
 * the requested market-time speed remains meaningful.
 */
export function replayBatchSize(
  speed: ReplaySpeed,
  timeframe: Timeframe,
  stepCount = 1,
): number {
  const idealInterval = (TIMEFRAME_MS[timeframe] * stepCount) / speed;
  return idealInterval >= 16 ? 1 : Math.max(1, Math.round(16 / idealInterval));
}
