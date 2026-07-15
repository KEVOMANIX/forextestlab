import { NextResponse } from "next/server";

import { getSessionResults } from "@/lib/backtest/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const results = await getSessionResults(params.id);
  if (!results) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, results });
}
