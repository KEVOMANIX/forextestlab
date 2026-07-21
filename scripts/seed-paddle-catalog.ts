import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

type TierId = "starter" | "pro" | "advanced";
type Interval = "month" | "year";

const apiKey = process.env.PADDLE_SANDBOX_API_KEY?.trim();
if (!apiKey?.startsWith("pdl_sdbx_")) {
  throw new Error("PADDLE_SANDBOX_API_KEY must contain a sandbox API key beginning with pdl_sdbx_.");
}
if (process.env.PADDLE_MODE?.trim().toLowerCase() !== "sandbox") {
  throw new Error("Set PADDLE_MODE=sandbox before creating the sandbox catalog.");
}

function requiredAmount(tier: TierId, interval: Interval): string {
  const variable = `PADDLE_${tier.toUpperCase()}_${interval.toUpperCase()}_PRICE_USD_CENTS`;
  const value = process.env[variable]?.trim();
  if (!value || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`${variable} must be a positive integer in USD cents.`);
  }
  return value;
}

const tierDescriptions: Record<TierId, string> = {
  starter: "A focused market replay workspace for building a consistent testing habit.",
  pro: "The complete backtesting and analytics workflow for active traders.",
  advanced: "Extended reporting, capacity, and priority support for serious research.",
};

const paddle = new Paddle(apiKey, { environment: Environment.sandbox });

async function main() {
  const result: Record<string, string> = {};
  for (const tier of ["starter", "pro", "advanced"] as const) {
    const name = `${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
    const product = await paddle.products.create({
      name: `ForexTestLab ${name}`,
      description: tierDescriptions[tier],
      taxCategory: "saas",
    });
    result[`${tier}ProductId`] = product.id;

    for (const interval of ["month", "year"] as const) {
      const price = await paddle.prices.create({
        productId: product.id,
        description: `ForexTestLab ${name} ${interval === "month" ? "Monthly" : "Yearly"}`,
        unitPrice: { amount: requiredAmount(tier, interval), currencyCode: "USD" },
        billingCycle: { interval, frequency: 1 },
      });
      result[`${tier}${interval === "month" ? "Month" : "Year"}PriceId`] = price.id;
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
