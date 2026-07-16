/**
 * Browser-side API client for the backtester. No secrets here — it only calls
 * our own server endpoints and carries the per-session token (issued at
 * creation) in a header to authorise mutating actions.
 */

import type { Candle, MarketSymbol, Timeframe } from "@/lib/market-data/types";
import type { PublicSessionState, ReplaySpeed } from "./types";
import type { ActionInput } from "./schemas";

export interface CreateSessionBody {
  symbol: string;
  timeframe: Timeframe;
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
  notes: string;
}
interface ApiErr {
  ok: false;
  error: string;
  state?: PublicSessionState;
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
  timeframe: Timeframe,
): Promise<{ startTime: number; endTime: number }[]> {
  const res = await fetch(
    `/api/backtest/ranges?symbol=${symbol}&timeframe=${timeframe}`,
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

export const SPEED_INTERVAL_MS: Record<ReplaySpeed, number> = {
  0.5: 2000,
  1: 1000,
  2: 500,
  5: 200,
  10: 100,
};
