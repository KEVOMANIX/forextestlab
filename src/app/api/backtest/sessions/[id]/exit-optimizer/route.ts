import { NextResponse } from "next/server";

import { getSessionResults } from "@/lib/backtest/results";
import { buildExitQualityReport } from "@/lib/backtest/exit-quality-server";
import { PHASE_ONE_EXIT_RULES } from "@/lib/backtest/exit-optimizer";
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
  const allowed = new Set(PHASE_ONE_EXIT_RULES.map((rule) => rule.id));
  const ruleIds = Array.isArray(requested) ? requested.filter((id): id is string => typeof id === "string" && allowed.has(id)).slice(0, allowed.size) : [];
  if (!ruleIds.length) return json({ ok: false, error: "Select at least one exit-rule group." }, 400);

  const report = await buildExitQualityReport(results.state, { includePlan: false, includeOptimizer: true, optimizerRuleIds: ruleIds });
  if (!report?.optimizer) return json({ ok: false, error: "No eligible trades were found. Trades need an initial stop and recorded risk." }, 422);
  return json({ ok: true, optimizer: report.optimizer });
}
