import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end coverage of the public backtesting workflow. Runs without any
 * login and without an external market-data API (seeded demo data).
 */

async function startSession(page: Page) {
  await page.goto("/app/backtest");
  // Wait for the setup form and its prefilled symbol/dates.
  await expect(page.getByRole("heading", { name: /Start a backtest session/i })).toBeVisible();

  // (5) Assert future candles are NOT sent on session creation.
  const createResponse = page.waitForResponse(
    (r) => r.url().includes("/api/backtest/sessions") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Start session/i }).click();
  const res = await createResponse;
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(Array.isArray(body.candles)).toBe(true);
  // Only the initial visible window is returned, never the full series.
  expect(body.candles.length).toBeLessThanOrEqual(60);
  expect(body.candles.length).toBeLessThan(body.state.totalCandles);
}

test("completes a full public backtest workflow without login", async ({ page }) => {
  test.setTimeout(60_000);
  // (1)(2)(3)(4) open + configure + start
  await startSession(page);

  // (3) initial candles + workspace visible
  await expect(page.getByRole("img", { name: /Candlestick price chart/i })).toBeVisible();
  const counter = page.getByText(/Candle \d+ \/ \d+/);
  await expect(counter).toBeVisible();
  const before = await counter.textContent();

  // (4) advance the replay a few candles
  const next = page.getByRole("button", { name: /Next candle/i });
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/action") && r.request().method() === "POST"),
    next.click(),
  ]);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/action") && r.request().method() === "POST"),
    next.click(),
  ]);
  await expect(counter).not.toHaveText(before ?? "");

  // (6) place a Buy trade with (7) stop-loss and take-profit
  await page.getByLabel(/Account risk percent/i).fill("1");
  await page.getByLabel(/Stop-loss price/i).fill("1.07000");
  await page.getByLabel(/Take-profit price/i).fill("1.12000");
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/action") && r.request().method() === "POST"),
    page.getByRole("button", { name: "Buy", exact: true }).click(),
  ]);
  await expect(page.getByText(/LONG/)).toBeVisible();

  // (8) advance more candles
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/action") && r.request().method() === "POST"),
    next.click(),
  ]);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/action") && r.request().method() === "POST"),
    next.click(),
  ]);

  // (9) close the position manually
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/action") && r.request().method() === "POST"),
    page.getByRole("button", { name: /Close position/i }).click(),
  ]);

  // (10)(11) balance + statistics update; trade recorded
  await page.getByRole("tab", { name: /Statistics/i }).click();
  await expect(page.getByText(/Total trades/i)).toBeVisible();
  await page.getByRole("tab", { name: /^Trades/ }).click();
  await expect(page.getByRole("cell", { name: /Long|Short/ }).first()).toBeVisible();

  // Anonymous demonstrations are temporary and do not expose saved results.
  await expect(page.getByText(/temporary demonstration/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Create a free account/i })).toBeVisible();
});

test("restarts a session", async ({ page }) => {
  await startSession(page);
  const next = page.getByRole("button", { name: /Next candle/i });
  await next.click();
  await next.click();
  await page.getByRole("button", { name: /Restart session/i }).click();
  await expect(page.getByText(/Candle \d+ \/ \d+/)).toBeVisible();
});

test("mobile navigation and workflow", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /ForexTestLab backtester/i })).toBeVisible();
  // Open the backtester from the app home on a mobile viewport.
  await page.getByRole("link", { name: /Open the backtester/i }).click();
  await expect(page.getByRole("heading", { name: /Start a backtest session/i })).toBeVisible();
});
