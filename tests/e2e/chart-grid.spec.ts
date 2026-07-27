import { expect, test, type Page } from "@playwright/test";

/**
 * Multi-chart workspace: layouts, per-cell toolbars, and the reference cell's
 * clock-gated data. Runs without login on seeded demo data.
 */

async function openMultiSymbolSession(page: Page) {
  const response = await page.request.post("/api/backtest/sessions", {
    data: {
      name: "Grid session",
      symbols: ["EURUSD", "GBPUSD"],
      startTime: Date.parse("2024-03-05T00:00:00Z"),
      endTime: Date.parse("2024-03-08T23:59:59Z"),
    },
  });
  const body = await response.json();
  expect(response.ok()).toBe(true);

  await page.goto("/app/backtest");
  await page.evaluate(
    ({ sessionId, token }) => {
      window.sessionStorage.setItem(`forextestlab:session:${sessionId}`, token);
      // Start every run from the default single-chart layout.
      window.localStorage.removeItem(`forextestlab:layout:${sessionId}`);
    },
    { sessionId: body.sessionId, token: body.token },
  );
  await page.goto(`/app/backtest?session=${encodeURIComponent(body.sessionId)}`);
  const closeTour = page.getByRole("button", { name: /Close trading tour/i });
  if (await closeTour.isVisible()) await closeTour.click();
  // The chart is a client-only dynamic import; wait for it before driving it.
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(1, {
    timeout: 30_000,
  });
  return body.sessionId as string;
}

async function chooseLayout(page: Page, label: RegExp) {
  await page.getByRole("button", { name: "Chart layout" }).click();
  await page.getByRole("button", { name: label }).click();
}

test("splits into an independent multi-chart layout and back", async ({ page }) => {
  await openMultiSymbolSession(page);

  // Default is a single chart driving the top bar's toolbar.
  await expect(page.getByRole("toolbar", { name: "Chart controls" })).toHaveCount(1);

  await page.getByRole("button", { name: "Chart layout" }).click();
  const layoutMenu = page.getByTestId("chart-layout-menu");
  await expect(layoutMenu.getByText("Sync across charts")).toHaveCount(0);
  await expect(layoutMenu.getByRole("button", { name: "Crosshair" })).toHaveCount(0);
  await expect(layoutMenu.getByRole("button", { name: "Time" })).toHaveCount(0);
  await layoutMenu.getByRole("button", { name: /Two columns/i }).click();
  // Each cell owns its own toolbar once the workspace is split.
  await expect(page.getByRole("toolbar", { name: "Chart controls" })).toHaveCount(2);
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(2);

  await chooseLayout(page, /Four charts/i);
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(4);

  await chooseLayout(page, /Single chart/i);
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(1);
  await expect(page.getByRole("toolbar", { name: "Chart controls" })).toHaveCount(1);
});

test("a reference cell loads its pair once and keeps the traded cell tradable", async ({ page }) => {
  await openMultiSymbolSession(page);
  await chooseLayout(page, /Two columns/i);

  const charts = page.getByRole("img", { name: "Candlestick price chart" });
  await expect(charts).toHaveCount(2);

  // Focus the second cell, then point it at the other pair from the top bar.
  const pairRequest = page.waitForRequest((request) => request.url().includes("/pair?"));
  // Click past the cell's drawing rail so the chart itself takes focus.
  await charts.nth(1).click({ position: { x: 220, y: 120 } });
  await page.getByRole("button", { expanded: false }).filter({ hasText: /EURUSD/ }).first().click();
  await page.getByRole("menuitem", { name: /GBPUSD/i }).click();

  // The whole series is fetched once; playback then reveals it locally.
  const request = await pairRequest;
  expect(request.url()).toContain("full=1");
  await expect(page.getByText(/GBPUSD · reference/)).toBeVisible();

  // Trading follows focus: the reference cell has no order ticket at all.
  await expect(page.getByRole("button", { name: /^Buy/ })).toHaveCount(0);

  // Focus the traded cell again and open a position: only that cell draws it.
  await charts.nth(0).click({ position: { x: 220, y: 120 } });
  await page.getByRole("button", { name: /^Buy/ }).click();
  await expect(page.getByTestId("position-entry-line")).toHaveCount(1);
});
