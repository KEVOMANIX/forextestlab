import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { readSavedSessionState } from "@/lib/backtest/saved-session-state";
import { fundedBalance } from "@/lib/backtest/replay-engine";
import { createShareSnapshot } from "@/lib/analytics/share-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function ownedSession(context: Context) {
  const user = await getCurrentUser();
  if (!user) return { error: json({ error: "Sign in required." }, 401) };
  const { id } = await context.params;
  const session = await prisma.backtestSession.findFirst({ where: { id, userId: user.id, anonymous: false } });
  if (!session) return { error: json({ error: "Session not found." }, 404) };
  return { user, session };
}

export async function GET(_request: Request, context: Context) {
  const result = await ownedSession(context);
  if (result.error) return result.error;
  const share = await prisma.analyticsShare.findUnique({ where: { sessionId: result.session!.id }, select: { token: true, createdAt: true, expiresAt: true } });
  return json({ share: share && share.expiresAt > new Date() ? share : null });
}

export async function POST(request: Request, context: Context) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Invalid origin." }, 403);
  const result = await ownedSession(context);
  if (result.error) return result.error;
  const entitlements = await getUserEntitlements(result.user!.id);
  if (!entitlements.exports) return json({ error: "Analytics sharing is part of Pro." }, 403);
  const state = await readSavedSessionState(result.session!);
  const snapshotJson = JSON.stringify(createShareSnapshot(state, fundedBalance(state)));
  if (Buffer.byteLength(snapshotJson) > 8_000_000) return json({ error: "This report is too large to share. Use PDF export instead." }, 413);
  const data = { token: randomBytes(32).toString("base64url"), snapshotJson, createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400_000) };
  const share = await prisma.analyticsShare.upsert({ where: { sessionId: result.session!.id }, create: { ...data, sessionId: result.session!.id }, update: data, select: { token: true, createdAt: true, expiresAt: true } });
  return json({ share });
}

export async function DELETE(request: Request, context: Context) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Invalid origin." }, 403);
  const result = await ownedSession(context);
  if (result.error) return result.error;
  await prisma.analyticsShare.deleteMany({ where: { sessionId: result.session!.id } });
  return json({ share: null });
}
