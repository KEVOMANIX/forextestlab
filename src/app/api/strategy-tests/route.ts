import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserEntitlements } from "@/lib/billing/entitlements";
import { DEMO_RANGE_END, DEMO_RANGE_START } from "@/lib/market-data/demo-generator";
import { getMarketDataProvider, histDataReplayEnabled } from "@/lib/market-data";
import { DemoDataProvider } from "@/lib/market-data/providers/demo-data-provider";
import { getSymbolDefinition } from "@/lib/market-data/symbols";
import { TIMEFRAME_MS } from "@/lib/market-data/types";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { siteConfig } from "@/lib/site";
import { getCurrentUser } from "@/lib/supabase/server";
import { parseStrategy } from "@/lib/strategy-language/parser";
import { isStrategyFxMarket } from "@/lib/strategy-language/markets";
import { runStrategy } from "@/lib/strategy-language/run";

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
  const maxDays = entitlements ? Math.min(90, entitlements.maxSessionDays ?? 90) : 14;
  if (input.endTime <= input.startTime || input.endTime - input.startTime > maxDays * day) return json({ ok: false, error: `Choose a period of at most ${maxDays} days.` }, 400);
  if (entitlements?.allowedSymbols && !entitlements.allowedSymbols.includes(input.symbol)) return json({ ok: false, error: "This FX pair requires Pro." }, 403);
  if (!user && (input.source !== "demo" || input.startTime < DEMO_RANGE_START || input.endTime > DEMO_RANGE_END)) return json({ ok: false, error: "Sign in to test real market history. The preview uses sample data only." }, 403);
  if (user && input.source === "demo") return json({ ok: false, error: "Choose a historical data provider." }, 400);
  if (input.source === "histdata" && !histDataReplayEnabled()) return json({ ok: false, error: "HistData is not available right now." }, 400);
  if (!rateLimit(`strategy-test:${user?.id ?? clientIp(request)}`, 12, 60 * 60_000).ok) return json({ ok: false, error: "Test limit reached. Try again later." }, 429);
  const symbol = getSymbolDefinition(input.symbol)!;
  try {
    const provider = input.source === "demo" ? new DemoDataProvider() : getMarketDataProvider(input.source);
    // Leave room for weekends and the largest declared indicator to warm up
    // before the first selected test candle; warmup bars are excluded in the runner.
    const periods = parsedCode.program.signals.flatMap(signal => [signal.left, signal.right]).map(operand => operand.kind === "NUMBER" || operand.kind === "CLOSE" ? 0 : operand.period);
    const warmupBars = Math.max(60, Math.max(...periods) * 2);
    const warmupStart = Math.max(0, input.startTime - TIMEFRAME_MS[parsedCode.program.timeframe] * warmupBars);
    const candles = await provider.getCandles({ symbol: input.symbol, timeframe: parsedCode.program.timeframe, startTime: warmupStart, endTime: input.endTime, limit: 5_001 });
    if (candles.length > 5_000) return json({ ok: false, error: "This test has too many candles. Choose a shorter period or a larger timeframe." }, 400);
    if (candles.filter(candle => candle.timestamp >= input.startTime).length < 2) return json({ ok: false, error: "Too few candles in this period. Choose another market or date range." }, 422);
    const report = runStrategy(parsedCode.program, candles, {
      symbol, startTime: input.startTime, startingBalance: String(input.startingBalance),
      spreadPips: String(input.spreadPips), slippagePips: String(input.slippagePips), commissionPerLot: String(input.commissionPerLot),
    });
    return json({ ok: true, report });
  } catch (error) {
    console.error("Strategy test failed", error);
    return json({ ok: false, error: "Could not complete this strategy test. Try a shorter period." }, 500);
  }
}
