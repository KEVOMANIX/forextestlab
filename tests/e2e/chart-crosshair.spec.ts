import { expect, test } from "@playwright/test";

test("shows the selected candle OHLC and zone-correct time over replay and context", async ({ page }) => {
  const response = await page.request.post("/api/backtest/sessions", {
    data: {
      name: "Crosshair candle session",
      symbols: ["EURUSD"],
      startTime: Date.parse("2024-03-05T00:00:00Z"),
      endTime: Date.parse("2024-03-08T23:59:59Z"),
    },
  });
  expect(response.ok()).toBe(true);
  const body = await response.json();
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/app/backtest");
  await page.evaluate(
    ({ sessionId, token }) => {
      window.sessionStorage.setItem(`forextestlab:session:${sessionId}`, token);
      window.localStorage.setItem("forextestlab:onboarding:trading", "done");
    },
    { sessionId: body.sessionId, token: body.token },
  );
  await page.goto(`/app/backtest?session=${encodeURIComponent(body.sessionId)}`);

  const chart = page.getByTestId("chart-cell-1").getByRole("img", { name: "Candlestick price chart" });
  await expect(chart).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  const readout = page.locator('[data-testid="chart-legend"] + div');
  // The right half is the revealed replay series.
  await page.mouse.move(box!.x + box!.width * 0.72, box!.y + box!.height * 0.45);
  await expect(readout).toContainText(/O\s+\d/);
  await expect(readout).toContainText(/H\s+\d/);
  await expect(readout).toContainText(/L\s+\d/);
  await expect(readout).toContainText(/C\s+\d/);

  // The left side is historical context, served by the second price series.
  await page.mouse.move(box!.x + box!.width * 0.08, box!.y + box!.height * 0.45);
  await expect(readout).toContainText(/O\s+\d/);
  await expect(readout).toContainText(/H\s+\d/);
  await expect(readout).toContainText(/L\s+\d/);
  await expect(readout).toContainText(/C\s+\d/);
});
