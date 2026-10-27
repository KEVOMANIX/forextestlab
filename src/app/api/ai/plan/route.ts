import { MAX_PLAN_LENGTH, getTradingPlan, saveTradingPlan } from "@/lib/ai/chats";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  return Response.json({ rules: await getTradingPlan(user.id), maxLength: MAX_PLAN_LENGTH });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { rules?: unknown } | null;
  if (typeof body?.rules !== "string") return Response.json({ error: "Write your rules as text." }, { status: 422 });
  return Response.json({ rules: await saveTradingPlan(user.id, body.rules) });
}
