import { NextResponse } from "next/server";

import { ensureUserProfile } from "@/lib/auth";
import { createSession, loadSession } from "@/lib/backtest/session-store";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  await ensureUserProfile(user);
  const source = await loadSession(params.id);
  if (!source || source.userId !== user.id || source.anonymous) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }

  const config = source.ctx.state.config;
  try {
    const duplicate = await createSession({
      name: `${config.name || config.symbol} copy`,
      tags: config.tags,
      symbols: config.symbols?.length ? config.symbols : [config.symbol],
      symbol: config.symbol,
      timeframe: config.timeframe,
      startTime: config.startTime,
      endTime: config.endTime,
      startingBalance: config.startingBalance,
      spreadPips: config.spreadPips,
      commissionPerLot: config.commissionPerLot,
      slippagePips: config.slippagePips,
      executionPolicy: config.executionPolicy,
      userId: user.id,
    });
    return NextResponse.json({ ok: true, sessionId: duplicate.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not duplicate session.",
      },
      { status: 400 },
    );
  }
}
