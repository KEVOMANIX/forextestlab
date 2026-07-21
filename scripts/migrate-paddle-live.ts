import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Environment, Paddle, type Discount, type Price, type Product } from "@paddle/paddle-node-sdk";

const EXPECTED_PRODUCTS = new Set([
  "ForexTestLab Starter",
  "ForexTestLab Pro",
  "ForexTestLab Advanced",
]);
const JUNK_PATTERN = /\b(test|junk|dummy|sample|demo|temporary|tmp)\b/i;

const sandboxKey = process.env.PADDLE_SANDBOX_API_KEY?.trim();
const liveKey = process.env.PADDLE_LIVE_API_KEY?.trim();
if (!sandboxKey?.startsWith("pdl_sdbx_")) throw new Error("PADDLE_SANDBOX_API_KEY must be a sandbox API key.");
if (!liveKey?.startsWith("pdl_live_")) throw new Error("PADDLE_LIVE_API_KEY must be a live API key.");

const sandbox = new Paddle(sandboxKey, { environment: Environment.sandbox });
const live = new Paddle(liveKey, { environment: Environment.production });

async function collect<T>(collection: { hasMore: boolean; next(): Promise<T[]> }): Promise<T[]> {
  const items: T[] = [];
  while (collection.hasMore) items.push(...await collection.next());
  return items;
}

function mapPeriod(period: { interval: "day" | "week" | "month" | "year"; frequency: number } | null) {
  return period ? { interval: period.interval, frequency: period.frequency } : null;
}

function isCleanProduct(product: Product): boolean {
  return product.status === "active" && EXPECTED_PRODUCTS.has(product.name) && !JUNK_PATTERN.test(product.name);
}

function isCleanDiscount(discount: Discount): boolean {
  return discount.status === "active" && !JUNK_PATTERN.test(discount.description) && !JUNK_PATTERN.test(discount.code ?? "");
}

async function main() {
  const [sandboxProducts, sandboxPrices, sandboxDiscounts, liveProducts, livePrices, liveDiscounts] = await Promise.all([
    collect<Product>(sandbox.products.list({ status: ["active"], perPage: 200 })),
    collect<Price>(sandbox.prices.list({ status: ["active"], perPage: 200 })),
    collect<Discount>(sandbox.discounts.list({ status: ["active"], perPage: 200 })),
    collect<Product>(live.products.list({ status: ["active", "archived"], perPage: 200 })),
    collect<Price>(live.prices.list({ status: ["active", "archived"], perPage: 200 })),
    collect<Discount>(live.discounts.list({ status: ["active", "archived"], perPage: 200 })),
  ]);

  const productIds: Record<string, string> = {};
  const priceIds: Record<string, string> = {};
  const discountIds: Record<string, string> = {};

  for (const source of sandboxProducts.filter(isCleanProduct)) {
    let destination = liveProducts.find((item) => item.name === source.name && item.status === "active");
    destination ??= await live.products.create({
      name: source.name,
      taxCategory: source.taxCategory,
      type: source.type,
      description: source.description,
      imageUrl: source.imageUrl,
      customData: source.customData,
    });
    productIds[source.id] = destination.id;

    for (const sourcePrice of sandboxPrices.filter((price) => price.productId === source.id && price.status === "active")) {
      let destinationPrice = livePrices.find((price) =>
        price.productId === destination.id && price.description === sourcePrice.description && price.status === "active"
      );
      destinationPrice ??= await live.prices.create({
        name: sourcePrice.name,
        description: sourcePrice.description,
        type: sourcePrice.type,
        productId: destination.id,
        unitPrice: { amount: sourcePrice.unitPrice.amount, currencyCode: sourcePrice.unitPrice.currencyCode },
        billingCycle: mapPeriod(sourcePrice.billingCycle),
        trialPeriod: mapPeriod(sourcePrice.trialPeriod),
        taxMode: sourcePrice.taxMode,
        unitPriceOverrides: sourcePrice.unitPriceOverrides.map((override) => ({
          countryCodes: [...override.countryCodes],
          unitPrice: { amount: override.unitPrice.amount, currencyCode: override.unitPrice.currencyCode },
        })),
        quantity: { minimum: sourcePrice.quantity.minimum, maximum: sourcePrice.quantity.maximum },
        customData: sourcePrice.customData,
      });
      priceIds[sourcePrice.id] = destinationPrice.id;
    }
  }

  for (const source of sandboxDiscounts.filter(isCleanDiscount)) {
    const mappedRestrictions = source.restrictTo?.map((id) => productIds[id] ?? priceIds[id]).filter((id): id is string => Boolean(id)) ?? null;
    if (source.restrictTo?.length && !mappedRestrictions?.length) continue;
    let destination = liveDiscounts.find((item) =>
      item.status === "active" && item.description === source.description && item.code === source.code
    );
    destination ??= await live.discounts.create({
      amount: source.amount,
      description: source.description,
      type: source.type,
      enabledForCheckout: source.enabledForCheckout,
      code: source.code,
      mode: source.mode,
      currencyCode: source.currencyCode,
      recur: source.recur,
      maximumRecurringIntervals: source.maximumRecurringIntervals,
      usageLimit: source.usageLimit,
      restrictTo: mappedRestrictions,
      expiresAt: source.expiresAt,
      customData: source.customData,
    });
    discountIds[source.id] = destination.id;
  }

  const outputDirectory = resolve(process.cwd(), ".tmp");
  await mkdir(outputDirectory, { recursive: true });
  const output = resolve(outputDirectory, "paddle-live-id-map.json");
  await writeFile(output, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "paddle-sandbox",
    destination: "paddle-live",
    products: productIds,
    prices: priceIds,
    discounts: discountIds,
  }, null, 2)}\n`, "utf8");
  console.log(`Migrated ${Object.keys(productIds).length} products, ${Object.keys(priceIds).length} prices, and ${Object.keys(discountIds).length} discounts.`);
  console.log(`ID mapping written to ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
