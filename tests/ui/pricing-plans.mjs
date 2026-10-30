// Isolated pricing check: real components and styles, deterministic Paddle preview.
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "tailwindcss";
import { chromium, expect } from "@playwright/test";

const bundle = await build({
  stdin: {
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { LocalizedPricing } from './src/components/billing/LocalizedPricing';
      import { PRO_PLAN_FEATURES } from './src/lib/billing/plan-copy';
      const root = createRoot(document.getElementById('root'));
      const tiers = [{id:'pro', name:'Pro', featured:true, description:'', features:PRO_PLAN_FEATURES, priceId:{month:'pri_month',year:'pri_year'}}];
      window.renderPricing = (trialOffer = true) => root.render(<LocalizedPricing tiers={tiers} clientToken="live_fixture" environment="production" userId="fixture" customerEmail="fixture@example.test" trialOffer={trialOffer} trialAvailable />);
      window.renderPricing();`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
});
const css = await postcss([tailwind("./tailwind.config.ts")]).process(
  await readFile("src/app/globals.css", "utf8"), { from: "src/app/globals.css" },
);
await mkdir(".tmp/pricing-plans", { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    await page.route("http://pricing.test/**", route => route.fulfill({
      contentType: "text/html", body: '<body style="background:#06101c;color:white"><main id="root" style="max-width:1100px;margin:auto;padding:32px 16px"></main></body>',
    }));
    await page.goto("http://pricing.test/");
    await page.evaluate(() => {
      window.Paddle = {
        Initialized: true, Environment: { set() {} }, Initialize() {}, Update() {}, Checkout: { open() {} },
        PricePreview: async ({ items }) => ({ data: { details: { lineItems: items.map(({ priceId }) => ({ price: { id: priceId }, formattedTotals: { total: priceId === "pri_month" ? "$10.00" : "$80.00" } })) } } }),
      };
    });
    await page.addStyleTag({ content: css.css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await expect(page.getByRole("button", { name: "Try Pro free for 7 days" })).toBeEnabled();
    for (const feature of ["AI Analyst"]) {
      await expect(page.getByTestId("plan-free").getByText(feature, { exact: false })).toHaveCount(0);
      await expect(page.getByTestId("plan-pro").getByText(feature, { exact: false })).toBeVisible();
    }
    await expect(page.getByTestId("plan-free").getByText("Advanced analytics", { exact: false })).toHaveCount(0);
    await expect(page.getByTestId("plan-pro").getByRole("button", { name: "Choose Pro" })).toBeEnabled();
    await expect(page.getByTestId("plan-pro").getByRole("button", { name: "Try Pro free for 7 days" })).toHaveCount(0);
    await expect(page.getByTestId("trial-callout").getByRole("button", { name: "Try Pro free for 7 days" })).toBeEnabled();
    const calloutBox = await page.getByTestId("trial-callout").boundingBox();
    const freeBox = await page.getByTestId("plan-free").boundingBox();
    const proBox = await page.getByTestId("plan-pro").boundingBox();
    assert.ok(calloutBox.y + calloutBox.height < freeBox.y, "Trial must appear before the cards");
    assert.ok(Math.abs(freeBox.height - proBox.height) <= 1, "Cards have equal heights on desktop and mobile");
    if (width === 1280) {
      const discountBox = await page.getByTestId("discount-offer").boundingBox();
      assert.ok(discountBox.y + discountBox.height <= 1100, "Prices, CTAs, compact plan summary and offer fit the desktop viewport");
    }
    for (const plan of ["plan-free", "plan-pro"]) {
      await expect(page.getByTestId(plan).getByText("Simulated market & pending orders", { exact: true })).toBeVisible();
      await expect(page.getByTestId(plan).getByText("Stop-loss, take-profit & risk sizing", { exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("plan-pro").getByText("Advanced analytics & reports", { exact: true })).toBeVisible();
    for (const feature of ["Prop Firm Challenges", "CSV trade exports", "PDF reports & analytics sharing"]) {
      await expect(page.getByTestId("plan-pro").getByText(feature, { exact: false })).toBeHidden();
    }
    await page.getByTestId("plan-pro").getByText("View all Pro features", { exact: false }).click();
    for (const feature of ["Prop Firm Challenges", "CSV trade exports", "PDF reports & analytics sharing"]) {
      await expect(page.getByTestId("plan-pro").getByText(feature, { exact: false })).toBeVisible();
    }
    await expect(page.getByTestId("discount-offer")).toContainText("20% off your first paid month");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async code => { window.copiedCode = code; } } }));
    await page.getByRole("button", { name: "Copy discount code WELCOME20" }).click();
    await expect.poll(() => page.evaluate(() => window.copiedCode)).toBe("WELCOME20");
    await expect(page.getByTestId("terms-month")).toContainText("$10.00 / month");
    assert.equal(await page.getByTestId("plan-pro").getByTestId("terms-month").count(), 0, "Billing disclosure belongs below the cards");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No horizontal overflow");
    await page.screenshot({ path: `.tmp/pricing-plans/${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Yearly", exact: true }).click();
    await expect(page.getByTestId("terms-year")).toContainText("$80.00 / year");
    await page.route("http://pricing.test/api/billing/checkout", route => {
      assert.equal(route.request().postDataJSON().interval, "year", "Trial callout uses the selected billing interval");
      return route.fulfill({ json: { ok: true, transactionId: "txn_fixture", trial: true } });
    });
    await page.evaluate(() => { window.Paddle.Checkout.open = options => { window.openedCheckout = options.transactionId; }; });
    await page.getByTestId("trial-callout").getByRole("button", { name: "Try Pro free for 7 days" }).click();
    await expect.poll(() => page.evaluate(() => window.openedCheckout)).toBe("txn_fixture");
    // Closing the checkout clears its pending state before checking a returning account.
    await page.reload();
    await page.evaluate(() => {
      window.Paddle = {
        Initialized: true, Environment: { set() {} }, Initialize() {}, Update() {}, Checkout: { open() {} },
        PricePreview: async ({ items }) => ({ data: { details: { lineItems: items.map(({ priceId }) => ({ price: { id: priceId }, formattedTotals: { total: priceId === "pri_month" ? "$10.00" : "$80.00" } })) } } }),
      };
    });
    await page.addStyleTag({ content: css.css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.renderPricing(false));
    await expect(page.getByRole("button", { name: "Choose Pro", exact: true })).toBeEnabled();
    await expect(page.getByTestId("trial-callout").getByRole("button", { name: "Try Pro free for 7 days" })).toHaveCount(0);
    await expect(page.getByTestId("trial-callout")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /7-day trial details/ })).toHaveCount(0);
    await expect(page.getByTestId("terms-month")).toContainText("Charged today");
    console.log(`${width}px: trial and returning-customer pricing, plan exclusions, annual billing and layout passed`);
    await page.close();
  }
} finally {
  await browser.close();
}
