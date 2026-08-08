import { NextResponse } from "next/server";

import { ensureUserProfile } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createSession, loadSession, persistSession } from "@/lib/backtest/session-store";
import { getCurrentUser } from "@/lib/supabase/server";
import { trialDeviceIdFromRequest } from "@/lib/trial-device";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  await ensureUserProfile(user);
  const source = await loadSession(params.id);
  if (!source || source.userId !== user.id || source.anonymous) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }
  const sourceRow = await prisma.backtestSession.findUnique({
    where: { id: source.id },
    select: { branchRootId: true },
  });
  const body = await request.json().catch(() => ({})) as { name?: string };
  const config = source.ctx.state.config;
  const branchName = body.name?.trim().slice(0, 80) || `${config.name || config.symbol} · alternative`;
  const candle = source.ctx.candles[source.ctx.state.visibleIndex];
  try {
    const branch = await createSession({
      name: branchName,
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
      trialDeviceId: trialDeviceIdFromRequest(request),
    });
    branch.ctx.state = structuredClone(source.ctx.state);
    branch.ctx.state.sessionId = branch.id;
    branch.ctx.state.status = "paused";
    branch.ctx.state.config.name = branchName;
    branch.notes = source.notes;
    await Promise.all([
      persistSession(branch),
      prisma.backtestSession.update({
        where: { id: branch.id },
        data: {
          parentSessionId: source.id,
          branchRootId: sourceRow?.branchRootId ?? source.id,
          branchPointIndex: source.ctx.state.visibleIndex,
          branchPointTime: candle ? BigInt(candle.timestamp) : null,
        },
      }),
    ]);
    return NextResponse.json({ ok: true, sessionId: branch.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not fork session.",
    }, { status: 400 });
  }
}
