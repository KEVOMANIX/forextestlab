import "server-only";

import { paddleMode } from "./paddle";
import { PRO_PLAN_FEATURES } from "./plan-copy";
import type { BillingInterval, PaddleTierProductKey, Tier, TierId } from "./tier-types";

const TIER_COPY: Omit<Tier, "priceId">[] = [
  {
    id: "pro",
    name: "Pro",
    description: "Every market and the full history, multi-pair replay, full analytics and Prop Firm Challenge mode.",
    features: [...PRO_PLAN_FEATURES],
    featured: true,
  },
];

/**
 * Paddle prices. `PADDLE_<MODE>_PRO_<MONTH|YEAR>_PRICE_ID` is the plain
 * subscription; `..._TRIAL_PRICE_ID` is the same plan and amount created in
 * Paddle with a 7-day `trial_period` and `requires_payment_method: true`. A
 * trial lives on the price in Paddle, so returning customers need the plain
 * one; the server picks which (see checkout.ts).
 */
function priceVariableName(tier: TierId, interval: BillingInterval, trial = false): string {
  const environment = paddleMode() === "live" ? "LIVE" : "SANDBOX";
  return `PADDLE_${environment}_${tier.toUpperCase()}_${interval.toUpperCase()}_${trial ? "TRIAL_" : ""}PRICE_ID`;
}

export function configuredPaddleTierPriceId(tier: TierId, interval: BillingInterval, trial = false): string | undefined {
  const value = process.env[priceVariableName(tier, interval, trial)]?.trim();
  return value?.startsWith("pri_") ? value : undefined;
}

/** Whether both trial prices are configured, so a trial can be offered at all. */
export function proTrialPricesConfigured(): boolean {
  return Boolean(configuredPaddleTierPriceId("pro", "month", true) && configuredPaddleTierPriceId("pro", "year", true));
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
      if (
        configuredPaddleTierPriceId(tier, interval) === priceId ||
        configuredPaddleTierPriceId(tier, interval, true) === priceId
      ) return `${tier}_${interval}`;
    }
  }
  return null;
}
