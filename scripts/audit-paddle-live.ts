import { config } from "dotenv";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

config({ path: ".env.local" });
config();

type Tier = "starter" | "pro" | "advanced";
type Interval = "month" | "year";

const apiKey = process.env.PADDLE_LIVE_API_KEY?.trim();
if (!apiKey?.startsWith("pdl_live_")) {
  throw new Error("PADDLE_LIVE_API_KEY must contain a live Paddle API key.");
}

function requiredPriceId(tier: Tier, interval: Interval): string {
  const variable = `PADDLE_LIVE_${tier.toUpperCase()}_${interval.toUpperCase()}_PRICE_ID`;
  const value = process.env[variable]?.trim();
  if (!value?.startsWith("pri_")) {
    throw new Error(`${variable} must contain a live Paddle price ID.`);
  }
  return value;
}

const expected = (["starter", "pro", "advanced"] as const).flatMap((tier) =>
  (["month", "year"] as const).map((interval) => ({
    tier,
    interval,
    priceId: requiredPriceId(tier, interval),
  })),
);

const paddle = new Paddle(apiKey, {
  environment: Environment.production,
});

async function main() {
  const rows = await Promise.all(
    expected.map(async ({ tier, interval, priceId }) => {
      const price = await paddle.prices.get(priceId);
      const product = await paddle.products.get(price.productId);
      const [usPreview, kenyaPreview] = await Promise.all([
        paddle.pricingPreview.preview({
          items: [{ priceId, quantity: 1 }],
          address: { countryCode: "US" },
        }),
        paddle.pricingPreview.preview({
          items: [{ priceId, quantity: 1 }],
          address: { countryCode: "KE" },
        }),
      ]);
      const expectedProductName = `ForexTestLab ${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
      const actualInterval = price.billingCycle?.interval ?? null;
      const active =
        price.status === "active" &&
        product.status === "active" &&
        product.name === expectedProductName &&
        actualInterval === interval;

      return {
        tier,
        interval,
        priceId,
        product: product.name,
        priceStatus: price.status,
        productStatus: product.status,
        billingInterval: actualInterval,
        usTotal: usPreview.details.lineItems[0]?.formattedTotals.total ?? null,
        kenyaTotal:
          kenyaPreview.details.lineItems[0]?.formattedTotals.total ?? null,
        valid: active,
      };
    }),
  );

  console.table(rows);
  if (rows.some((row) => !row.valid)) {
    throw new Error("One or more live catalog entries do not match the expected tier configuration.");
  }
  console.log("Live Paddle catalog and localized price previews are valid.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
