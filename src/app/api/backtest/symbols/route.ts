import { NextResponse } from "next/server";

import { getMarketDataProvider } from "@/lib/market-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const symbols = await getMarketDataProvider().getAvailableSymbols();
    return NextResponse.json({ ok: true, symbols });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load symbols.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
