import "server-only";

import { prisma } from "@/lib/db";

export const PRODUCT_EVENT_NAMES = [
  "page_view",
  "signup_completed",
  "backtest_created",
  "backtest_completed",
  "backtest_activity",
  "onboarding_started",
  "onboarding_completed",
  "pricing_viewed",
  "checkout_started",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export function isProductEventName(value: unknown): value is ProductEventName {
  return typeof value === "string" && (PRODUCT_EVENT_NAMES as readonly string[]).includes(value);
}

export function normalizeAnalyticsPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const path = value.split("?")[0]?.slice(0, 160) ?? "";
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path
    .replace(/\/app\/results\/[^/]+/, "/app/results/:session")
    .replace(/\/app\/backtest\/[^/]+/, "/app/backtest/:session")
    .replace(/\/admin\/sessions\/[^/]+/, "/admin/sessions/:session");
}

export async function recordProductEvent(input: {
  name: ProductEventName;
  userId?: string | null;
  anonymousId?: string | null;
  path?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  await prisma.productEvent.create({
    data: {
      name: input.name,
      userId: input.userId ?? null,
      anonymousId: input.anonymousId?.slice(0, 80) ?? null,
      path: normalizeAnalyticsPath(input.path),
      metadataJson: input.metadata ? JSON.stringify(input.metadata).slice(0, 1000) : null,
    },
  });
}

/** Record at most one visible practice heartbeat for a user in each UTC minute. */
export async function recordBacktestActivityMinute(input: {
  userId: string;
  path?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const minuteStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const bucketKey = `practice:${input.userId}:${minuteStart.toISOString()}`;
  return prisma.$transaction(async (transaction) => {
    // Serialize this user-minute so simultaneous tabs cannot both pass the
    // existence check. The lock lives only for this short transaction.
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bucketKey}))`;
    const existing = await transaction.productEvent.findFirst({
      where: {
        userId: input.userId,
        name: "backtest_activity",
        createdAt: { gte: minuteStart },
      },
      select: { id: true },
    });
    if (existing) return false;
    await transaction.productEvent.create({
      data: {
        name: "backtest_activity",
        userId: input.userId,
        path: normalizeAnalyticsPath(input.path),
      },
    });
    return true;
  });
}

export async function recordProductEventOncePerUser(input: {
  name: ProductEventName;
  userId: string;
  path?: string | null;
}) {
  const existing = await prisma.productEvent.findFirst({
    where: { name: input.name, userId: input.userId },
    select: { id: true },
  });
  if (!existing) await recordProductEvent(input);
}
