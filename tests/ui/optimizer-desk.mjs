// Real optimizer components and report math; browser requests use a deterministic fixture.
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
      import { ExitOptimizerWorkspace } from './src/components/app/ExitOptimizerWorkspace';
      import { TradeFocusProvider } from './src/components/app/TradeFocusContext';
      import { buildOptimizerReport } from './src/lib/backtest/exit-optimizer';
      const trades = (kind) => Array.from({length:60},(_,i)=>{
        const actualR=i%5===0?-1:0.4;
        const optimizedR=kind==='target'?(i%5===0?-1:0.8):kind==='trail'?(i%5===0?-0.3:0.35):actualR*0.5;
        return {tradeId:'t'+i,tradeNumber:i+1,entryTime:Date.UTC(2025,0,1,8)+i*86400000,symbol:'EURUSD',direction:i%2?'short':'long',actualR,optimizedR,deltaR:optimizedR-actualR,money:optimizedR*100,reason:'test fixture'};
      });
      window.optimizerFixture=buildOptimizerReport([
        {rule:{id:'target-2',label:'Fixed 2R target',kind:'fixed-target',targetR:2},trades:trades('target')},
        {rule:{id:'trail-1-0.5',label:'Trail 0.5R after +1R',kind:'trailing',triggerR:1,distanceR:0.5},trades:trades('trail')},
        {rule:{id:'hold-4h',label:'Exit after 4 hours',kind:'max-hold',milliseconds:14400000},trades:trades('bad')},
        ...[1,2,8].map(hours=>({rule:{id:'hold-'+hours+'h',label:'Exit after '+hours+' hours',kind:'max-hold',milliseconds:hours*3600000},trades:trades('bad')}))
      ]);
      const root=createRoot(document.getElementById('root'));
      window.mountOptimizer=(sessionId='fixture',status='finished')=>root.render(<TradeFocusProvider value={{tradeCount:60,focusTrade:n=>window.focusedTrade=n}}><ExitOptimizerWorkspace sessionId={sessionId} status={status}/></TradeFocusProvider>);
      window.mountOptimizer();`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  outfile: "optimizer-fixture.js", bundle: true, write: false, platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
});
const js = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
const modules = bundle.outputFiles.find(file => file.path.endsWith(".css")).text;
const css = await postcss([tailwind("./tailwind.config.ts")]).process(await readFile("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
await mkdir(".tmp/optimizer-desk", { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://optimizer.test/**", route => route.fulfill({ contentType: "text/html", body: '<body class="app-shell" style="background:var(--app-bg);color:var(--app-text)"><div id="root" style="max-width:1300px;margin:auto;padding:24px"></div></body>' }));
    await page.goto("http://optimizer.test/");
    await page.addStyleTag({ content: css.css + modules });
    await page.addScriptTag({ content: js });
    const phases = page.getByRole("navigation", { name: "Optimizer phases" });
    await expect(phases.getByRole("button", { name: /Context/ })).toBeDisabled();
    await expect(page.getByText("22 variations selected", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Fixed targets/ }).click();
    await expect(page.getByText("16 variations selected", { exact: true })).toBeVisible();
    await phases.getByRole("button", { name: /Combinations/ }).click();
    await page.getByRole("button", { name: /Rule combinations Break even/ }).click();
    await expect(page.getByText("12 variations selected", { exact: true })).toBeVisible();
    await phases.getByRole("button", { name: /Rules/ }).click();
    let reject = false, noWinner = false;
    const fixture = await page.evaluate(() => window.optimizerFixture);
    await page.route("http://optimizer.test/api/backtest/sessions/*/exit-optimizer", route => {
      const ids = route.request().postDataJSON().ruleIds;
      assert.equal(ids.length, 12);
      assert.ok(ids.every(id => !id.startsWith("target-") && !id.startsWith("combo-")));
      if (reject) return route.fulfill({ status: 500, json: { error: "Fixture request failed" } });
      const optimizer = noWinner ? { ...fixture, rules: fixture.rules.map(row => ({ ...row, validationPassed: false })), bestRuleId: null } : fixture;
      return route.fulfill({ json: { optimizer } });
    });
    await page.screenshot({ path: `.tmp/optimizer-desk/setup-${width}.png`, fullPage: true });
    // Hold a real browser ReadableStream open to inspect intermediate progress.
    await page.evaluate(() => {
      window.originalFetch = window.fetch;
      window.fetch = async () => new Response(new ReadableStream({ start(controller) {
        const encoder = new TextEncoder();
        window.sendOptimizerEvent = event => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        window.finishOptimizerStream = () => { window.sendOptimizerEvent({ type: "result", optimizer: window.optimizerFixture }); controller.close(); window.fetch = window.originalFetch; };
        window.sendOptimizerEvent({ type: "progress", progress: { stage: "loading", message: "Loaded EURUSD · 12,000 candles", completed: 1, total: 2, symbol: "EURUSD" } });
      } }), { headers: { "Content-Type": "application/x-ndjson" } });
    });
    await page.getByRole("button", { name: "Run optimizer" }).click();
    await expect(page.getByTestId("optimizer-progress")).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    await page.evaluate(() => window.sendOptimizerEvent({ type: "progress", progress: { stage: "replaying", message: "Testing Fixed 2R target", completed: 45, total: 120, symbol: "EURUSD", rule: "Fixed 2R target", tradeNumber: 23 } }));
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "37");
    await expect(page.getByText("45 / 120 rule / trade tests", { exact: true })).toBeVisible();
    await page.screenshot({ path: `.tmp/optimizer-desk/progress-${width}.png`, fullPage: true });
    await page.evaluate(() => window.sendOptimizerEvent({ type: "progress", progress: { stage: "validating", message: "Comparing discovery and later-trade validation results" } }));
    await expect(page.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    await page.evaluate(() => window.finishOptimizerStream());
    const result = page.getByTestId("optimizer-results");
    await expect(result.getByRole("heading", { name: "Fixed 2R target", exact: true })).toBeVisible();
    await expect(result.getByRole("img", { name: /Cumulative R over 60 trades/ })).toBeVisible();
    await result.getByRole("button", { name: "Show all 6 candidates" }).click();
    await expect(result.locator("table").first().locator("tbody tr")).toHaveCount(7);
    await result.getByRole("button", { name: "Show fewer candidates" }).click();
    await page.screenshot({ path: `.tmp/optimizer-desk/results-${width}.png`, fullPage: true });
    await page.locator("body").evaluate(el => el.classList.add("light"));
    await page.screenshot({ path: `.tmp/optimizer-desk/results-light-${width}.png`, fullPage: true });
    await page.locator("body").evaluate(el => el.classList.remove("light"));
    await page.getByLabel("Optimization objective").selectOption("drawdown");
    await expect(result.getByRole("heading", { name: "Trail 0.5R after +1R", exact: true })).toBeVisible();
    await result.getByText("All candidate metrics", { exact: true }).click();
    await expect(result.getByRole("columnheader", { name: "Win rate", exact: true })).toBeVisible();
    await phases.getByRole("button", { name: /Context/ }).click();
    await expect(page.getByRole("heading", { name: "Where this exit works best" })).toBeVisible();
    await phases.getByRole("button", { name: /Robustness/ }).click();
    await expect(page.getByRole("heading", { name: "Is the improvement robust?" })).toBeVisible();
    await phases.getByRole("button", { name: /Review/ }).click();
    await page.getByRole("button", { name: "#1", exact: true }).click();
    assert.equal(await page.evaluate(() => window.focusedTrade), 1);
    await phases.getByRole("button", { name: /Deploy/ }).click();
    await page.getByRole("button", { name: "Save as exit plan" }).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("forextestlab:saved-exit-plan")).rule.id), "trail-1-0.5");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export plan" }).click();
    assert.equal((await download).suggestedFilename(), "forextestlab-exit-plan.json");
    await page.getByRole("button", { name: "Configure", exact: true }).click();
    reject = true;
    await page.getByRole("button", { name: "Run optimizer" }).click();
    await expect(page.getByRole("alert")).toContainText("Fixture request failed");
    reject = false; noWinner = true;
    await page.getByRole("button", { name: "Run optimizer" }).click();
    await expect(page.getByRole("heading", { name: "No validated recommendation" })).toBeVisible();
    await expect(phases.getByRole("button", { name: /Deploy/ })).toBeDisabled();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Page must not overflow horizontally");
    await page.evaluate(() => window.mountOptimizer("another-session", "running"));
    await expect(page.getByTestId("optimizer-results")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Run optimizer" })).toBeDisabled();
    assert.deepEqual(errors, []);
    console.log(`${width}px: rule selection, API payload, objective ranking, phases, trade focus, save/export, errors and session reset passed`);
    await page.close();
  }
} finally { await browser.close(); }
