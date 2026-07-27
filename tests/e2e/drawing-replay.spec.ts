import { expect, test } from "@playwright/test";

test("session drawing stays painted while replay advances", async ({ page }) => {
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
  const replayCandles = Array.from({ length: 360 }, (_, index) => candle(index));
  const contextCandles = Array.from({ length: 120 }, (_, index) => ({
    ...candle(index),
    timestamp: start - (120 - index) * 60_000,
  }));
  const state = {
    sessionId: "drawing-replay-e2e",
    config: {
      name: "Drawing replay",
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
    equityCurve: [
      {
        index: 59,
        time: replayCandles[59]!.timestamp,
        balance: "10000.00",
        equity: "10000.00",
      },
    ],
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
        sessionId: state.sessionId,
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
  await page.route(
    "**/api/backtest/sessions/drawing-replay-e2e",
    async (route) => {
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
    },
  );
  await page.goto("/app/backtest?trial=instant");

  const chart = page.getByRole("img", { name: "Candlestick price chart" });
  await expect(chart).toBeVisible({ timeout: 30_000 });
  const closeTour = page.getByRole("button", { name: /Close trading tour/i });
  if (await closeTour.isVisible()) await closeTour.click();

  const layoutButton = page.getByRole("button", { name: "Chart layout" });
  await expect(layoutButton).toContainText("Layout");
  await layoutButton.click();
  await page.getByRole("button", { name: /Two columns/i }).click();
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(2);

  const firstCell = page.getByTestId("chart-cell-1");
  await firstCell.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByRole("button", { name: "Session box", exact: true }).click();

  const bounds = await firstCell.getByRole("img", { name: "Candlestick price chart" }).boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;
  const drawingRailBounds = await firstCell.getByRole("toolbar", { name: "Drawing tools" }).boundingBox();
  expect(drawingRailBounds).not.toBeNull();
  if (!drawingRailBounds) return;
  expect(bounds.x).toBeGreaterThanOrEqual(drawingRailBounds.x + drawingRailBounds.width - 1);
  await page.mouse.move(bounds.x + bounds.width * 0.45, bounds.y + bounds.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.65,
    bounds.y + bounds.height * 0.75,
    { steps: 8 },
  );
  await page.mouse.up();

  // A drawing committed in one layout cell is immediately painted in every
  // other visible cell showing the same pair.
  await expect.poll(async () => page.evaluate(() => {
    const canvases = document.querySelectorAll<HTMLCanvasElement>(
      '[data-testid="chart-cell-2"] div[style*="pointer-events: none"] > canvas',
    );
    let painted = 0;
    for (const scene of canvases) {
      const context = scene.getContext("2d");
      if (!context) continue;
      const pixels = context.getImageData(0, 0, scene.width, scene.height).data;
      for (let offset = 3; offset < pixels.length; offset += 16) {
        if (pixels[offset] !== 0) painted += 1;
      }
    }
    return painted;
  })).toBeGreaterThan(0);

  const speed = page.getByLabel("Replay speed");
  await speed.fill((await speed.getAttribute("max")) ?? "0");
  await page.getByRole("button", { name: /Play replay/i }).click();

  const samples = await page.evaluate(async () => {
    const scene = document.querySelector(
      'div[style*="pointer-events: none"] > canvas',
    ) as HTMLCanvasElement | null;
    if (!scene) return [];
    const context = scene.getContext("2d");
    if (!context) return [];
    const counts: number[] = [];
    for (let frame = 0; frame < 45; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const pixels = context.getImageData(0, 0, scene.width, scene.height).data;
      let painted = 0;
      // Sampling every fourth pixel is enough to detect a cleared drawing frame
      // without making the test itself interfere with replay rendering.
      for (let offset = 3; offset < pixels.length; offset += 16) {
        if (pixels[offset] !== 0) painted += 1;
      }
      counts.push(painted);
    }
    return counts;
  });

  expect(samples).toHaveLength(45);
  expect(Math.min(...samples)).toBeGreaterThan(0);
});
