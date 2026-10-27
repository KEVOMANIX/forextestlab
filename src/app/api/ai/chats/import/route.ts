import { parseThreads } from "@/lib/ai/analyst-threads";
import { importChats, listChats } from "@/lib/ai/chats";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-off: chats the first version of the AI Analyst page saved in the browser. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const threads = parseThreads(await request.text());
  const imported = await importChats(user.id, threads);
  return Response.json({ imported, chats: await listChats(user.id) });
}
