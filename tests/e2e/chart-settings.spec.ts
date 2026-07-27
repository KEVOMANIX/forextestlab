import { expect, test, type Page } from "@playwright/test";

/**
 * Per-chart settings, opened by right-clicking empty chart space.
 */

async function openSession(page: Page) {
  const response = await page.request.post("/api/backtest/sessions", {
    data: {
      name: "Chart settings session",
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
      window.localStorage.removeItem(`forextestlab:layout:${sessionId}`);
      window.localStorage.removeItem(`forextestlab:chart:${sessionId}:cell-1`);
    },
    { sessionId: body.sessionId, token: body.token },
  );
  await page.goto(`/app/backtest?session=${encodeURIComponent(body.sessionId)}`);
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(1, {
    timeout: 30_000,
  });
  await page.waitForTimeout(3000);
  return body.sessionId as string;
}

/** Right-click chart space, clear of the floating replay toolbar. */
async function openSettings(page: Page) {
  const chart = page.getByRole("img", { name: "Candlestick price chart" }).first();
  const box = (await chart.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.28, { button: "right" });
  const panel = page.getByRole("dialog", { name: "Chart settings" });
  await expect(panel).toBeVisible();
  return panel;
}

test("right-click settings toggle what the chart draws, and survive a reload", async ({ page }) => {
  await openSession(page);

  // An open position gives the position-line toggle something to act on.
  await page.getByRole("button", { name: /^Buy/ }).click();
  await expect(page.getByTestId("position-entry-line")).toHaveCount(1);
  await expect(page.getByTestId("stop-loss-line")).toHaveCount(1);

  const panel = await openSettings(page);
  await panel.getByRole("switch", { name: "Open position lines" }).click();
  await expect(page.getByTestId("position-entry-line")).toHaveCount(0);
  await expect(page.getByTestId("stop-loss-line")).toHaveCount(0);
  await expect(panel.getByRole("switch", { name: "Open position lines" })).toHaveAttribute(
    "aria-checked",
    "false",
  );

  // Settings belong to the chart, so they outlive a page load. Wait for the
  // trade to persist first, or the reloaded session has no position to draw.
  await expect(page.getByText(/^Saved$/)).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Chart settings" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(1, {
    timeout: 30_000,
  });
  await page.waitForTimeout(3000);
  // The reloaded session still holds the position; only its lines are hidden.
  await expect(page.locator("p.sr-only")).toContainText("1 open position");
  await expect(page.getByTestId("position-entry-line")).toHaveCount(0);

  // Reset puts everything back.
  const reopened = await openSettings(page);
  await reopened.getByRole("button", { name: /Reset to defaults/i }).click();
  await expect(page.getByTestId("position-entry-line")).toHaveCount(1);
});

test("a right-click on a drawing belongs to the drawing, not the chart", async ({ page }) => {
  await openSession(page);
  const chart = page.getByRole("img", { name: "Candlestick price chart" }).first();
  const box = (await chart.boundingBox())!;

  // Draw a horizontal line, then right-click it.
  await page.getByRole("button", { name: /Lines & channels/i }).click();
  await page.getByRole("button", { name: /^Horizontal line$/i }).click();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4);
  await page.waitForTimeout(500);
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.4, { button: "right" });
  await page.waitForTimeout(400);
  await expect(page.getByRole("dialog", { name: "Chart settings" })).toHaveCount(0);
});
