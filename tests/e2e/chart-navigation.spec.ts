import { expect, test, type Locator } from "@playwright/test";

test("1m and 1D charts pan and zoom independently during replay", async ({
  page,
}) => {
  test.setTimeout(60_000);
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

  // Simulate a profile carrying the removed synchronization preferences.
  // Hydration must preserve the layout while automatically dropping both flags.
  await page.addInitScript((id) => {
    if (window.localStorage.getItem(`forextestlab:layout:${id}`)) return;
    window.localStorage.setItem(
      `forextestlab:layout:${id}`,
      JSON.stringify({
        layout: "1",
        cells: [{ id: "cell-1", symbol: "EURUSD", timeframe: null }],
        focusedId: "cell-1",
        syncCrosshair: true,
        syncTime: true,
      }),
    );
  }, sessionId);

  await page.goto("/app/backtest?trial=instant");
  const closeTour = page.getByRole("button", {
    name: /Close trading tour/i,
  });
  if (await closeTour.isVisible()) await closeTour.click();
  await expect(
    page.getByRole("img", { name: "Candlestick price chart" }),
  ).toHaveCount(1, { timeout: 30_000 });

  await page.getByRole("button", { name: "Chart layout" }).click();
  const layoutMenu = page.getByTestId("chart-layout-menu");
  await expect(layoutMenu.getByText("Sync across charts")).toHaveCount(0);
  await expect(layoutMenu.getByRole("button", { name: "Crosshair" })).toHaveCount(0);
  await expect(layoutMenu.getByRole("button", { name: "Time" })).toHaveCount(0);
  await layoutMenu.getByRole("button", { name: /Two columns/i }).click();

  const savedLayout = await page.evaluate((id) => {
    const raw = window.localStorage.getItem(`forextestlab:layout:${id}`);
    return raw ? JSON.parse(raw) : null;
  }, sessionId);
  expect(savedLayout).not.toHaveProperty("syncCrosshair");
  expect(savedLayout).not.toHaveProperty("syncTime");

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
  const dailyChart = secondCell.getByRole("img", {
    name: "Candlestick price chart",
  });
  await expect(dailyChart).toHaveAttribute(
    "data-latest-candle-visible",
    "true",
  );

  await page.getByLabel("Replay step").selectOption("1");
  const speed = page.getByLabel("Replay speed");
  await speed.fill((await speed.getAttribute("max")) ?? "0");

  // A saved/manual viewport in any grid cell must rejoin the live edge when
  // playback starts. Each cell then remains independently movable.
  const dailyBox = await dailyChart.boundingBox();
  expect(dailyBox).not.toBeNull();
  await page.mouse.move(
    dailyBox!.x + dailyBox!.width / 2,
    dailyBox!.y + dailyBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    dailyBox!.x + dailyBox!.width / 2 + Math.min(160, dailyBox!.width / 3),
    dailyBox!.y + dailyBox!.height / 2,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect(dailyChart).toHaveAttribute("data-follow-latest", "false");

  await page.getByRole("button", { name: "Play replay" }).click();
  await expect(
    page.getByRole("button", { name: "Pause replay" }),
  ).toBeVisible();
  await expect(firstChart).toHaveAttribute("data-follow-latest", "true");
  await expect(dailyChart).toHaveAttribute("data-follow-latest", "true");
  const priceAtPlay = await firstChart.getAttribute("data-current-price");
  await page.waitForTimeout(400);
  expect(await firstChart.getAttribute("data-current-price")).not.toBe(
    priceAtPlay,
  );
  await expect(firstChart).toHaveAttribute(
    "data-latest-candle-visible",
    "true",
  );

  // Every supported layout must mount all of its cells into the same live
  // replay invariant. Changing layout during playback must not restore a saved
  // viewport or leave a newly mounted cell behind.
  const expectLivePosition = async (chart: Locator) => {
    await expect
      .poll(async () =>
        Number(await chart.getAttribute("data-latest-candle-position")),
      )
      .toBeGreaterThan(0.7);
    await expect
      .poll(async () =>
        Number(await chart.getAttribute("data-latest-candle-position")),
      )
      .toBeLessThan(0.8);
  };
  const assertLiveLayout = async (name: RegExp, count: number) => {
    await page.getByRole("button", { name: "Chart layout" }).click();
    await page
      .getByTestId("chart-layout-menu")
      .getByRole("button", { name })
      .click();
    await expect(
      page.getByRole("img", { name: "Candlestick price chart" }),
    ).toHaveCount(count);
    for (const chart of await page
      .getByRole("img", { name: "Candlestick price chart" })
      .all()) {
      await expect(chart).toHaveAttribute("data-follow-latest", "true");
      await expect(chart).toHaveAttribute(
        "data-latest-candle-visible",
        "true",
      );
      await expectLivePosition(chart);
    }
  };
  await assertLiveLayout(/^Two rows$/, 2);
  await assertLiveLayout(/^Main chart with two side charts$/, 3);
  await assertLiveLayout(/^Four charts$/, 4);
  await assertLiveLayout(/^Single chart$/, 1);
  await assertLiveLayout(/^Two columns$/, 2);

  const box = await firstChart.boundingBox();
  expect(box).not.toBeNull();
  // A simple crosshair click is not a request to leave live replay. The chart
  // must keep following and keep the current candle visible as replay advances.
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(3_500);
  await expect(firstChart).toHaveAttribute("data-follow-latest", "true");
  await expect(firstChart).toHaveAttribute(
    "data-latest-candle-visible",
    "true",
  );

  // Live replay always owns the viewport. Gestures must not release it until
  // the user pauses, and the other cells remain independently live.
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + Math.min(220, box!.width / 3),
    box!.y + box!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForTimeout(500);
  await expect(firstChart).toHaveAttribute("data-follow-latest", "true");
  await expect(firstChart).toHaveAttribute(
    "data-latest-candle-visible",
    "true",
  );

  await page.getByRole("button", { name: "Pause replay" }).click();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + Math.min(220, box!.width / 3),
    box!.y + box!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForTimeout(500);
  await expect(firstChart).toHaveAttribute("data-follow-latest", "false");
  await expect(firstChart).toHaveAttribute(
    "data-follow-detach-reason",
    "manual-interaction",
  );
  await expect(dailyChart).toHaveAttribute("data-follow-latest", "true");
  await expect(dailyChart).toHaveAttribute(
    "data-latest-candle-visible",
    "true",
  );

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

  // Old builds stored only logical indices. Those indices are not portable
  // between a 1m series and a 1D series and could reopen a populated cell in
  // empty space. Reloading must ignore that legacy range and show latest data.
  await page.evaluate((id) => {
    const staleView = (cell: string, timeframe: "1m" | "1h" | "1d") => {
      const key = `forextestlab:chart:${id}:${cell}`;
      const saved = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      delete saved.timeRange;
      saved.timeframe = timeframe;
      saved.range = { from: 10_000, to: 10_050 };
      window.localStorage.setItem(key, JSON.stringify(saved));
    };
    staleView("cell-1", "1h");
    staleView("cell-2", "1d");
    staleView("cell-3", "1m");
    staleView("cell-4", "1m");
    window.localStorage.setItem(
      `forextestlab:layout:${id}`,
      JSON.stringify({
        layout: "4",
        cells: [
          { id: "cell-1", symbol: "EURUSD", timeframe: null },
          { id: "cell-2", symbol: "EURUSD", timeframe: null },
          { id: "cell-3", symbol: "EURUSD", timeframe: null },
          { id: "cell-4", symbol: "EURUSD", timeframe: null },
        ],
        focusedId: "cell-1",
      }),
    );
  }, sessionId);
  await page.reload();
  await expect(page.getByTestId("chart-cell-1")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("chart-cell-4")).toBeVisible();
  await page
    .getByTestId("chart-cell-1")
    .getByRole("button", { name: "Display 1h candles" })
    .click();
  await page
    .getByTestId("chart-cell-2")
    .getByRole("button", { name: "Display 1D candles" })
    .click();
  for (const cell of ["chart-cell-1", "chart-cell-2", "chart-cell-3", "chart-cell-4"]) {
    await expect(
      page.getByTestId(cell).getByRole("img", {
        name: "Candlestick price chart",
      }),
    ).toHaveAttribute("data-latest-candle-visible", "true", {
      timeout: 30_000,
    });
  }
  await expect(
    page.getByTestId("chart-cell-2").getByRole("button", {
      name: "Display 1D candles",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByTestId("chart-cell-1").getByRole("button", {
      name: "Display 1h candles",
    }),
  ).toHaveAttribute("aria-pressed", "true");
});
