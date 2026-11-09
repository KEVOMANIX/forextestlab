import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserEntitlements } from "@/lib/billing/entitlements";
import { DEMO_RANGE_END, DEMO_RANGE_START } from "@/lib/market-data/demo-generator";
import { getMarketDataProvider, histDataReplayEnabled } from "@/lib/market-data";
import { DemoDataProvider } from "@/lib/market-data/providers/demo-data-provider";
import { R2ParquetProvider } from "@/lib/market-data/providers/r2-parquet-provider";
import { getSymbolDefinition } from "@/lib/market-data/symbols";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { siteConfig } from "@/lib/site";
import { getCurrentUser } from "@/lib/supabase/server";
import { parseStrategy } from "@/lib/strategy-language/parser";
import { isStrategyFxMarket } from "@/lib/strategy-language/markets";
import { runStrategyRange } from "@/lib/strategy-language/run-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const day = 86_400_000;
const bodySchema = z.object({
  code: z.string().min(1).max(4_000),
  symbol: z.string().regex(/^[A-Z]{6}$/),
  source: z.enum(["dukascopy", "histdata", "demo"]),
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  startingBalance: z.number().finite().min(100).max(1_000_000).default(10_000),
  spreadPips: z.number().finite().min(0).max(20).default(1),
  slippagePips: z.number().finite().min(0).max(10).default(0),
  commissionPerLot: z.number().finite().min(0).max(100).default(0),
});
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && ![new URL(request.url).origin, new URL(siteConfig.url).origin, "https://forextestlab.com", "https://www.forextestlab.com"].includes(origin)) return json({ ok: false, error: "Invalid origin." }, 403);
  const user = await getCurrentUser();
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return json({ ok: false, error: "Check the market, dates, and test settings." }, 400);
  const input = parsedBody.data;
  if (!isStrategyFxMarket(input.symbol)) return json({ ok: false, error: "Choose a supported FX pair." }, 400);
  const parsedCode = parseStrategy(input.code);
  if (!parsedCode.ok) return json({ ok: false, error: "Fix the language errors before running.", diagnostics: parsedCode.diagnostics }, 400);
  const entitlements = user ? await getUserEntitlements(user.id) : null;
  if (input.endTime <= input.startTime) return json({ ok: false, error: "Through must be after From." }, 400);
  if (entitlements?.allowedSymbols && !entitlements.allowedSymbols.includes(input.symbol)) return json({ ok: false, error: "This FX pair requires Pro." }, 403);
  if (!user && (input.source !== "demo" || input.startTime < DEMO_RANGE_START || input.endTime > DEMO_RANGE_END)) return json({ ok: false, error: "Sign in to test real market history. The preview uses sample data only." }, 403);
  if (user && input.source === "demo") return json({ ok: false, error: "Choose a historical data provider." }, 400);
  if (input.source === "histdata" && !histDataReplayEnabled()) return json({ ok: false, error: "HistData is not available right now." }, 400);
  if (!rateLimit(`strategy-test:${user?.id ?? clientIp(request)}`, 12, 60 * 60_000).ok) return json({ ok: false, error: "Test limit reached. Try again later." }, 429);
  const symbol = getSymbolDefinition(input.symbol)!;
  // The app's general Dukascopy provider may substitute synthetic sample bars
  // when R2 is empty. A historical strategy test must never do that.
  const provider = input.source === "demo" ? new DemoDataProvider() : input.source === "dukascopy" ? new R2ParquetProvider() : getMarketDataProvider("histdata");
  let ranges;
  try { ranges = await provider.getAvailableRanges(input.symbol, parsedCode.program.timeframe); }
  catch (error) { console.error("Strategy market range failed", error); return json({ ok: false, error: "Could not load available market history." }, 503); }
  if (!ranges.some(range => input.startTime >= range.startTime && input.startTime <= range.endTime && input.endTime >= range.startTime && input.endTime <= range.endTime + day)) {
    return json({ ok: false, error: "Choose dates inside one available history range for this market." }, 422);
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const heartbeat = setInterval(() => { try { send({ type: "heartbeat" }); } catch { /* disconnected */ } }, 10_000);
      try {
        const report = await runStrategyRange(provider, parsedCode.program, {
          symbol, startTime: input.startTime, endTime: input.endTime, startingBalance: String(input.startingBalance),
          spreadPips: String(input.spreadPips), slippagePips: String(input.slippagePips), commissionPerLot: String(input.commissionPerLot),
          signal: request.signal, onProgress: progress => send({ type: "progress", ...progress }),
        });
        send({ type: "result", report });
      } catch (error) {
        if (!request.signal.aborted) { console.error("Strategy test failed", error); send({ type: "error", error: error instanceof Error ? error.message : "Could not complete this strategy test." }); }
      } finally { clearInterval(heartbeat); try { controller.close(); } catch { /* disconnected */ } }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no" } });
}
