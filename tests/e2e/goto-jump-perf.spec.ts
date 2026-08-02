import { expect, test } from "@playwright/test";

/**
 * A "Go to" jump has to feel like a jump.
 *
 * It reveals every candle between here and the target so fills stay honest, so
 * the whole path — engine, state publication, chart — is on the clock. Two
 * regressions this guards against, both measured rather than guessed:
 *
 * - Recording an equity point per candle, which bloated every state publication,
 *   checkpoint payload and statistics pass.
 * - Appending the arriving candles to the chart one `update()` at a time, which
 *   is the right call for a live tick and cost over two seconds for a day of
 *   1-minute bars.
 */

const START = Date.UTC(2025, 0, 6, 8);
const SESSION_ID = "goto-jump-perf-e2e";
/** 08:59 UTC on the 6th to the next New York midnight, in 1-minute candles. */
const EXPECTED_CANDLES = 1_201;

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

const replayCandles = Array.from({ length: 10 * 24 * 60 }, (_, index) =>
  candle(index),
);
const contextCandles = Array.from({ length: 120 }, (_, index) => ({
  ...candle(index),
  timestamp: START - (120 - index) * 60_000,
}));

const state = {
  sessionId: SESSION_ID,
  config: {
    name: "Jump performance",
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

test("a next-day jump lands quickly and in one chart update", async ({ page }) => {
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

  // Measure only the jump, from a chart that has settled.
  await page.evaluate(() => {
    (
      window as unknown as { __FOREXTESTLAB_REPLAY_METRICS__?: unknown }
    ).__FOREXTESTLAB_REPLAY_METRICS__ = {};
  });

  await page.getByRole("button", { name: /^Go to$/ }).click();
  const dialog = page.getByTestId("go-to-modal");
  await expect(dialog).toBeVisible();

  const startedAt = Date.now();
  await dialog.getByRole("button", { name: /^Next day/ }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect(page.locator("p.sr-only").first()).toContainText(
    `Candle ${59 + EXPECTED_CANDLES + 1} of`,
    { timeout: 60_000 },
  );
  const elapsed = Date.now() - startedAt;

  const slowestChartUpdate = await page.evaluate(() => {
    const store =
      (
        window as unknown as {
          __FOREXTESTLAB_REPLAY_METRICS__?: Record<string, { maxMs: number }>;
        }
      ).__FOREXTESTLAB_REPLAY_METRICS__ ?? {};
    return store["chart-update"]?.maxMs ?? 0;
  });

  // Generous against a loaded CI box; both were far past these before the fix
  // (2.4s end to end, a single 2.1s chart update).
  expect(elapsed).toBeLessThan(2_000);
  expect(slowestChartUpdate).toBeLessThan(500);
});
