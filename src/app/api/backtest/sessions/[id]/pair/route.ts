import { NextResponse } from "next/server";

import { canAccessSession } from "@/lib/backtest/session-access";
import {
  loadSession,
  visiblePairCandles,
} from "@/lib/backtest/session-store";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await loadSession(params.id);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }
  const user = await getCurrentUser();
  const token = request.headers.get("x-session-token");
  if (!canAccessSession(session, user?.id ?? null, token)) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 403 });
  }
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "";
  try {
    const pair = await visiblePairCandles(session, symbol);
    return NextResponse.json({ ok: true, symbol, ...pair });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Pair unavailable." },
      { status: 400 },
    );
  }
}
