import { getCurrentUser } from "@/lib/supabase/server";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { getSessionResults } from "@/lib/backtest/results";
import { prisma } from "@/lib/db";
import { geminiConfigured, streamGemini, type ChatTurn } from "@/lib/ai/gemini";
import { buildPortfolioContext, buildSessionContext } from "@/lib/ai/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_INSTRUCTION = `You are the AI trading-performance analyst inside ForexTestLab, a forex backtesting and market-replay platform.

You help a trader understand their own backtest results and become a better trader. A factual DATA CONTEXT for the current scope is provided as the first message — treat it as the single source of truth.

Rules:
- Ground every claim strictly in the DATA CONTEXT. Never invent numbers, trades, or metrics. If the data does not answer the question, say so plainly.
- Quote concrete figures from the context (net P/L, win rate, profit factor, drawdown, weekday/session splits) to support your points.
- Be concise and structured: lead with the direct answer, then 2-4 specific, actionable recommendations tied to the numbers.
- Focus on process: risk management, consistency, timing, and expectancy — not price predictions.
- These are historical simulations, not investment advice. Do not tell the user to buy or sell any instrument, and add a one-line reminder only when they ask what to trade next.
- Use plain markdown (short headers, bullet points). Keep answers under ~250 words unless the trader asks for depth.`;

const MAX_QUESTION = 1000;
const MAX_HISTORY_TURNS = 12;

function bad(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return bad("Please sign in to use AI insights.", 401);

  const entitlements = await getUserEntitlements(user.id);
  if (!entitlements.fullAnalytics) {
    return bad("AI insights are included with Pro.", 403);
  }

  if (!geminiConfigured()) {
    return bad("AI insights are not configured yet. Set GEMINI_API_KEY on the server.", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request.", 400);
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const scope = input.scope === "portfolio" ? "portfolio" : "session";
  const question = typeof input.question === "string" ? input.question.trim().slice(0, MAX_QUESTION) : "";
  if (!question) return bad("Please enter a question.", 422);

  const rawHistory = Array.isArray(input.history) ? input.history : [];
  const history: ChatTurn[] = rawHistory
    .filter((turn): turn is { role: string; text: string } => Boolean(turn) && typeof turn === "object")
    .map((turn) => ({
      role: turn.role === "model" ? ("model" as const) : ("user" as const),
      text: String(turn.text ?? "").slice(0, 4000),
    }))
    .filter((turn) => turn.text)
    .slice(-MAX_HISTORY_TURNS);

  // Build the grounding context for the requested scope.
  let context: string;
  if (scope === "session") {
    const sessionId = typeof input.sessionId === "string" ? input.sessionId : "";
    if (!sessionId) return bad("A session is required.", 422);
    const results = await getSessionResults(sessionId, user.id);
    if (!results) return bad("Session not found.", 404);
    context = buildSessionContext(results);
  } else {
    const sessions = await prisma.backtestSession.findMany({
      where: { userId: user.id, anonymous: false },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    if (!sessions.length) return bad("No saved sessions to analyse yet.", 422);
    context = buildPortfolioContext(sessions);
  }

  // Prepend the data context as the opening exchange so the model treats it as
  // fixed reference material, then replay the conversation and the new question.
  const turns: ChatTurn[] = [
    { role: "user", text: `DATA CONTEXT (source of truth for this conversation):\n\n${context}` },
    { role: "model", text: "Understood. I'll base my analysis strictly on this data. What would you like to know?" },
    ...history,
    { role: "user", text: question },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamGemini({
          systemInstruction: SYSTEM_INSTRUCTION,
          history: turns,
          signal: request.signal,
        })) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "The AI service is temporarily unavailable.";
        controller.enqueue(encoder.encode(`\n\n⚠️ ${message}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
