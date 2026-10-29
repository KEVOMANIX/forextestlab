import { NextResponse } from "next/server";

import { getSessionResults } from "@/lib/backtest/results";
import { buildExitQualityReport } from "@/lib/backtest/exit-quality-server";
import type { OptimizerStreamEvent } from "@/lib/backtest/optimizer-progress";
import { ALL_EXIT_RULES } from "@/lib/backtest/exit-optimizer";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { siteConfig } from "@/lib/site";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || [new URL(siteConfig.url).origin, "https://forextestlab.com", "https://www.forextestlab.com", new URL(request.url).origin].includes(origin);
}

export async function POST(request: Request, context: Context) {
  if (!validOrigin(request)) return json({ ok: false, error: "Invalid origin." }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Sign in required." }, 401);
  const { id } = await context.params;
  const [results, entitlements] = await Promise.all([getSessionResults(id, user.id), getUserEntitlements(user.id)]);
  if (!results) return json({ ok: false, error: "Session not found." }, 404);
  if (!entitlements.fullAnalytics) return json({ ok: false, error: "The Exit Optimizer is part of Pro." }, 403);
  if (results.state.status !== "finished") return json({ ok: false, error: "Finish this replay before running the optimizer." }, 409);

  let requested: unknown = [];
  try { requested = (await request.json()).ruleIds; } catch { /* all rules */ }
  const allowed = new Set(ALL_EXIT_RULES.map((rule) => rule.id));
  const ruleIds = Array.isArray(requested) ? requested.filter((id): id is string => typeof id === "string" && allowed.has(id)).slice(0, allowed.size) : [];
  if (!ruleIds.length) return json({ ok: false, error: "Select at least one exit-rule group." }, 400);

  const options = { includePlan: false, includeOptimizer: true, optimizerRuleIds: ruleIds };
  const noTrades = "No eligible trades were found. Trades need an initial stop and recorded risk.";
  if (!request.headers.get("accept")?.includes("application/x-ndjson")) {
    const report = await buildExitQualityReport(results.state, options);
    if (!report?.optimizer) return json({ ok: false, error: noTrades }, 422);
    return json({ ok: true, optimizer: report.optimizer });
  }

  const abort = new AbortController();
  const disconnect = () => abort.abort();
  request.signal.addEventListener("abort", disconnect, { once: true });
  if (request.signal.aborted) abort.abort();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: OptimizerStreamEvent) => {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      const heartbeat = setInterval(() => {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode("\n"));
      }, 10_000);
      try {
        send({ type: "progress", progress: { stage: "preparing", message: "Checking eligible trades and selected exit rules" } });
        const report = await buildExitQualityReport(results.state, {
          ...options, signal: abort.signal, onProgress: progress => send({ type: "progress", progress }),
        });
        if (!report?.optimizer) send({ type: "error", error: noTrades });
        else send({ type: "result", optimizer: report.optimizer });
      } catch (error) {
        if (!abort.signal.aborted) {
          console.error("Optimizer analysis failed", error);
          send({ type: "error", error: "The optimizer could not complete. Please try again." });
        }
      } finally {
        clearInterval(heartbeat);
        request.signal.removeEventListener("abort", disconnect);
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel() { abort.abort(); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "private, no-store, no-transform",
    "X-Accel-Buffering": "no",
  } });
}
