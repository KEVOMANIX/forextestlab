import { expect, test, type Page } from "@playwright/test";

/**
 * The chart clock and its time-zone picker. Times shown are the replay's, so a
 * zone change must re-label the axis, the crosshair and the clock together.
 */

async function openSession(page: Page) {
  const response = await page.request.post("/api/backtest/sessions", {
    data: {
      name: "Time zone session",
      symbols: ["EURUSD"],
      startTime: Date.parse("2024-03-05T00:00:00Z"),
      endTime: Date.parse("2024-03-08T23:59:59Z"),
    },
  });
  const body = await response.json();
  expect(response.ok()).toBe(true);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/app/backtest");
  await page.evaluate(
    ({ sessionId, token }) => {
      window.sessionStorage.setItem(`forextestlab:session:${sessionId}`, token);
      window.localStorage.setItem("forextestlab:onboarding:trading", "done");
      window.localStorage.removeItem(`forextestlab:chart:${sessionId}:cell-1`);
    },
    { sessionId: body.sessionId, token: body.token },
  );
  await page.goto(`/app/backtest?session=${encodeURIComponent(body.sessionId)}`);
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(1, {
    timeout: 30_000,
  });
  await page.waitForTimeout(3000);
}

test("the clock re-labels the chart in the chosen zone, and remembers it", async ({ page }) => {
  await openSession(page);
  const clock = page.getByTestId("chart-clock");

  // Defaults to the exchange zone: New York, on standard time in early March.
  await expect(clock).toHaveText(/UTC-5$/);
  const exchangeTime = await clock.textContent();

  await clock.click();
  const list = page.getByRole("listbox", { name: "Chart time zone" });
  await expect(list).toBeVisible();
  // UTC and Exchange are the pinned shortcuts at the top of the list.
  await expect(list.getByRole("option").first()).toHaveText(/UTC/);
  await list.getByRole("option", { name: /Istanbul/ }).click();

  // Same moment, eight hours further east.
  await expect(clock).toHaveText(/UTC\+3$/);
  expect(await clock.textContent()).not.toBe(exchangeTime);

  // The zone belongs to the chart, so it survives a reload.
  await page.reload();
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(1, {
    timeout: 30_000,
  });
  await page.waitForTimeout(3000);
  await expect(page.getByTestId("chart-clock")).toHaveText(/UTC\+3$/);
});

test("each chart in a layout keeps its own zone", async ({ page }) => {
  await openSession(page);
  await page.getByRole("button", { name: "Chart layout" }).click();
  await page.getByRole("button", { name: /Two columns/i }).click();
  const clocks = page.getByTestId("chart-clock");
  await expect(clocks).toHaveCount(2);

  await clocks.nth(1).click();
  await page.getByRole("listbox", { name: "Chart time zone" }).getByRole("option", { name: /Tokyo/ }).click();

  await expect(clocks.nth(0)).toHaveText(/UTC-5$/);
  await expect(clocks.nth(1)).toHaveText(/UTC\+9$/);
});
