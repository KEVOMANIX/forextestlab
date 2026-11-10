import { createConnection } from "node:net";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserEntitlements } from "@/lib/billing/entitlements";
import { DEMO_RANGE_END, DEMO_RANGE_START } from "@/lib/market-data/demo-generator";
import { getMarketDataProvider, histDataReplayEnabled } from "@/lib/market-data";
import { DemoDataProvider } from "@/lib/market-data/providers/demo-data-provider";
import { R2ParquetProvider } from "@/lib/market-data/providers/r2-parquet-provider";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { siteConfig } from "@/lib/site";
import { isStrategyFxMarket } from "@/lib/strategy-language/markets";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BARS = 30_000;
const TIMEFRAME_MS = { "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 } as const;
const bodySchema = z.object({
  code: z.string().min(1).max(20_000),
  symbol: z.string().regex(/^[A-Z0-9]{3,20}$/),
  source: z.enum(["dukascopy", "histdata", "demo"]),
  timeframe: z.enum(["15m", "1h", "4h", "1d"]),
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  startingBalance: z.number().finite().min(100).max(1_000_000).default(10_000),
});
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

const PINE_SOCKET = "/run/forextestlab-pine.sock";

function runIsolated(input: unknown, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(PINE_SOCKET);
    let output = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      socket.destroy();
      if (error) reject(error);
      else { try { resolve(JSON.parse(output)); } catch { reject(new Error("The Pine engine returned an invalid result.")); } }
    };
    const abort = () => finish(new Error("Test canceled."));
    const timer = setTimeout(() => finish(new Error("Pine test exceeded the 30-second limit.")), 30_000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.end(JSON.stringify(input)));
    socket.on("data", (chunk: string) => { output += chunk; if (output.length > 8_000_000) finish(new Error("Pine result exceeded the size limit.")); });
    socket.on("end", () => finish());
    socket.on("error", (error: NodeJS.ErrnoException) => {
      console.error("Isolated Pine socket error", { code: error.code, syscall: error.syscall });
      finish(new Error("The isolated Pine runner is unavailable."));
    });
    socket.on("close", () => { if (!settled) finish(new Error("The isolated Pine runner closed unexpectedly.")); });
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && ![new URL(request.url).origin, new URL(siteConfig.url).origin, "https://forextestlab.com", "https://www.forextestlab.com"].includes(origin)) return json({ ok: false, error: "Invalid origin." }, 403);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: "Check the script, market, timeframe, and dates." }, 400);
  const input = parsed.data;
  if (!isStrategyFxMarket(input.symbol) && input.symbol !== "XAUUSD") return json({ ok: false, error: "Choose a supported FX pair or XAU/USD." }, 400);
  if (input.endTime <= input.startTime) return json({ ok: false, error: "Through must be after From." }, 400);
  if ((input.endTime - input.startTime) / TIMEFRAME_MS[input.timeframe] > MAX_BARS * 1.5) return json({ ok: false, error: `The Pine runner supports up to ${MAX_BARS.toLocaleString()} candles per test. Choose a larger timeframe or shorter period.` }, 422);
  const user = await getCurrentUser();
  const entitlements = user ? await getUserEntitlements(user.id) : null;
  if (entitlements?.allowedSymbols && !entitlements.allowedSymbols.includes(input.symbol)) return json({ ok: false, error: "This market requires Pro." }, 403);
  if (!user && (input.source !== "demo" || input.startTime < DEMO_RANGE_START || input.endTime > DEMO_RANGE_END)) return json({ ok: false, error: "Sign in to test real market history." }, 403);
  if (user && input.source === "demo") return json({ ok: false, error: "Choose a historical data provider." }, 400);
  if (input.source === "histdata" && !histDataReplayEnabled()) return json({ ok: false, error: "HistData is not available right now." }, 400);
  if (!rateLimit(`pine-test:${user?.id ?? clientIp(request)}`, 6, 60 * 60_000).ok) return json({ ok: false, error: "Pine test limit reached. Try again later." }, 429);
  const provider = input.source === "demo" ? new DemoDataProvider() : input.source === "dukascopy" ? new R2ParquetProvider() : getMarketDataProvider("histdata");
  try {
    const ranges = await provider.getAvailableRanges(input.symbol, input.timeframe);
    if (!ranges.some((range) => input.startTime >= range.startTime && input.endTime <= range.endTime + 86_400_000)) return json({ ok: false, error: "Choose dates inside an available history range." }, 422);
    const candles = (await provider.getCandles({ symbol: input.symbol, timeframe: input.timeframe, startTime: input.startTime, endTime: input.endTime }))
      .filter((candle) => candle.timestamp >= input.startTime && candle.timestamp <= input.endTime)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (candles.length < 2 || candles.length > MAX_BARS) return json({ ok: false, error: candles.length > MAX_BARS ? `The period contains more than ${MAX_BARS.toLocaleString()} candles.` : "Too few candles in this period." }, 422);
    if (candles.some((candle, index) => (index > 0 && candle.timestamp <= candles[index - 1]!.timestamp) || ![candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(Number(value))))) return json({ ok: false, error: "Market candles are incomplete or out of order." }, 422);
    const result = await runIsolated({ ...input, dataSource: input.source, candles }, request.signal);
    return json(result);
  } catch (error) {
    if (!request.signal.aborted) console.error("Pine test failed", { symbol: input.symbol, source: input.source, timeframe: input.timeframe, error });
    return json({ ok: false, error: error instanceof Error ? error.message : "Could not run the Pine test." }, 503);
  }
}
