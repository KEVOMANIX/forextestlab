import { expect, test } from "@playwright/test";

/**
 * The consolidated settings dialog, the crosshair default, and the compact size
 * popover on the replay toolbox's Buy/Sell buttons.
 */

const START = Date.UTC(2025, 0, 6, 8);
const SESSION_ID = "terminal-settings-e2e";

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

const replayCandles = Array.from({ length: 720 }, (_, index) => candle(index));
const contextCandles = Array.from({ length: 120 }, (_, index) => ({
  ...candle(index),
  timestamp: START - (120 - index) * 60_000,
}));

const state = {
  sessionId: SESSION_ID,
  config: {
    name: "Terminal settings",
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
  await page.goto("/app/backtest?trial=instant");
  const closeTour = page.getByRole("button", { name: /Close trading tour/i });
  if (await closeTour.isVisible()) await closeTour.click();
  await expect(
    page.getByRole("img", { name: "Candlestick price chart" }),
  ).toHaveCount(1, { timeout: 30_000 });
});

test("the chart opens in crosshair mode", async ({ page }) => {
  await expect(
    page.getByRole("img", { name: "Candlestick price chart" }),
  ).toHaveAttribute("data-cursor-mode", "crosshair");
  await expect(
    page.getByRole("button", { name: /^Cursor mode: Crosshair/ }),
  ).toBeVisible();
});

test("one settings dialog holds the chart, trading, risk and shortcut sections", async ({
  page,
}) => {
  // The header control is a gear, and there is only one of it.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Chart settings" });
  await expect(dialog).toBeVisible();

  for (const section of [
    "Symbol",
    "Scales & lines",
    "Display",
    "Trading",
    "Risk limits",
    "Shortcuts",
  ]) {
    await expect(dialog.getByRole("button", { name: section, exact: true })).toBeVisible();
  }

  // Risk limits came from the panel that used to live behind its own icon.
  await dialog.getByRole("button", { name: "Risk limits", exact: true }).click();
  await expect(dialog.getByText("Daily loss limit")).toBeVisible();
  await expect(dialog.getByText("Session profit goal")).toBeVisible();

  // So did the shortcuts.
  await dialog.getByRole("button", { name: "Shortcuts", exact: true }).click();
  await expect(dialog.getByText("Play / pause")).toBeVisible();

  // One-click trading now appears once, under Trading.
  await dialog.getByRole("button", { name: "Trading", exact: true }).click();
  await expect(
    dialog.getByRole("switch", { name: "One-click trading" }),
  ).toHaveCount(1);

  // Display carries the session-level toggles.
  await dialog.getByRole("button", { name: "Display", exact: true }).click();
  await expect(
    dialog.getByRole("switch", { name: "Hide account figures" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("switch", { name: "Distraction-free chart" }),
  ).toBeVisible();
});

test("a setting changed in the dialog reaches the chart", async ({ page }) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Chart settings" });
  await dialog.getByRole("button", { name: "Display", exact: true }).click();
  await dialog.getByRole("switch", { name: "Hide account figures" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();

  await expect(
    page.locator("dt", { hasText: /^Equity$/ }).locator("+ dd"),
  ).toHaveText("•••");
});

test("the replay toolbox's Buy/Sell buttons reveal a compact size selector", async ({
  page,
}) => {
  const toolbox = page.getByTestId("replay-toolbox");
  const popover = toolbox.getByTestId("quick-lot-size");
  // Present in the DOM but hidden until the buttons are reached for, so it can
  // fade in rather than reflow the toolbox.
  await expect(popover).toHaveCount(1);

  await toolbox.getByRole("button", { name: "Quick Buy" }).hover();
  const size = popover.getByRole("textbox", { name: "Order size in lots" });
  await expect(size).toBeVisible();
  await expect(size).toHaveValue("0.10");

  // The panel is small: it fits the toolbox rather than covering the chart.
  const box = await popover.boundingBox();
  expect(box!.width).toBeLessThan(200);

  // A preset here is the size the ticket will open with — one shared value.
  await popover.getByRole("button", { name: "0.50", exact: true }).click();
  await expect(size).toHaveValue("0.50");
  await toolbox.getByRole("button", { name: "Quick Buy" }).click();
  await expect(
    page.getByTestId("trade-order-panel").getByLabel("Position size in lots"),
  ).toHaveValue("0.50");
});
