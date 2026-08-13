import { expect, test } from "@playwright/test";

test("public application and authentication entry points are available", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/ForexTestLab/i);
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Build confidence. Trade with evidence." })).toBeVisible();
  await page.goto("/support");
  await expect(page.getByRole("heading", { name: "Help when you need it." })).toBeVisible();
});

test("deployment, market data, and calendar APIs return valid contracts", async ({ request }) => {
  const version = await request.get("/api/version");
  expect(version.ok()).toBeTruthy();
  expect((await version.json()).version).toBeTruthy();

  const symbols = await request.get("/api/backtest/symbols");
  expect(symbols.ok()).toBeTruthy();
  const symbolBody = await symbols.json();
  expect(symbolBody.ok).toBe(true);
  expect(symbolBody.symbols.filter((item: { enabled: boolean }) => item.enabled).length).toBeGreaterThanOrEqual(8);

  const from = Date.now() - 7 * 86_400_000;
  const to = Date.now() + 30 * 86_400_000;
  const calendar = await request.get(`/api/calendar/events?from=${from}&to=${to}&currencies=USD,EUR&importance=high`);
  expect(calendar.ok()).toBeTruthy();
  const calendarBody = await calendar.json();
  expect(calendarBody.ok).toBe(true);
  expect(Array.isArray(calendarBody.events)).toBe(true);
});

test("security and cache headers are present", async ({ request }) => {
  const response = await request.get("/api/version");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(response.headers()["cache-control"]).toContain("no-store");
});
