import { getCurrentUser } from "@/lib/supabase/server";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { getSessionResults } from "@/lib/backtest/results";
import { geminiConfigured, streamGeminiWithTools, type ChatTurn } from "@/lib/ai/gemini";
import { buildPortfolioContext, buildSessionContext } from "@/lib/ai/context";
import { appendExchange, getChat, getTradingPlan } from "@/lib/ai/chats";
import { loadPortfolioSessions } from "@/lib/ai/portfolio";
import { BOOK_SESSION_LIMIT, TOOL_DECLARATIONS, loadTradeBook, runTool, type TradeBook } from "@/lib/ai/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_INSTRUCTION = `You are the AI trading-performance analyst inside ForexTestLab, a forex backtesting and market-replay platform.

You help a trader understand their own backtest results and become a better trader. A factual DATA CONTEXT for the current scope is provided as the first message, and you have tools that query the trader's real trades. Together they are the single source of truth.

Rules:
- Ground every claim in the DATA CONTEXT or a tool result. Never invent numbers, trades, or metrics. If neither answers the question, say so plainly.
- Use the tools whenever the answer needs a number the DATA CONTEXT does not already give: filtering trades (find_trades), breaking them down (group_trades), "what if I had skipped these" (what_if_skipped), and "what if my stop or target had been different" (what_if_levels, finished sessions only). Call several tools if you need to; do not ask the trader for data you can look up.
- Quote concrete figures to support your points.
- Be concise and structured: lead with the direct answer, then 2-4 specific, actionable recommendations tied to the numbers.
- Focus on process: risk management, consistency, timing, and expectancy — not price predictions.
- These are historical simulations, not investment advice. Do not tell the user to buy or sell any instrument, and add a one-line reminder only when they ask what to trade next.
- Use plain markdown (short headers, bullet points, numbered lists, and simple pipe tables when comparing three or more things). Keep answers under ~250 words unless the trader asks for depth or a full session review, which can run to ~600 words. Always finish the answer: end on a complete sentence, never a dangling heading or bullet.
- Cite specific trades so the interface can link them. Tool results give each trade's citation, like [#12@abc123]: copy it exactly. Trades listed in a single-session DATA CONTEXT may be cited as [#12]. Never invent a citation.
- When a comparison of three or more numbers is clearer as a picture, add at most two bar charts, each as a fenced block with the language "chart" holding JSON only, for example:
\`\`\`chart
{"title": "Net P/L by weekday", "unit": "$", "data": [{"label": "Mon", "value": -120.5}, {"label": "Tue", "value": 80}]}
\`\`\`
  Use only numbers from the DATA CONTEXT or a tool result, at most 12 bars, and unit "$", "%", "R" or "trades".
- If a TRADING PLAN is given, it is the trader's own rules. When it is relevant, check their trades against it, say which rules were broken and how often, and cite examples.`;

const MAX_QUESTION = 1000;
const MAX_HISTORY_TURNS = 12;

function bad(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function toTurns(raw: unknown): ChatTurn[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((turn): turn is { role: string; text: string } => Boolean(turn) && typeof turn === "object")
    .map((turn) => ({
      role: turn.role === "model" ? ("model" as const) : ("user" as const),
      text: String(turn.text ?? "").slice(0, 4000),
    }))
    .filter((turn) => turn.text);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return bad("Please sign in to use AI insights.", 401);

  const entitlements = await getUserEntitlements(user.id);
  if (!entitlements.fullAnalytics) {
    return bad("AI insights are part of Pro.", 403);
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
  const question = typeof input.question === "string" ? input.question.trim().slice(0, MAX_QUESTION) : "";
  if (!question) return bad("Please enter a question.", 422);

  // A saved chat (the AI Analyst page) is its own source of history and scope;
  // the panels elsewhere send both with the question.
  const chatId = typeof input.chatId === "string" ? input.chatId : null;
  const chat = chatId ? await getChat(user.id, chatId) : null;
  if (chatId && !chat) return bad("Chat not found.", 404);
  const sessionId = chat ? chat.sessionId : input.scope === "portfolio" ? null : typeof input.sessionId === "string" ? input.sessionId : "";
  const history = (chat ? toTurns(chat.messages) : toTurns(input.history)).slice(-MAX_HISTORY_TURNS);

  // Build the grounding context for the requested scope.
  let context: string;
  if (sessionId !== null) {
    if (!sessionId) return bad("A session is required.", 422);
    const results = await getSessionResults(sessionId, user.id);
    if (!results) return bad("Session not found.", 404);
    context = buildSessionContext(results);
  } else {
    const sessions = await loadPortfolioSessions(user.id);
    if (!sessions.length) return bad("No saved sessions to analyse yet.", 422);
    context = `${buildPortfolioContext(sessions)}\n\n(Tools read your ${BOOK_SESSION_LIMIT} most recently used sessions.)`;
  }
  const plan = await getTradingPlan(user.id);
  if (plan) context += `\n\n## TRADING PLAN (the trader's own rules)\n${plan}`;

  // Prepend the data context as the opening exchange so the model treats it as
  // fixed reference material, then replay the conversation and the new question.
  const turns: ChatTurn[] = [
    { role: "user", text: `DATA CONTEXT (source of truth for this conversation):\n\n${context}` },
    { role: "model", text: "Understood. I'll base my analysis strictly on this data and the tools. What would you like to know?" },
    ...history,
    { role: "user", text: question },
  ];

  // The trades are read on the first tool call only, then reused for the rest of the answer.
  let book: Promise<TradeBook> | null = null;
  const tradeBook = () => (book ??= loadTradeBook(user.id, sessionId ?? undefined));

  const encoder = new TextEncoder();
  let answer = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamGeminiWithTools({
          systemInstruction: SYSTEM_INSTRUCTION,
          history: turns,
          tools: TOOL_DECLARATIONS,
          runTool: async (name, args) => runTool(name, args, await tradeBook()),
          signal: request.signal,
        })) {
          answer += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        if (!request.signal.aborted) {
          const message =
            error instanceof Error ? error.message : "The AI service is temporarily unavailable.";
          controller.enqueue(encoder.encode(`\n\n⚠️ ${message}`));
        }
      } finally {
        // Kept even when the trader stopped it or closed the tab part-way.
        if (chat && answer.trim()) {
          await appendExchange(user.id, chat.id, [{ role: "user", text: question }, { role: "model", text: answer }]).catch(() => undefined);
        }
        try {
          controller.close();
        } catch {
          // Already closed because the client went away.
        }
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
