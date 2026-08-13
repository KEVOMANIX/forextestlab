import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/supabase/server";
import { isProductEventName, normalizeAnalyticsPath, recordProductEvent } from "@/lib/product-analytics";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const allowance = rateLimit(`analytics:${clientIp(request)}`, 120, 60 * 60_000);
  if (!allowance.ok) return NextResponse.json({ ok: false }, { status: 429 });
  const body = await request.json().catch(() => null) as { name?: unknown; path?: unknown; anonymousId?: unknown } | null;
  if (!body || !isProductEventName(body.name)) return NextResponse.json({ ok: false }, { status: 400 });
  const path = normalizeAnalyticsPath(typeof body.path === "string" ? body.path : null);
  const anonymousId = typeof body.anonymousId === "string" && /^[a-f0-9-]{36}$/i.test(body.anonymousId) ? body.anonymousId : null;
  const user = await getCurrentUser();
  await recordProductEvent({ name: body.name, path, userId: user?.id, anonymousId });
  return NextResponse.json({ ok: true });
}
