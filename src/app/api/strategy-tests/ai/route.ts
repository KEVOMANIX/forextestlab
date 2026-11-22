import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { geminiConfigured, streamGemini, type ChatTurn } from "@/lib/ai/gemini";
import { AI_DAILY_LIMIT, PINE_AUTHOR_INSTRUCTION, authorPrompt, fixPrompt, parseAuthorReply, replyMode, type AuthorMode, type AuthorResult } from "@/lib/ai/pine-author";
import { DEMO_RANGE_END, DEMO_RANGE_START } from "@/lib/market-data/demo-generator";
import { DemoDataProvider } from "@/lib/market-data/providers/demo-data-provider";
import { isStrategyFxMarket } from "@/lib/strategy-language/markets";
import { runIsolated } from "@/lib/strategy-language/pine-isolated";
import { siteConfig } from "@/lib/site";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const row = z.object({ trades: z.number(), pnl: z.number() });
const bodySchema = z.object({
  prompt: z.string().trim().min(2).max(2_000),
  code: z.string().max(20_000),
  history: z.array(z.object({ role: z.enum(["user", "model"]), text: z.string().max(4_000) })).max(12).default([]),
  symbol: z.string().regex(/^[A-Z0-9]{3,20}$/),
  timeframe: z.enum(["15m", "1h", "4h", "1d"]),
  summary: z.object({
    symbol: z.string().max(20), timeframe: z.string().max(4), from: z.string().max(10), through: z.string().max(10),
    trades: z.number(), longs: z.number(), netPnl: z.number(), netPercent: z.number(), winRate: z.number(),
    profitFactor: z.number().nullable(), maxDrawdownPercent: z.number(),
    byMonth: z.array(row.extend({ month: z.string().max(7) })).max(36).optional(),
    byWeekday: z.array(row.extend({ day: z.string().max(3) })).max(7).optional(),
    byHour: z.array(row.extend({ hour: z.number().int().min(0).max(23) })).max(24).optional(),
  }).nullable().optional(),
});
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const MAX_FIXES = 2;

/** Runs the script on sample candles so compile and runtime errors surface before the trader sees it. */
async function check(code: string, symbol: string, timeframe: "15m" | "1h" | "4h" | "1d", signal: AbortSignal): Promise<{ checked: boolean; errors: string[] }> {
  const candleSymbol = isStrategyFxMarket(symbol) || symbol === "XAUUSD" ? symbol : "EURUSD";
  const candles = await new DemoDataProvider().getCandles({ symbol: candleSymbol, timeframe, startTime: DEMO_RANGE_START, endTime: DEMO_RANGE_END });
  try {
    const result = await runIsolated({ code, symbol: candleSymbol, timeframe, startingBalance: 10_000, dataSource: "demo", candles }, signal) as { ok?: boolean; error?: string; diagnostics?: { line: number; message: string }[] };
    if (result?.ok) return { checked: true, errors: [] };
    const errors = result?.diagnostics?.length ? result.diagnostics.map(item => `Line ${item.line}: ${item.message}`) : [result?.error ?? "The script failed to run."];
    return { checked: true, errors };
  } catch {
    // The runner itself is unavailable or timed out: hand the code over unchecked.
    return { checked: false, errors: [] };
  }
}

/** Collects one Gemini reply, reporting the declared mode as soon as it streams in. */
async function ask(history: ChatTurn[], signal: AbortSignal, onMode?: (mode: AuthorMode) => void): Promise<string> {
  let text = "", reported = false;
  for await (const chunk of streamGemini({ systemInstruction: PINE_AUTHOR_INSTRUCTION, history, signal, temperature: 0.2 })) {
    text += chunk;
    if (!reported && onMode) { const mode = replyMode(text); if (mode) { reported = true; onMode(mode); } }
  }
  return text;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && ![new URL(request.url).origin, new URL(siteConfig.url).origin, "https://forextestlab.com", "https://www.forextestlab.com"].includes(origin)) return json({ ok: false, error: "Invalid origin." }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Sign in to use the AI." }, 401);
  if (!geminiConfigured()) return json({ ok: false, error: "The AI isn't available right now." }, 503);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: "Write a shorter request and try again." }, 400);
  const input = parsed.data;

  const entitlements = await getUserEntitlements(user.id);
  const limit = entitlements.plan === "pro" ? AI_DAILY_LIMIT.pro : AI_DAILY_LIMIT.free;
  const day = new Date().toISOString().slice(0, 10);
  const used = (await prisma.pineAiUsage.findUnique({ where: { userId_day: { userId: user.id, day } }, select: { used: true } }))?.used ?? 0;
  if (used >= limit) return json({ ok: false, code: "plan_limit", error: entitlements.plan === "pro" ? `You've used today's ${limit} AI requests. They reset at midnight UTC.` : `Free includes ${limit} AI requests a day. Upgrade to Pro for ${AI_DAILY_LIMIT.pro}, or try again tomorrow.`, remaining: 0 }, 429);
  await prisma.pineAiUsage.upsert({ where: { userId_day: { userId: user.id, day } }, create: { userId: user.id, day, used: 1 }, update: { used: { increment: 1 } } });
  const remaining = limit - used - 1;

  const history: ChatTurn[] = [...input.history, { role: "user", text: authorPrompt({ prompt: input.prompt, code: input.code, summary: input.summary }) }];
  // NDJSON: one {type:"step"} line per real stage, then {type:"done"} or {type:"error"}.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => { try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { /* client left */ } };
      try {
        send({ type: "step", step: "reading" });
        let reply: AuthorResult = parseAuthorReply(await ask(history, request.signal, mode => send({ type: "step", step: mode === "code" ? "writing" : "answering" })));
        let checked = false, errors: string[] = [], fixes = 0;
        for (let attempt = 0; reply.code; attempt++) {
          send({ type: "step", step: "checking", attempt: attempt + 1 });
          ({ checked, errors } = await check(reply.code, input.symbol, input.timeframe, request.signal));
          if (!checked) { send({ type: "step", step: "unchecked" }); break; }
          if (!errors.length) { send({ type: "step", step: "checked" }); break; }
          send({ type: "step", step: "errors", count: errors.length, first: errors[0] });
          if (attempt >= MAX_FIXES) break;
          send({ type: "step", step: "fixing", attempt: attempt + 1 });
          history.push({ role: "model", text: `MODE: code\nCODE:\n\`\`\`pine\n${reply.code}\`\`\`` }, { role: "user", text: fixPrompt(errors) });
          const fixed = parseAuthorReply(await ask(history, request.signal));
          fixes++;
          reply = { ...reply, rules: fixed.rules.length ? fixed.rules : reply.rules, code: fixed.code ?? reply.code };
        }
        send({ type: "done", ok: true, ...reply, checked, errors, fixes, remaining });
      } catch (error) {
        if (!request.signal.aborted) console.error("Strategy Lab AI failed", { error: error instanceof Error ? error.message : error });
        send({ type: "error", error: "The AI couldn't answer. Try again.", remaining });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store", "X-Accel-Buffering": "no" } });
}
