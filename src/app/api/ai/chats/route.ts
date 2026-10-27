import { getUserEntitlements } from "@/lib/billing/entitlements";
import { createChat, listChats } from "@/lib/ai/chats";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return bad("Please sign in.", 401);
  return Response.json({ chats: await listChats(user.id) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return bad("Please sign in.", 401);
  if (!(await getUserEntitlements(user.id)).fullAnalytics) return bad("The AI Analyst is part of Pro.", 403);
  const body = (await request.json().catch(() => null)) as { title?: unknown; sessionId?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title : "";
  const sessionId = typeof body?.sessionId === "string" && body.sessionId ? body.sessionId : null;
  if (!title.trim()) return bad("A chat needs a title.", 422);
  const chat = await createChat(user.id, { title, sessionId });
  return chat ? Response.json({ chat }, { status: 201 }) : bad("Session not found.", 404);
}
