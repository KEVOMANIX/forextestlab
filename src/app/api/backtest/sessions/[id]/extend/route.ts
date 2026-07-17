import { NextResponse } from "next/server";

import { canAccessSession } from "@/lib/backtest/session-access";
import { extendReplaySeries, loadSession } from "@/lib/backtest/session-store";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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

  const limit = rateLimit(`extend:${params.id}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }

  try {
    const page = await extendReplaySeries(session);
    return NextResponse.json({ ok: true, ...page });
  } catch (error) {
    console.error("Replay extension failed:", error);
    return NextResponse.json(
      { ok: false, error: "More replay data could not be loaded." },
      { status: 500 },
    );
  }
}
