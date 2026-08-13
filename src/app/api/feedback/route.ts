import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const schema = z.object({ sessionId: z.string().min(1).max(80), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!rateLimit(`feedback:${user.id}:${clientIp(request)}`, 10, 86_400_000).ok) return NextResponse.json({ ok: false }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const session = await prisma.backtestSession.findFirst({ where: { id: parsed.data.sessionId, userId: user.id }, select: { id: true } });
  if (!session) return NextResponse.json({ ok: false }, { status: 404 });
  const existing = await prisma.productFeedback.findFirst({ where: { sessionId: session.id, userId: user.id }, select: { id: true } });
  if (existing) await prisma.productFeedback.update({ where: { id: existing.id }, data: { rating: parsed.data.rating, comment: parsed.data.comment || null } });
  else await prisma.productFeedback.create({ data: { userId: user.id, sessionId: session.id, rating: parsed.data.rating, comment: parsed.data.comment || null } });
  return NextResponse.json({ ok: true });
}
