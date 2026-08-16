import { getCurrentUser } from "@/lib/supabase/server";
import { Prisma } from "@/generated/prisma/client";
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
- Use plain markdown (short headers, bullet points, numbered lists, and simple pipe tables when comparing three or more things). Keep answers under ~250 words unless the trader asks for depth.
- When a point is about specific trades, cite them with their bracketed number exactly as it appears in the context — for example "the losses cluster in [#12] and [#17]". The interface turns those into links to the trade. Only cite numbers that appear in the context, and never invent one.`;

const MAX_QUESTION = 1000;
const MAX_HISTORY_TURNS = 12;

interface PortfolioMetadataRow {
  id: string;
  name: string | null;
  symbols: unknown;
  archived: boolean;
}

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
    const sessionRows = await prisma.backtestSession.findMany({
      where: { userId: user.id, anonymous: false },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        symbol: true,
        timeframe: true,
        status: true,
        startTime: true,
        endTime: true,
        startingBalance: true,
        balance: true,
        trades: { orderBy: { exitTime: "asc" } },
        equitySnapshots: { orderBy: { index: "asc" } },
      },
    });
    if (!sessionRows.length) return bad("No saved sessions to analyse yet.", 422);
    const metadataRows = await prisma.$queryRaw<PortfolioMetadataRow[]>(Prisma.sql`
      SELECT "id",
             NULLIF("stateJson"::jsonb #>> '{config,name}', '') AS "name",
             COALESCE(
               "stateJson"::jsonb #> '{config,symbols}',
               jsonb_build_array("symbol")
             ) AS "symbols",
             COALESCE(
               ("stateJson"::jsonb #>> '{config,archived}')::boolean,
               false
             ) AS "archived"
      FROM "BacktestSession"
      WHERE "id" IN (${Prisma.join(sessionRows.map((session) => session.id))})
    `);
    const metadata = new Map(metadataRows.map((row) => [row.id, row]));
    const sessions = sessionRows.map((session) => {
      const details = metadata.get(session.id);
      const symbols = Array.isArray(details?.symbols)
        ? details.symbols.filter((value): value is string => typeof value === "string")
        : [];
      return {
        ...session,
        name: details?.name?.trim() || `${session.symbol} backtest`,
        symbols: symbols.length ? symbols : [session.symbol],
        archived: details?.archived ?? false,
      };
    });
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
