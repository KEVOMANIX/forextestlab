import { config } from "dotenv";
import {
  Environment,
  Paddle,
  type Discount,
} from "@paddle/paddle-node-sdk";

config({ path: ".env.local" });
config();

const apiKey = process.env.PADDLE_LIVE_API_KEY?.trim();
if (!apiKey?.startsWith("pdl_live_")) {
  throw new Error("PADDLE_LIVE_API_KEY must contain a live Paddle API key.");
}

function requiredPriceId(variable: string): string {
  const value = process.env[variable]?.trim();
  if (!value?.startsWith("pri_")) {
    throw new Error(`${variable} must contain a live Paddle price ID.`);
  }
  return value;
}

const monthlyPriceIds = [
  requiredPriceId("PADDLE_LIVE_STARTER_MONTH_PRICE_ID"),
  requiredPriceId("PADDLE_LIVE_PRO_MONTH_PRICE_ID"),
  requiredPriceId("PADDLE_LIVE_ADVANCED_MONTH_PRICE_ID"),
];

const yearlyPriceIds = [
  requiredPriceId("PADDLE_LIVE_STARTER_YEAR_PRICE_ID"),
  requiredPriceId("PADDLE_LIVE_PRO_YEAR_PRICE_ID"),
  requiredPriceId("PADDLE_LIVE_ADVANCED_YEAR_PRICE_ID"),
];

interface DiscountDefinition {
  code: string;
  description: string;
  amount: string;
  usageLimit: number | null;
  restrictTo: string[];
  samplePriceId: string;
  expiresAt: string | null;
}

const definitions: DiscountDefinition[] = [
  {
    code: "WELCOME20",
    description: "20% off the first monthly payment",
    amount: "20",
    usageLimit: null,
    restrictTo: monthlyPriceIds,
    samplePriceId: monthlyPriceIds[0]!,
    expiresAt: "2026-10-21T23:59:59Z",
  },
  {
    code: "PARTNER15",
    description: "15% off the first payment for partners",
    amount: "15",
    usageLimit: 100,
    restrictTo: [...monthlyPriceIds, ...yearlyPriceIds],
    samplePriceId: monthlyPriceIds[0]!,
    expiresAt: null,
  },
  {
    code: "YEARLY10",
    description: "10% off the first yearly payment",
    amount: "10",
    usageLimit: null,
    restrictTo: yearlyPriceIds,
    samplePriceId: yearlyPriceIds[0]!,
    expiresAt: null,
  },
];

const paddle = new Paddle(apiKey, {
  environment: Environment.production,
});

async function collectDiscounts(): Promise<Discount[]> {
  const collection = paddle.discounts.list({
    code: definitions.map(({ code }) => code),
    status: ["active", "archived"],
    perPage: 200,
  });
  const discounts: Discount[] = [];
  while (collection.hasMore) {
    discounts.push(...(await collection.next()));
  }
  return discounts;
}

function sameIds(left: string[] | null, right: string[]): boolean {
  if (!left || left.length !== right.length) return false;
  return [...left].sort().every((id, index) => id === [...right].sort()[index]);
}

function matches(discount: Discount, definition: DiscountDefinition): boolean {
  return (
    discount.status === "active" &&
    discount.description === definition.description &&
    discount.enabledForCheckout &&
    discount.code === definition.code &&
    discount.mode === "standard" &&
    discount.type === "percentage" &&
    discount.amount === definition.amount &&
    !discount.recur &&
    discount.maximumRecurringIntervals === null &&
    discount.usageLimit === definition.usageLimit &&
    discount.expiresAt === definition.expiresAt &&
    sameIds(discount.restrictTo, definition.restrictTo)
  );
}

async function upsertDiscount(
  definition: DiscountDefinition,
  existing: Discount | undefined,
): Promise<{ discount: Discount; action: "created" | "updated" | "unchanged" }> {
  if (existing && matches(existing, definition)) {
    return { discount: existing, action: "unchanged" };
  }

  const payload = {
    description: definition.description,
    enabledForCheckout: true,
    code: definition.code,
    mode: "standard" as const,
    type: "percentage" as const,
    amount: definition.amount,
    currencyCode: null,
    recur: false,
    maximumRecurringIntervals: null,
    usageLimit: definition.usageLimit,
    restrictTo: definition.restrictTo,
    expiresAt: definition.expiresAt,
    customData: {
      application: "forextestlab",
      purpose: definition.code.toLowerCase(),
    },
  };

  if (existing) {
    const discount = await paddle.discounts.update(existing.id, {
      ...payload,
      status: "active",
    });
    return { discount, action: "updated" };
  }

  const discount = await paddle.discounts.create(payload);
  return { discount, action: "created" };
}

async function main() {
  const existing = await collectDiscounts();
  const results = [];

  for (const definition of definitions) {
    const match = existing.find((discount) => discount.code === definition.code);
    results.push(await upsertDiscount(definition, match));
  }

  for (const { discount, action } of results) {
    const expected = definitions.find(({ code }) => code === discount.code);
    if (!expected || !matches(discount, expected)) {
      throw new Error(`Verification failed for ${discount.code ?? discount.id}.`);
    }
    const preview = await paddle.pricingPreview.preview({
      items: [{ priceId: expected.samplePriceId, quantity: 1 }],
      discountId: discount.id,
      address: { countryCode: "US" },
    });
    const lineItem = preview.details.lineItems[0];
    if (
      preview.discountId !== discount.id ||
      !lineItem?.discounts.some(
        ({ discount: applied }) => applied.id === discount.id,
      )
    ) {
      throw new Error(`Checkout preview did not apply ${discount.code}.`);
    }
    console.log(
      `${discount.code}: ${action} (${discount.id}, ${discount.amount}% first payment, preview total ${lineItem.formattedTotals.total})`,
    );
  }

  console.log("Live Paddle discounts are configured and verified.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
