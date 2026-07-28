import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { notFound, redirect } from "next/navigation";

import { isAdminUser } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";

export const SUPPORT_STATUSES = [
  "new",
  "open",
  "active",
  "waiting_customer",
  "waiting_support",
  "snoozed",
  "resolved",
  "closed",
] as const;
export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const SUPPORT_CATEGORIES = [
  "account",
  "billing",
  "replay",
  "charts",
  "orders",
  "market_data",
  "journal",
  "bug",
  "feature",
  "other",
] as const;

export function supportToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSupportToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function matchesSupportToken(token: string, expectedHash: string | null) {
  if (!token || !expectedHash) return false;
  const actual = Buffer.from(hashSupportToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function agentName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const metadata = user.user_metadata ?? {};
  const value =
    metadata.display_name ??
    metadata.full_name ??
    metadata.name ??
    user.email?.split("@")[0] ??
    "Support agent";
  return String(value).trim().slice(0, 120);
}

export async function currentSupportAgent() {
  const user = await getCurrentUser();
  if (!user) return null;
  const existing = await prisma.supportAgent.findUnique({
    where: { userId: user.id },
  });
  if (existing?.active) return { user, agent: existing };
  if (!isAdminUser(user)) return null;
  const agent = await prisma.supportAgent.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      email: user.email ?? `${user.id}@support.local`,
      displayName: agentName(user),
      role: "supervisor",
      lastSeenAt: new Date(),
    },
    update: {
      email: user.email ?? existing?.email ?? `${user.id}@support.local`,
      displayName: agentName(user),
      active: true,
      lastSeenAt: new Date(),
    },
  });
  return { user, agent };
}

export async function requireSupportAgent(nextPath = "/support-team") {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  const identity = await currentSupportAgent();
  if (!identity) notFound();
  return identity;
}

export function supportAccessToken(request: Request) {
  return request.headers.get("x-support-token")?.trim() ?? "";
}

export async function canAccessSupportConversation(
  request: Request,
  conversation: {
    userId: string | null;
    visitorId: string | null;
    accessTokenHash: string | null;
  },
  legacyVisitorId = "",
) {
  const user = await getCurrentUser();
  if (user && conversation.userId === user.id) return true;
  if (
    matchesSupportToken(
      supportAccessToken(request),
      conversation.accessTokenHash,
    )
  ) {
    return true;
  }
  // Conversations created before secure participant tokens remain accessible
  // through their original opaque visitor UUID until the customer posts again.
  return Boolean(
    !conversation.accessTokenHash &&
      legacyVisitorId &&
      conversation.visitorId === legacyVisitorId,
  );
}
