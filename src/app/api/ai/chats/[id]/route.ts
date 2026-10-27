import { deleteChat, getChat, updateChat } from "@/lib/ai/chats";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function bad(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET(_request: Request, props: Props) {
  const user = await getCurrentUser();
  if (!user) return bad("Please sign in.", 401);
  const chat = await getChat(user.id, (await props.params).id);
  return chat ? Response.json({ chat }) : bad("Chat not found.", 404);
}

export async function PATCH(request: Request, props: Props) {
  const user = await getCurrentUser();
  if (!user) return bad("Please sign in.", 401);
  const body = (await request.json().catch(() => null)) as { title?: unknown; pinned?: unknown } | null;
  const chat = await updateChat(user.id, (await props.params).id, {
    title: typeof body?.title === "string" ? body.title : undefined,
    pinned: typeof body?.pinned === "boolean" ? body.pinned : undefined,
  });
  return chat ? Response.json({ chat }) : bad("Chat not found.", 404);
}

export async function DELETE(_request: Request, props: Props) {
  const user = await getCurrentUser();
  if (!user) return bad("Please sign in.", 401);
  return (await deleteChat(user.id, (await props.params).id)) ? new Response(null, { status: 204 }) : bad("Chat not found.", 404);
}
