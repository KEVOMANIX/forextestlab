import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/supabase/server";
import { isProductEventName, normalizeAnalyticsPath, recordProductEvent } from "@/lib/product-analytics";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const COOKIE = "ftl_analytics";

export async function POST(request: Request) {
  const allowance = rateLimit(`analytics:${clientIp(request)}`, 120, 60 * 60_000);
  if (!allowance.ok) return NextResponse.json({ ok: false }, { status: 429 });
  const body = await request.json().catch(() => null) as { name?: unknown; path?: unknown } | null;
  if (!body || !isProductEventName(body.name)) return NextResponse.json({ ok: false }, { status: 400 });
  const path = normalizeAnalyticsPath(typeof body.path === "string" ? body.path : null);
  const cookieHeader = request.headers.get("cookie") ?? "";
  const existing = cookieHeader.match(/(?:^|;\s*)ftl_analytics=([^;]+)/)?.[1];
  const anonymousId = existing && /^[a-f0-9-]{36}$/i.test(existing) ? existing : randomUUID();
  const user = await getCurrentUser();
  await recordProductEvent({ name: body.name, path, userId: user?.id, anonymousId });
  const response = NextResponse.json({ ok: true });
  if (!existing) response.cookies.set(COOKIE, anonymousId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 180 * 86_400 });
  return response;
}
