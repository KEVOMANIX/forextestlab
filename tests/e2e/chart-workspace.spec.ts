import { expect, test, type Page } from "@playwright/test";

/**
 * Chart preferences belong to the workspace: a new pane opens as a copy of the
 * one it was split from, and later changes reach every pane at once.
 */

async function openSession(page: Page) {
  const response = await page.request.post("/api/backtest/sessions", {
    data: {
      name: "Workspace session",
      symbols: ["EURUSD"],
      startTime: Date.parse("2024-03-05T00:00:00Z"),
      endTime: Date.parse("2024-03-08T23:59:59Z"),
    },
  });
  const body = await response.json();
  expect(response.ok()).toBe(true);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/app/backtest");
  await page.evaluate(
    ({ sessionId, token }) => {
      window.sessionStorage.setItem(`forextestlab:session:${sessionId}`, token);
      window.localStorage.setItem("forextestlab:onboarding:trading", "done");
      window.localStorage.removeItem(`forextestlab:layout:${sessionId}`);
      window.localStorage.removeItem(`forextestlab:chart-settings:${sessionId}`);
      window.localStorage.removeItem("forextestlab:fav-tools");
      for (const cell of ["cell-1", "cell-2", "cell-3", "cell-4"]) {
        window.localStorage.removeItem(`forextestlab:chart:${sessionId}:${cell}`);
      }
    },
    { sessionId: body.sessionId, token: body.token },
  );
  await page.goto(`/app/backtest?session=${encodeURIComponent(body.sessionId)}`);
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(1, {
    timeout: 30_000,
  });
  await page.waitForTimeout(3000);
}

async function openSettings(page: Page, index = 0) {
  const chart = page.getByRole("img", { name: "Candlestick price chart" }).nth(index);
  const box = (await chart.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.3, { button: "right" });
  const panel = page.getByRole("dialog", { name: "Chart settings" });
  await expect(panel).toBeVisible();
  return panel;
}

test("a new pane inherits the chart it was split from, and later changes reach both", async ({ page }) => {
  await openSession(page);
  const charts = page.getByRole("img", { name: "Candlestick price chart" });

  // Set up the first chart: timeframe, colours, background, a favourite tool.
  await page.getByRole("button", { name: /Display 15m candles/i }).first().click();
  await expect(page.getByText(/Loading 15m chart history/i)).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(1500);

  const panel = await openSettings(page);
  await panel.getByRole("button", { name: /Background #000000/ }).click();
  await panel.getByRole("button", { name: /Up colour #2962ff/ }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Lines & channels/i }).click();
  await page.getByRole("button", { name: /Favorite Horizontal line/i }).click();
  const box = (await charts.first().boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.7);
  await expect(page.getByRole("toolbar", { name: /Favorite tools/i })).toHaveCount(1);

  // Split. The new pane opens on the same timeframe with the same favourites.
  await page.getByRole("button", { name: "Chart layout" }).click();
  await page.getByRole("button", { name: /Two columns/i }).click();
  await expect(charts).toHaveCount(2);
  await page.waitForTimeout(2500);

  const toolbars = page.getByRole("toolbar", { name: "Chart controls" });
  await expect(toolbars.nth(1).getByRole("button", { name: /Display 15m candles/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("toolbar", { name: /Favorite tools/i })).toHaveCount(2);

  // A change made after the split lands on both panes at once.
  const second = await openSettings(page, 0);
  await second.getByRole("switch", { name: "Grid lines" }).click();
  await expect(second.getByRole("switch", { name: "Grid lines" })).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");

  // Both panes agree because they read one shared preference.
  const third = await openSettings(page, 1);
  await expect(third.getByRole("switch", { name: "Grid lines" })).toHaveAttribute("aria-checked", "false");
  await expect(third.getByRole("button", { name: /Up colour #2962ff/ })).toHaveAttribute("aria-pressed", "true");
  await expect(third.getByRole("button", { name: /Background #000000/ })).toHaveAttribute("aria-pressed", "true");
});

test("the session clock ticks in simulated time while the replay runs", async ({ page }) => {
  await openSession(page);
  const clock = page.getByTestId("session-clock");
  await expect(clock).toBeVisible();
  const before = await clock.textContent();

  await page.getByRole("button", { name: /^Play/i }).first().click();
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: /^Pause/i }).first().click();

  const during = await clock.textContent();
  expect(during).not.toBe(before);
  // Seconds are shown, so the readout moves between candles rather than jumping.
  expect(during).toMatch(/\d{2}:\d{2}:\d{2}/);
});
