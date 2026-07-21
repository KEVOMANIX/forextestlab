import "server-only";

import { configuredPaystackSecretKey, paystackMode } from "./paystack";

export type PaidPlanKey = "pro_monthly_usd" | "pro_annual_usd";
export type CheckoutProductKey = PaidPlanKey | "pro_pass_30d_kes";

export interface CheckoutProduct {
  key: CheckoutProductKey;
  name: string;
  amount: number;
  currency: "USD" | "KES";
  accessDays: number;
  recurring: boolean;
  planCode: string | null;
  channels: ("card" | "mobile_money")[];
}

export interface BillingPlan {
  key: "free" | PaidPlanKey;
  name: string;
  description: string;
  amount: number;
  currency: "USD" | "KES";
  interval: "forever" | "month" | "year";
  features: string[];
  featured?: boolean;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Public product catalogue. Paddle localizes these base USD prices at checkout. */
export function getBillingCatalog(): BillingPlan[] {
  const monthlyAmount = positiveInteger(process.env.PAYSTACK_KES_MONTHLY_PRICE, 120000);
  const annualAmount = positiveInteger(process.env.PAYSTACK_KES_ANNUAL_PRICE, 990000);
  return [
    {
      key: "free",
      name: "Free",
      description: "Build a testing habit and learn the replay workflow.",
      amount: 0,
      currency: "KES",
      interval: "forever",
      features: [
        "One saved backtest session",
        "Any one pair for up to 31 days",
        "Core replay and order tools",
        "Session summary analytics",
      ],
    },
    {
      key: "pro_monthly_usd",
      name: "Pro Monthly",
      description: "Full access with the flexibility of monthly billing.",
      amount: monthlyAmount,
      currency: "KES",
      interval: "month",
      featured: true,
      features: [
        "Unlimited saved sessions",
        "Multi-pair backtests",
        "Complete risk and timing analytics",
        "Trade and analytics exports",
        "All replay speeds and controls",
      ],
    },
    {
      key: "pro_annual_usd",
      name: "Pro Annual",
      description: "The complete workspace at the best effective price.",
      amount: annualAmount,
      currency: "KES",
      interval: "year",
      features: [
        "Everything in Pro Monthly",
        "One annual payment",
        "Lower effective monthly price",
        "Price protected for the paid term",
        "Priority access to new Pro tools",
      ],
    },
  ];
}

export function formatPlanPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat(currency === "KES" ? "en-KE" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
  }).format(amount / 100);
}

export function annualSavingPercent(monthlyAmount: number, annualAmount: number): number {
  const fullYear = monthlyAmount * 12;
  return fullYear > annualAmount ? Math.round((1 - annualAmount / fullYear) * 100) : 0;
}

function configuredPlanCode(interval: "month" | "year"): string | undefined {
  const scope = paystackMode() === "test" ? "PAYSTACK_TEST_KES" : "PAYSTACK_KES";
  return process.env[`${scope}_${interval === "month" ? "MONTHLY" : "ANNUAL"}_PLAN_CODE`]?.trim();
}

export function isCheckoutProductKey(value: unknown): value is CheckoutProductKey {
  return value === "pro_monthly_usd" || value === "pro_annual_usd" || value === "pro_pass_30d_kes";
}

export function getCheckoutProduct(key: CheckoutProductKey): CheckoutProduct {
  const plans = getBillingCatalog();
  if (key === "pro_pass_30d_kes") {
    return {
      key,
      name: "Pro 30-Day Kenya Pass",
      amount: positiveInteger(process.env.PAYSTACK_KES_PASS_PRICE, 150000),
      currency: "KES",
      accessDays: positiveInteger(process.env.PAYSTACK_KES_PASS_DURATION_DAYS, 30),
      recurring: false,
      planCode: null,
      channels: ["mobile_money"],
    };
  }
  const plan = plans.find((item) => item.key === key);
  if (!plan) throw new Error("Unknown billing product.");
  const planCode = configuredPlanCode(key === "pro_monthly_usd" ? "month" : "year");
  return {
    key,
    name: plan.name,
    amount: plan.amount,
    currency: plan.currency,
    accessDays: key === "pro_monthly_usd" ? 35 : 370,
    recurring: true,
    planCode: planCode && planCode.startsWith("PLN_") && !planCode.includes("REPLACE") ? planCode : null,
    channels: ["card"],
  };
}

export function checkoutProductReady(key: CheckoutProductKey): boolean {
  if (process.env.PAYSTACK_CHECKOUT_PAUSED === "true") return false;
  const product = getCheckoutProduct(key);
  return Boolean(configuredPaystackSecretKey()) && (!product.recurring || Boolean(product.planCode?.startsWith("PLN_")));
}
