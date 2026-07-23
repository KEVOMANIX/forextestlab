import { NextResponse } from "next/server";

import { createSessionSchema } from "@/lib/backtest/schemas";
import {
  createSession,
  toPublicState,
  visibleCandles,
} from "@/lib/backtest/session-store";
import type { Timeframe } from "@/lib/market-data/types";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ensureUserProfile } from "@/lib/auth";
import { getCurrentUser } from "@/lib/supabase/server";
import { trialDeviceIdFromRequest } from "@/lib/trial-device";

const SESSION_BASE_TIMEFRAME: Timeframe = "1m";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user) await ensureUserProfile(user);

  const limit = rateLimit(
    `create:${user?.id ?? clientIp(request)}`,
    user ? 30 : 10,
    60 * 60_000,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many sessions created. Please try again shortly." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request.", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const session = await createSession({
      name: parsed.data.name,
      tags: parsed.data.tags,
      symbols: parsed.data.symbols,
      symbol: parsed.data.symbols[0]!,
      timeframe: SESSION_BASE_TIMEFRAME,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      startingBalance: parsed.data.startingBalance,
      spreadPips: parsed.data.spreadPips,
      commissionPerLot: parsed.data.commissionPerLot,
      slippagePips: parsed.data.slippagePips,
      executionPolicy: parsed.data.executionPolicy,
      userId: user?.id,
      trialDeviceId: trialDeviceIdFromRequest(request),
    });

    return NextResponse.json(
      {
        ok: true,
        sessionId: session.id,
        token: session.token,
        state: toPublicState(session.ctx, session.anonymous),
        candles: visibleCandles(session.ctx),
        replayCandles: session.ctx.candles,
        contextCandles: session.contextCandles,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create session.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
