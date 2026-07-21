import "server-only";

import { paddleMode } from "./paddle";
import type { BillingInterval, PaddleTierProductKey, Tier, TierId } from "./tier-types";

const TIER_COPY: Omit<Tier, "priceId">[] = [
  {
    id: "starter",
    name: "Starter",
    description: "A focused replay workspace for traders building a consistent review habit.",
    features: [
      "Saved replay sessions",
      "Core order and risk tools",
      "Session performance overview",
      "Standard replay speeds",
    ],
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    description: "The complete testing workflow for active traders refining an edge.",
    features: [
      "Unlimited saved sessions",
      "Multi-pair backtests",
      "Complete risk and timing analytics",
      "Trade and analytics exports",
      "All replay speeds and controls",
    ],
    featured: true,
  },
  {
    id: "advanced",
    name: "Advanced",
    description: "More capacity and support for traders running a serious research process.",
    features: [
      "Everything in Pro",
      "Advanced performance reporting",
      "Priority support",
      "Early access to new research tools",
      "Designed for high-volume testing",
    ],
    featured: false,
  },
];

function priceVariableName(tier: TierId, interval: BillingInterval): string {
  const environment = paddleMode() === "live" ? "LIVE" : "SANDBOX";
  return `PADDLE_${environment}_${tier.toUpperCase()}_${interval.toUpperCase()}_PRICE_ID`;
}

export function configuredPaddleTierPriceId(tier: TierId, interval: BillingInterval): string | undefined {
  return process.env[priceVariableName(tier, interval)]?.trim() || undefined;
}

function requiredPriceId(tier: TierId, interval: BillingInterval): string {
  const variable = priceVariableName(tier, interval);
  const value = process.env[variable]?.trim();
  if (!value || !value.startsWith("pri_")) {
    throw new Error(`${variable} must contain a Paddle price ID beginning with pri_.`);
  }
  return value;
}

export function getPricingTiers(): Tier[] {
  return TIER_COPY.map((tier) => ({
    ...tier,
    features: [...tier.features],
    priceId: {
      month: requiredPriceId(tier.id, "month"),
      year: requiredPriceId(tier.id, "year"),
    },
  }));
}

export function paddleProductKeyFromPriceId(priceId: string | null): PaddleTierProductKey | null {
  if (!priceId) return null;
  for (const tier of ["starter", "pro", "advanced"] as const) {
    for (const interval of ["month", "year"] as const) {
      if (configuredPaddleTierPriceId(tier, interval) === priceId) return `${tier}_${interval}`;
    }
  }
  return null;
}
