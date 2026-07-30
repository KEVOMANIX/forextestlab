import { expect, test, type Page } from "@playwright/test";

/**
 * The workspace clock in the middle of the status bar and its time-zone picker.
 * It runs on real time; picking a zone re-labels every chart and both clocks.
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
      window.localStorage.removeItem(`forextestlab:chart-settings:${sessionId}`);
    },
    { sessionId: body.sessionId, token: body.token },
  );
  await page.goto(`/app/backtest?session=${encodeURIComponent(body.sessionId)}`);
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(1, {
    timeout: 30_000,
  });
  await page.waitForTimeout(3000);
}

test("the picker re-labels the chart in the chosen zone, and remembers it", async ({ page }) => {
  await openSession(page);
  const zone = page.getByTestId("chart-timezone");

  // Defaults to the exchange zone: New York.
  await expect(zone).toHaveText(/UTC-[45]$/);
  const exchangeOffset = await zone.textContent();

  await zone.click();
  const list = page.getByRole("listbox", { name: "Chart time zone" });
  await expect(list).toBeVisible();
  // UTC and Exchange are the pinned shortcuts at the top of the list.
  await expect(list.getByRole("option").first()).toHaveText(/UTC/);
  // Zones the first hand-written list missed are all present now.
  await list.getByLabel("Search time zones").fill("Nairobi");
  await expect(list.getByRole("option")).toHaveCount(1);
  await list.getByLabel("Search time zones").fill("Istanbul");
  await list.getByRole("option", { name: /Istanbul/ }).click();

  // Same moment, further east.
  await expect(zone).toHaveText(/UTC\+3$/);
  expect(await zone.textContent()).not.toBe(exchangeOffset);

  // The zone belongs to the chart, so it survives a reload.
  await page.reload();
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(1, {
    timeout: 30_000,
  });
  await page.waitForTimeout(3000);
  await expect(page.getByTestId("chart-timezone")).toHaveText(/UTC\+3$/);
});

test("one zone serves the workspace, and the session clock agrees with it", async ({ page }) => {
  await openSession(page);
  await page.getByRole("button", { name: "Chart layout" }).click();
  await page.getByRole("button", { name: /Two columns/i }).click();
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(2);

  // The zone belongs to the workspace, so the picker sits in the focused chart's
  // axis corner — one of them per layout, not one per pane.
  const zone = page.getByTestId("chart-timezone");
  await expect(zone).toHaveCount(1);

  await zone.click();
  const list = page.getByRole("listbox", { name: "Chart time zone" });
  // The catalogue is the runtime's full zone database, so search to reach one.
  await list.getByLabel("Search time zones").fill("Tokyo");
  await list.getByRole("option", { name: /Tokyo/ }).click();

  await expect(zone).toHaveText(/UTC\+9$/);
  // The simulated clock reads the same zone, so the app never shows two zones.
  await expect(page.getByTestId("session-clock")).toContainText("UTC+9");
});
