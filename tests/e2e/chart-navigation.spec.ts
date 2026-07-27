import { expect, test } from "@playwright/test";

test("1m and 1D charts pan and zoom independently during replay", async ({
  page,
}) => {
  test.setTimeout(45_000);
  const start = Date.UTC(2025, 0, 6, 8);
  const candle = (index: number) => {
    const open = 1.08 + index * 0.00001;
    const close = open + (index % 2 ? -0.00004 : 0.00004);
    return {
      timestamp: start + index * 60_000,
      open: open.toFixed(5),
      high: (Math.max(open, close) + 0.00008).toFixed(5),
      low: (Math.min(open, close) - 0.00008).toFixed(5),
      close: close.toFixed(5),
      volume: "100",
      source: "e2e",
    };
  };
  const replayCandles = Array.from({ length: 720 }, (_, index) =>
    candle(index),
  );
  const contextCandles = Array.from({ length: 120 }, (_, index) => ({
    ...candle(index),
    timestamp: start - (120 - index) * 60_000,
  }));
  const dailyContextCandles = Array.from({ length: 120 }, (_, index) => ({
    ...candle(index),
    timestamp: start - (120 - index) * 24 * 60 * 60_000,
  }));
  const sessionId = "chart-navigation-e2e";
  const state = {
    sessionId,
    config: {
      name: "Independent chart navigation",
      symbols: ["EURUSD"],
      symbol: "EURUSD",
      baseCurrency: "EUR",
      quoteCurrency: "USD",
      timeframe: "1m",
      startTime: start,
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
    closedTrades: [],
    equityCurve: [],
    lockedBeforeIndex: 0,
    dataSource: "e2e",
    demoData: false,
    anonymous: true,
  };

  await page.route("**/api/backtest/trial", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        sessionId,
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
  await page.route("**/api/backtest/sessions/*/context?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        candles: dailyContextCandles,
        hasMore: false,
        timeframe: "1D",
      }),
    });
  });
  await page.route(`**/api/backtest/sessions/${sessionId}`, async (route) => {
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
  const closeTour = page.getByRole("button", {
    name: /Close trading tour/i,
  });
  if (await closeTour.isVisible()) await closeTour.click();
  await expect(
    page.getByRole("img", { name: "Candlestick price chart" }),
  ).toHaveCount(1, { timeout: 30_000 });

  await page.getByRole("button", { name: "Chart layout" }).click();
  await page.getByRole("button", { name: /Two columns/i }).click();

  const firstCell = page.getByTestId("chart-cell-1");
  const secondCell = page.getByTestId("chart-cell-2");
  await expect(firstCell).toBeVisible();
  await expect(secondCell).toBeVisible();

  // The selected replay step advances that many source minutes and the price
  // delivered to the chart follows the newly revealed candle.
  const firstChart = firstCell.getByRole("img", {
    name: "Candlestick price chart",
  });
  await page.getByLabel("Replay step").selectOption("30");
  await page.getByRole("button", { name: "Next candle" }).click();
  await expect(page.locator("p.sr-only")).toContainText("Candle 90 of");
  await expect(firstChart).toHaveAttribute(
    "data-current-price",
    String(Number(replayCandles[89]!.close)),
  );

  await secondCell
    .getByRole("button", { name: "Display 1D candles" })
    .click();
  await expect(secondCell.getByText("Loading 1D chart history…")).toBeHidden({
    timeout: 30_000,
  });
  await page.waitForTimeout(400);
  const dailySpan = Number(
    await secondCell
      .getByRole("img", { name: "Candlestick price chart" })
      .getAttribute("data-visible-logical-span"),
  );
  expect(dailySpan).toBeGreaterThan(20);

  await page.getByLabel("Replay step").selectOption("1");
  const speed = page.getByLabel("Replay speed");
  await speed.fill((await speed.getAttribute("max")) ?? "0");
  await page.getByRole("button", { name: "Play replay" }).click();
  await expect(
    page.getByRole("button", { name: "Pause replay" }),
  ).toBeVisible();
  const priceAtPlay = await firstChart.getAttribute("data-current-price");
  await page.waitForTimeout(400);
  expect(await firstChart.getAttribute("data-current-price")).not.toBe(
    priceAtPlay,
  );

  const box = await firstChart.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, -700);
  await page.waitForTimeout(500);

  const firstRange = await page.evaluate((id) => {
    const raw = window.localStorage.getItem(
      `forextestlab:chart:${id}:cell-1`,
    );
    return raw ? (JSON.parse(raw).range ?? null) : null;
  }, sessionId);
  expect(firstRange).not.toBeNull();

  await page.waitForTimeout(1_000);
  const firstRangeLater = await page.evaluate((id) => {
    const raw = window.localStorage.getItem(
      `forextestlab:chart:${id}:cell-1`,
    );
    return raw ? (JSON.parse(raw).range ?? null) : null;
  }, sessionId);
  expect(firstRangeLater).toEqual(firstRange);
});
