import { NextResponse } from "next/server";

import { getSessionResults } from "@/lib/backtest/results";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  }
  const results = await getSessionResults(params.id, user.id);
  if (!results) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, results });
}
