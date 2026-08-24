import "server-only";

import { paddleMode } from "./paddle";
import type { BillingInterval, PaddleTierProductKey, Tier, TierId } from "./tier-types";

const TIER_COPY: Omit<Tier, "priceId">[] = [
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
  for (const tier of ["pro"] as const) {
    for (const interval of ["month", "year"] as const) {
      if (configuredPaddleTierPriceId(tier, interval) === priceId) return `${tier}_${interval}`;
    }
  }
  return null;
}
