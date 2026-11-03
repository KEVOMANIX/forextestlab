import { NextResponse } from "next/server";

import { getMarketDataProvider, histDataReplayEnabled, type ReplayDataSource } from "@/lib/market-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const source = new URL(request.url).searchParams.get("source") ?? "dukascopy";
    if (source !== "dukascopy" && source !== "histdata") return NextResponse.json({ ok: false, error: "Invalid data source." }, { status: 400 });
    if (source === "histdata" && !histDataReplayEnabled()) return NextResponse.json({ ok: true, symbols: [] });
    const symbols = await getMarketDataProvider(source as ReplayDataSource).getAvailableSymbols();
    return NextResponse.json({ ok: true, symbols });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load symbols.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
