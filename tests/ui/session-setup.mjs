// Isolated browser regression: no login, database, or running server required.
// Run: node tests/ui/session-setup.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "tailwindcss";
import { chromium } from "@playwright/test";

const bundle = await build({
  stdin: {
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { SessionSetup } from './src/components/app/SessionSetup';
      createRoot(document.getElementById('root')).render(<SessionSetup
        onStart={() => {}} busy={false} error={null}
        entitlements={{plan:'pro', maxPairsPerSession:null, maxSessionDays:null}}
      />);`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
});
const css = await postcss([tailwind("./tailwind.config.ts")]).process(
  await readFile("src/app/globals.css", "utf8"), { from: "src/app/globals.css" },
);
const symbols = [
  { symbol: "EURUSD", displayName: "EUR/USD", baseCurrency: "EUR", quoteCurrency: "USD" },
  ...Array.from({ length: 30 }, (_, i) => ({
    symbol: `TEST${i}`, displayName: `Test market ${i}`, baseCurrency: "EUR", quoteCurrency: "USD",
  })),
  { symbol: "DXY", displayName: "US Dollar Index", baseCurrency: "USD", quoteCurrency: "USD" },
].map((symbol) => ({ ...symbol, enabled: true }));

const browser = await chromium.launch();
try {
  for (const width of [1278, 1024, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", (error) => console.error(error));
    await page.route("http://setup.test/**", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/symbols")) return route.fulfill({ json: { ok: true, symbols } });
      if (url.pathname.endsWith("/ranges")) return route.fulfill({ json: {
        ok: true, ranges: [{ startTime: Date.parse("2017-12-01"), endTime: Date.parse("2026-08-21") }],
      } });
      return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    await page.goto("http://setup.test/");
    await page.addStyleTag({ content: css.css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const search = page.getByLabel("Search markets");
    await search.waitFor();
    await page.getByRole("button", { name: "Remove EUR/USD" }).waitFor();
    const row = page.locator("label").filter({ hasText: "US Dollar Index" });
    const column = page.locator("#setup-name").locator("../..");
    for (let attempt = 0; attempt < 3; attempt++) {
      await row.scrollIntoViewIfNeeded();
      await row.click();
      await page.getByRole("button", { name: "Remove US Dollar Index" }).waitFor();
      assert.equal(await column.evaluate((el) => el.scrollTop), 0, "market column must not scroll away");
      assert.equal(await column.evaluate((el) => el.scrollLeft), 0, "market column must not scroll sideways");
      await search.fill("dxy");
      await row.click();
      await row.click();
      assert.equal(await search.inputValue(), "", "selecting a search result clears search");
      await page.getByRole("button", { name: "Remove US Dollar Index" }).click();
    }
    // Keyboard focus must stay anchored to the row as well.
    await search.fill("dxy");
    await row.locator("input").focus();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "Remove US Dollar Index" }).waitFor();
    assert.equal(await column.evaluate((el) => el.scrollTop), 0);
    assert.equal(await column.evaluate((el) => el.scrollLeft), 0);
    console.log(`Session setup selection passed at ${width}px`);
    await page.close();
  }
} finally {
  await browser.close();
}
