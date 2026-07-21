import "dotenv/config";

import { Environment, Paddle } from "@paddle/paddle-node-sdk";

const apiKey = process.env.PADDLE_SANDBOX_API_KEY?.trim();
if (!apiKey) {
  throw new Error("Set PADDLE_SANDBOX_API_KEY before creating the sandbox catalog.");
}

const paddle = new Paddle(apiKey, { environment: Environment.sandbox });

async function main() {
  const product = await paddle.products.create({
    name: "ForexTestLab Pro",
    description: "Unlimited historical market replay, complete analytics, and exports.",
    taxCategory: "saas",
  });
  const monthly = await paddle.prices.create({
    productId: product.id,
    description: "ForexTestLab Pro Monthly",
    unitPrice: { amount: "1000", currencyCode: "USD" },
    billingCycle: { interval: "month", frequency: 1 },
  });
  const annual = await paddle.prices.create({
    productId: product.id,
    description: "ForexTestLab Pro Annual",
    unitPrice: { amount: "8000", currencyCode: "USD" },
    billingCycle: { interval: "year", frequency: 1 },
  });

  console.log(JSON.stringify({
    productId: product.id,
    monthlyPriceId: monthly.id,
    annualPriceId: annual.id,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
