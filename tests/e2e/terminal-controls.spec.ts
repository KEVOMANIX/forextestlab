import { expect, test } from "@playwright/test";

/**
 * Header controls added for the trading terminal: the timeframe dropdown with
 * its favourite stars, the "New order" and "Go to" buttons, the chart
 * screenshot, and the eye that masks the account figures.
 */

const START = Date.UTC(2025, 0, 6, 8);
const SESSION_ID = "terminal-controls-e2e";

function candle(index: number) {
  const open = 1.08 + index * 0.00001;
  const close = open + (index % 2 ? -0.00004 : 0.00004);
  return {
    timestamp: START + index * 60_000,
    open: open.toFixed(5),
    high: (Math.max(open, close) + 0.00008).toFixed(5),
    low: (Math.min(open, close) - 0.00008).toFixed(5),
    close: close.toFixed(5),
    volume: "100",
    source: "e2e",
  };
}

/** Six days of 1-minute candles, so day and session boundaries lie ahead. */
const replayCandles = Array.from({ length: 6 * 24 * 60 }, (_, index) =>
  candle(index),
);
const contextCandles = Array.from({ length: 120 }, (_, index) => ({
  ...candle(index),
  timestamp: START - (120 - index) * 60_000,
}));

const state = {
  sessionId: SESSION_ID,
  config: {
    name: "Terminal controls",
    symbols: ["EURUSD"],
    symbol: "EURUSD",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    timeframe: "1m",
    startTime: START,
    endTime: replayCandles.at(-1)!.timestamp,
    startingBalance: "10000.00",
    accountCurrency: "USD",
    spreadPips: "1.0",
    commissionPerLot: "0.00",
    slippagePips: "0.0",
    executionPolicy: "conservative",
    pipSize: "0.0001",
    pricePrecision: 5,
    initialVisibleCount: 60,
  },
  status: "idle",
  speed: 60,
  visibleIndex: 59,
  totalCandles: replayCandles.length,
  balance: "10000.00",
  equity: "10000.00",
  maxEquity: "10000.00",
  maxDrawdown: "0.00",
  maxDrawdownPercent: "0.0",
  currentPrice: replayCandles[59]!.close,
  currentTime: replayCandles[59]!.timestamp,
  openPositions: [],
  pendingOrders: [],
  closedTrades: [],
  bookmarks: [],
  equityCurve: [],
  lockedBeforeIndex: 0,
  dataSource: "e2e",
  demoData: false,
  anonymous: true,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/backtest/trial", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        sessionId: SESSION_ID,
        token: "e2e-token",
        state,
        candles: replayCandles.slice(0, 60),
        replayCandles,
        contextCandles,
      }),
    });
  });
  await page.route("**/api/backtest/sessions/*/action", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, state, newCandle: null }),
    });
  });
  await page.route("**/api/backtest/sessions/*/extend", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, candles: [], hasMore: false }),
    });
  });
  await page.route(`**/api/backtest/sessions/${SESSION_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        state,
        candles: replayCandles.slice(0, 60),
        replayCandles,
        contextCandles,
        notes: "",
      }),
    });
  });

  await page.goto("/app/backtest?trial=instant");
  const closeTour = page.getByRole("button", { name: /Close trading tour/i });
  if (await closeTour.isVisible()) await closeTour.click();
  await expect(
    page.getByRole("img", { name: "Candlestick price chart" }),
  ).toHaveCount(1, { timeout: 30_000 });
});

test("the timeframe bar shows only starred timeframes, and the star controls it", async ({
  page,
}) => {
  // Starred by default.
  await expect(
    page.getByRole("button", { name: "Display 15m candles", exact: true }),
  ).toBeVisible();
  // Not starred, so not on the bar.
  await expect(
    page.getByRole("button", { name: "Display 30m candles", exact: true }),
  ).toHaveCount(0);

  const menu = page.getByRole("menu").filter({ hasText: "Timeframe" });
  await page.getByRole("button", { name: "Choose timeframe" }).click();
  await expect(menu).toBeVisible();
  // Every timeframe the base data can build is listed, spelled out.
  await expect(menu.getByRole("menuitemradio", { name: /^30m\b/ })).toContainText(
    "30 minutes",
  );

  // Starring 30m puts it on the bar.
  await menu
    .getByRole("button", { name: "Pin 30m from the timeframe bar" })
    .click();
  await expect(
    page.getByRole("button", { name: "Display 30m candles", exact: true }),
  ).toBeVisible();

  // Unstarring 15m takes it off.
  await menu
    .getByRole("button", { name: "Unpin 15m from the timeframe bar" })
    .click();
  await expect(
    page.getByRole("button", { name: "Display 15m candles", exact: true }),
  ).toHaveCount(0);

  // The choice survives a reload, because it is a workspace preference.
  await page.reload();
  await expect(
    page.getByRole("img", { name: "Candlestick price chart" }),
  ).toHaveCount(1, { timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Display 30m candles", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Display 15m candles", exact: true }),
  ).toHaveCount(0);
});

test("selecting an unstarred timeframe from the dropdown switches the chart", async ({
  page,
}) => {
  const chart = page.getByRole("img", { name: "Candlestick price chart" });
  const menu = page.getByRole("menu").filter({ hasText: "Timeframe" });
  await page.getByRole("button", { name: "Choose timeframe" }).click();
  await menu.getByRole("menuitemradio", { name: /^45m\b/ }).click();
  await expect(chart).toHaveAttribute("data-axis-timeframe", "45m");
  // Unstarred and active: the trigger names it so the current timeframe is never
  // invisible.
  await expect(page.getByRole("button", { name: "Choose timeframe" })).toContainText(
    "45m",
  );
});

test("the New order button opens the order ticket", async ({ page }) => {
  await page.getByRole("button", { name: /^New order$/ }).click();
  await expect(page.getByTestId("trade-order-panel")).toBeVisible();
});

test("Go to lists forward destinations and fast-forwards the replay", async ({
  page,
}) => {
  await expect(page.locator("p.sr-only").first()).toContainText("Candle 60 of");

  await page.getByRole("button", { name: /^Go to$/ }).click();
  const dialog = page.getByTestId("go-to-modal");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Next day");
  await expect(dialog).toContainText("London");
  await expect(dialog).toContainText("Silver Bullet");
  // A session is one row with an open and a close button, not two rows.
  await expect(
    dialog.getByRole("button", { name: "Go to London open" }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: "Go to London close" }),
  ).toBeEnabled();

  // Nothing is open, so waiting for a close is offered but disabled.
  await expect(
    dialog.getByRole("button", { name: /Any position closes/ }),
  ).toBeDisabled();

  // No completed day has been replayed, so the daily level is unavailable.
  await expect(
    dialog.getByRole("button", { name: "Go to Previous day high" }),
  ).toBeDisabled();

  // Narrow enough to leave the chart readable behind it.
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(44 * 16 + 1);

  await dialog.getByRole("button", { name: /^Next day/ }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  // The chart's zone is the exchange (New York). Replay sits at 08:59 UTC on
  // 6 January, and the next New York midnight is 05:00 UTC on the 7th — 1,201
  // one-minute candles later.
  await expect(page.locator("p.sr-only").first()).toContainText(
    "Candle 1261 of",
    { timeout: 30_000 },
  );
  await expect(page.getByText(/Jumped to Next day/)).toBeVisible();
});

test("Go to a price stops on the candle that trades through it", async ({
  page,
}) => {
  await page.getByRole("button", { name: /^Go to$/ }).click();
  const dialog = page.getByTestId("go-to-modal");
  await dialog.getByRole("button", { name: /^Pick a price/ }).click();
  // Candle 200's high reaches 1.08208; the price field targets it.
  await dialog.getByPlaceholder(/^1\.08/).fill("1.08200");
  await dialog.getByRole("button", { name: "Go", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const chart = page.getByRole("img", { name: "Candlestick price chart" });
  const reached = Number(await chart.getAttribute("data-current-price"));
  expect(reached).toBeGreaterThan(1.0819);
});

test("the eye masks the account figures", async ({ page }) => {
  const equity = page.locator("dt", { hasText: /^Equity$/ }).locator("+ dd");
  await expect(equity).toHaveText("10,000.00");

  await page.getByRole("button", { name: "Hide account figures" }).click();
  await expect(equity).toHaveText("•••");

  await page.reload();
  await expect(
    page.getByRole("img", { name: "Candlestick price chart" }),
  ).toHaveCount(1, { timeout: 30_000 });
  await expect(
    page.locator("dt", { hasText: /^Equity$/ }).locator("+ dd"),
  ).toHaveText("•••");

  await page.getByRole("button", { name: "Show account figures" }).click();
  await expect(
    page.locator("dt", { hasText: /^Equity$/ }).locator("+ dd"),
  ).toHaveText("10,000.00");
});

test("the screenshot button downloads a PNG of the chart", async ({ page }) => {
  await page.getByRole("button", { name: "Screenshot the chart" }).click();
  const menu = page.getByRole("menu").filter({ hasText: "Screenshot" });
  await expect(menu).toBeVisible();

  const download = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "Download" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^EURUSD-1m-\d{4}-\d{2}-\d{2}-\d{4}\.png$/,
  );
  expect(await file.path()).toBeTruthy();
});
