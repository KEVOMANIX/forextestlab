import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Environment, Paddle } from "@paddle/paddle-node-sdk";

config({ path: ".env.local" });
config();

const apiKey = process.env.PADDLE_LIVE_API_KEY?.trim();
const starterMonthlyPriceId =
  process.env.PADDLE_LIVE_STARTER_MONTH_PRICE_ID?.trim();

if (process.env.PADDLE_MODE?.trim().toLowerCase() !== "live") {
  throw new Error("PADDLE_MODE must be live for the live E2E test.");
}
if (!apiKey?.startsWith("pdl_live_")) {
  throw new Error("PADDLE_LIVE_API_KEY must contain a live API key.");
}
if (!starterMonthlyPriceId?.startsWith("pri_")) {
  throw new Error(
    "PADDLE_LIVE_STARTER_MONTH_PRICE_ID must contain a live price ID.",
  );
}

const paddle = new Paddle(apiKey, {
  environment: Environment.production,
});

function testCode(now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/\D/g, "")
    .slice(2, 12);
  return `FTLLIVE100${stamp}`;
}

async function main() {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
  const code = testCode(createdAt);

  const discount = await paddle.discounts.create({
    amount: "100",
    description: `ForexTestLab live E2E zero-cost checkout ${createdAt.toISOString()}`,
    type: "percentage",
    enabledForCheckout: true,
    code,
    mode: "standard",
    recur: false,
    maximumRecurringIntervals: null,
    usageLimit: 1,
    restrictTo: [starterMonthlyPriceId!],
    expiresAt: expiresAt.toISOString(),
    customData: {
      application: "forextestlab",
      purpose: "live_e2e_zero_cost_checkout",
    },
  });

  const preview = await paddle.pricingPreview.preview({
    items: [{ priceId: starterMonthlyPriceId!, quantity: 1 }],
    discountId: discount.id,
    address: { countryCode: "US" },
  });
  const lineItem = preview.details.lineItems[0];
  const applied = lineItem?.discounts.some(
    ({ discount: item }) => item.id === discount.id,
  );
  if (
    discount.status !== "active" ||
    discount.amount !== "100" ||
    discount.usageLimit !== 1 ||
    discount.recur ||
    !applied ||
    lineItem?.totals.total !== "0"
  ) {
    await paddle.discounts.archive(discount.id);
    throw new Error(
      "The live E2E discount failed verification and was archived.",
    );
  }

  const outputDirectory = resolve(process.cwd(), ".tmp");
  await mkdir(outputDirectory, { recursive: true });
  const stateFile = resolve(outputDirectory, "paddle-live-e2e.json");
  await writeFile(
    stateFile,
    `${JSON.stringify(
      {
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        code,
        discountId: discount.id,
        starterMonthlyPriceId,
        status: "awaiting_checkout",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Code: ${code}`);
  console.log(`Discount: ${discount.id}`);
  console.log(`Expires: ${expiresAt.toISOString()}`);
  console.log(`Verified checkout preview total: ${lineItem.formattedTotals.total}`);
  console.log(`State: ${stateFile}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
