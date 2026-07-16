import { NextResponse } from "next/server";

import { getMarketDataProvider } from "@/lib/market-data";
import { getSymbolDefinition } from "@/lib/market-data/symbols";
const SESSION_BASE_TIMEFRAME = "5m";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  if (!symbol || !getSymbolDefinition(symbol)) {
    return NextResponse.json({ ok: false, error: "Invalid symbol." }, { status: 400 });
  }

  try {
    const ranges = await getMarketDataProvider().getAvailableRanges(
      symbol,
      SESSION_BASE_TIMEFRAME,
    );
    return NextResponse.json({ ok: true, ranges });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load ranges.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
