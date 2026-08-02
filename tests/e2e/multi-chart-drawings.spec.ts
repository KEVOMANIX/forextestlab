import { expect, test } from "@playwright/test";

/**
 * The multi-chart workspace: one drawing rail for every pane, drawings shared by
 * every pane on the same pair whatever timeframe it shows, anchors that survive
 * playback, and the spread shown where it is paid.
 */

const START = Date.UTC(2025, 0, 6, 8);
const SESSION_ID = "multi-chart-drawings-e2e";

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

/** Six days of 1-minute candles, so 15m and 1h panes have data to aggregate. */
const replayCandles = Array.from({ length: 6 * 24 * 60 }, (_, index) => candle(index));
const contextCandles = Array.from({ length: 600 }, (_, index) => ({
  ...candle(index),
  timestamp: START - (600 - index) * 60_000,
}));

const state = {
  sessionId: SESSION_ID,
  config: {
    name: "Multi chart drawings",
    symbols: ["EURUSD"],
    symbol: "EURUSD",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    timeframe: "1m",
    startTime: START,
    endTime: replayCandles.at(-1)!.timestamp,
    startingBalance: "10000.00",
    accountCurrency: "USD",
    spreadPips: "1.4",
    commissionPerLot: "0.00",
    slippagePips: "0.0",
    executionPolicy: "conservative",
    pipSize: "0.0001",
    pricePrecision: 5,
    initialVisibleCount: 120,
  },
  status: "idle",
  speed: 60,
  visibleIndex: 119,
  totalCandles: replayCandles.length,
  balance: "10000.00",
  equity: "10000.00",
  maxEquity: "10000.00",
  maxDrawdown: "0.00",
  maxDrawdownPercent: "0.0",
  currentPrice: replayCandles[119]!.close,
  currentTime: replayCandles[119]!.timestamp,
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

/** Every drawing the app has persisted, across all storage keys. */
type StoredDrawing = {
  kind?: string;
  points?: Array<{ time: number; price: number }>;
};

async function storedDrawings(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const out: Array<{ key: string; drawings: unknown }> = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("forextestlab:drawings:")) continue;
      out.push({ key, drawings: JSON.parse(localStorage.getItem(key) ?? "[]") });
    }
    return out as Array<{ key: string; drawings: StoredDrawing[] }>;
  });
}

/** Painted (non-transparent) pixels on a cell's drawing canvases. */
async function paintedPixels(page: import("@playwright/test").Page, cellId: string) {
  return page.evaluate((id) => {
    const canvases = document.querySelectorAll<HTMLCanvasElement>(
      `[data-testid="${id}"] div[style*="pointer-events: none"] > canvas`,
    );
    let painted = 0;
    for (const canvas of canvases) {
      const context = canvas.getContext("2d");
      if (!context) continue;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let offset = 3; offset < pixels.length; offset += 16) {
        if (pixels[offset] !== 0) painted += 1;
      }
    }
    return painted;
  }, cellId);
}

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
        candles: replayCandles.slice(0, 120),
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
  await page.route("**/api/backtest/sessions/*/history*", async (route) => {
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
        candles: replayCandles.slice(0, 120),
        replayCandles,
        contextCandles,
        notes: "",
      }),
    });
  });

  await page.goto("/app/backtest?trial=instant");
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(1, {
    timeout: 30_000,
  });
  // The tour mounts after the chart and overlays it, so dismissing it before the
  // chart exists leaves it to swallow the first click on the canvas.
  const closeTour = page.getByRole("button", { name: /Close trading tour/i });
  await closeTour.click({ timeout: 15_000 }).catch(() => {});
  await expect(closeTour).toHaveCount(0);
});

test("one drawing rail serves the whole workspace, at full height", async ({ page }) => {
  const rail = page.getByRole("toolbar", { name: "Drawing tools" });
  await expect(rail).toHaveCount(1);

  await page.getByRole("button", { name: "Chart layout" }).click();
  await page.getByRole("button", { name: /Four charts/i }).click();
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(4);

  // Still one rail, not one per pane.
  await expect(rail).toHaveCount(1);

  const railBox = await rail.boundingBox();
  const cellBox = await page.getByTestId("chart-cell-1").boundingBox();
  expect(railBox).not.toBeNull();
  expect(cellBox).not.toBeNull();
  // A rail repeated inside each pane was shorter than its own tool list, which
  // pushed the lower tools below the fold. Spanning the grid, it cannot.
  expect(railBox!.height).toBeGreaterThan(cellBox!.height);

  for (const id of ["chart-cell-1", "chart-cell-2", "chart-cell-3", "chart-cell-4"]) {
    const cell = page.getByTestId(id);
    const chartBox = await cell
      .getByRole("img", { name: "Candlestick price chart" })
      .boundingBox();
    // Every pane's chart begins after the rail rather than under it.
    expect(chartBox!.x).toBeGreaterThanOrEqual(railBox!.x + railBox!.width - 1);

    // The drawing overlay has to sit exactly on the chart. The engine reads the
    // pointer against the overlay and projects it through the chart's own
    // coordinates, so any offset between the two lands every anchor that many
    // pixels' worth of bars away from the candle it was placed on.
    const overlayBox = await cell
      .locator('div[style*="pointer-events: none"] > canvas')
      .first()
      .boundingBox();
    expect(Math.abs(overlayBox!.x - chartBox!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(overlayBox!.width - chartBox!.width)).toBeLessThanOrEqual(1);
  }
});

test("a drawing reaches every pane on the pair, whatever timeframe it shows", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.getByRole("button", { name: "Chart layout" }).click();
  await page.getByRole("button", { name: /Four charts/i }).click();
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(4);

  // Draw on the focused pane first, before anything else can steal focus or put
  // a history fetch in front of the canvas.
  const firstChart = page
    .getByTestId("chart-cell-1")
    .getByRole("img", { name: "Candlestick price chart" });
  const rail = page.getByRole("toolbar", { name: "Drawing tools" });
  const shapes = rail.getByRole("button", { name: "Shapes", exact: true });
  await shapes.click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  // The rail marks the armed group, and the overlay reports what the engine
  // itself is armed with — the state a pointer-down actually reads.
  await expect(shapes).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator('[data-testid="chart-cell-1"] [data-drawing-tool="rectangle"]'),
  ).toHaveCount(1);

  const bounds = await firstChart.boundingBox();
  expect(bounds).not.toBeNull();
  // Clear of the pane's floating legend column, which is interactive and grows
  // downwards as the crosshair adds an OHLC row.
  await page.mouse.move(bounds!.x + bounds!.width * 0.5, bounds!.y + bounds!.height * 0.62);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.78, bounds!.y + bounds!.height * 0.85, {
    steps: 8,
  });
  await page.mouse.up();

  await expect
    .poll(
      async () =>
        (await storedDrawings(page)).some((entry) =>
          entry.drawings.some((drawing) => drawing.kind === "rectangle"),
        ),
      { timeout: 15_000 },
    )
    .toBe(true);

  // The pair's drawings live under one key, so every pane reads the same set.
  const keys = (await storedDrawings(page))
    .filter((entry) => entry.drawings.length > 0)
    .map((entry) => entry.key);
  expect(keys).toHaveLength(1);
  expect(keys[0]).toContain("EURUSD");

  // Retime the other panes: a drawing belongs to the pair, not to the timeframe
  // it happened to be drawn on.
  await page
    .getByTestId("chart-cell-2")
    .getByRole("button", { name: "Display 15m candles", exact: true })
    .click();
  await page
    .getByTestId("chart-cell-3")
    .getByRole("button", { name: "Display 1h candles", exact: true })
    .click();
  await expect(
    page.getByTestId("chart-cell-2").getByRole("img", { name: "Candlestick price chart" }),
  ).toHaveAttribute("data-axis-timeframe", "15m");
  await expect(
    page.getByTestId("chart-cell-3").getByRole("img", { name: "Candlestick price chart" }),
  ).toHaveAttribute("data-axis-timeframe", "1h");
  await expect(page.getByText(/^Loading .* chart history…$/)).toHaveCount(0, {
    timeout: 30_000,
  });

  for (const id of ["chart-cell-2", "chart-cell-3", "chart-cell-4"]) {
    await expect.poll(() => paintedPixels(page, id), { timeout: 15_000 }).toBeGreaterThan(0);
  }
});

test("playback never moves a drawing's anchors", async ({ page }) => {
  test.setTimeout(60_000);
  const firstChart = page.getByRole("img", { name: "Candlestick price chart" });
  const rail = page.getByRole("toolbar", { name: "Drawing tools" });

  // A vertical line placed in the empty space to the right of price is the
  // strictest case: it has no candle of its own to hold onto, so its stored time
  // comes from the chart's forward runway.
  await rail.getByRole("button", { name: "Lines & channels", exact: true }).click();
  await page.getByRole("button", { name: "Vertical line", exact: true }).click();
  const bounds = await firstChart.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + bounds!.width * 0.86, bounds!.y + bounds!.height * 0.5);

  const anchorsFor = async () => {
    const entries = await storedDrawings(page);
    for (const entry of entries) {
      const line = entry.drawings.find((drawing) => drawing.kind === "vertical");
      if (line?.points) return line.points;
    }
    return null;
  };
  await expect.poll(anchorsFor).not.toBeNull();
  const before = await anchorsFor();

  // The anchor lands on a bar the chart's time axis actually carries, so replay
  // reaching it resolves the same pixel instead of dragging it back.
  const runway = await firstChart.evaluate((el) =>
    Number((el as HTMLElement).dataset.forwardScalePoints ?? 0),
  );
  expect(runway).toBeGreaterThan(0);

  const speed = page.getByRole("button", { name: "Replay speed" });
  for (let click = 0; click < 5; click += 1) await speed.click();
  await page.getByRole("button", { name: /Play replay/i }).click();
  // Let a few hundred candles arrive.
  await expect
    .poll(() => firstChart.getAttribute("data-current-price"), { timeout: 20_000 })
    .not.toBe(String(Number(state.currentPrice)));
  await page.getByRole("button", { name: /Pause replay/i }).click();

  expect(await anchorsFor()).toEqual(before);
});

test("the spread sits between the quick Sell and Buy buttons", async ({ page }) => {
  const spread = page.getByTestId("quick-trade-spread");
  await expect(spread).toHaveText(/1\.4/);
  await expect(spread).toHaveAttribute("title", /^Spread: 1\.4 pips \(1\.0/);

  const sell = await page.getByRole("button", { name: "Quick Sell" }).boundingBox();
  const buy = await page.getByRole("button", { name: "Quick Buy" }).boundingBox();
  const box = await spread.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(sell!.x + sell!.width - 1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(buy!.x + 1);
});
