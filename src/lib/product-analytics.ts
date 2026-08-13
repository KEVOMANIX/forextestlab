import "server-only";

import { prisma } from "@/lib/db";

export const PRODUCT_EVENT_NAMES = [
  "page_view",
  "signup_completed",
  "backtest_created",
  "backtest_completed",
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
