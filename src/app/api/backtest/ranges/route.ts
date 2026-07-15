import { NextResponse } from "next/server";

import { getMarketDataProvider } from "@/lib/market-data";
import { isTimeframe } from "@/lib/market-data/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const timeframe = searchParams.get("timeframe");

  if (!symbol || !/^[A-Z]{6}$/.test(symbol)) {
    return NextResponse.json({ ok: false, error: "Invalid symbol." }, { status: 400 });
  }
  if (!timeframe || !isTimeframe(timeframe)) {
    return NextResponse.json({ ok: false, error: "Invalid timeframe." }, { status: 400 });
  }

  try {
    const ranges = await getMarketDataProvider().getAvailableRanges(
      symbol,
      timeframe,
    );
    return NextResponse.json({ ok: true, ranges });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load ranges.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
