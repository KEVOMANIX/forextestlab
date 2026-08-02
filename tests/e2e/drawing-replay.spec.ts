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

  // Text is entered directly at the chart click: only a transparent textarea
  // and its native blinking caret are present, with no input box chrome.
  await page.getByRole("button", { name: "Text & notes", exact: true }).click();
  await page.getByRole("button", { name: "Anchored text", exact: true }).click();
  const initialBounds = await chart.boundingBox();
  expect(initialBounds).not.toBeNull();
  if (!initialBounds) return;
  await page.mouse.click(initialBounds.x + initialBounds.width * .44, initialBounds.y + initialBounds.height * .24);
  await page.mouse.move(initialBounds.x + initialBounds.width * .58, initialBounds.y + initialBounds.height * .32, { steps: 6 });
  await page.mouse.click(initialBounds.x + initialBounds.width * .58, initialBounds.y + initialBounds.height * .32);
  const directEditor = page.getByTestId("drawing-inline-text-editor");
  await expect(directEditor).toBeFocused();
  await expect(directEditor).toHaveCSS("background-color", "rgb(17, 24, 39)");
  await expect(directEditor).toHaveCSS("border-top-width", "1px");
  await expect(directEditor).toHaveCSS("box-shadow", "none");
  await directEditor.fill("Replay plan");
  await page.keyboard.press("Enter");
  await expect(directEditor).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("forextestlab:drawings:")) continue;
      const drawings = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{
        kind?: string;
        points?: Array<{ time: number; price: number }>;
        style?: { text?: string };
      }>;
      if (drawings.some((drawing) => drawing.kind === "anchoredText" && drawing.style?.text === "Replay plan" && drawing.points?.length === 2)) return true;
    }
    return false;
  })).toBe(true);
  const anchoredBeforeDrag = await page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("forextestlab:drawings:")) continue;
      const drawings = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{ kind?: string; points?: Array<{ time: number; price: number }> }>;
      const anchored = drawings.find((drawing) => drawing.kind === "anchoredText");
      if (anchored?.points) return anchored.points;
    }
    return null;
  });
  expect(anchoredBeforeDrag).not.toBeNull();
  await page.mouse.move(initialBounds.x + initialBounds.width * .58 + 28, initialBounds.y + initialBounds.height * .32);
  await page.mouse.down();
  await page.mouse.move(initialBounds.x + initialBounds.width * .58 + 88, initialBounds.y + initialBounds.height * .38, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate((original) => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("forextestlab:drawings:")) continue;
      const drawings = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{ kind?: string; points?: Array<{ time: number; price: number }> }>;
      const points = drawings.find((drawing) => drawing.kind === "anchoredText")?.points;
      if (points && original) return points[0]?.time === original[0]?.time && points[0]?.price === original[0]?.price && points[1]?.time !== original[1]?.time;
    }
    return false;
  }, anchoredBeforeDrag)).toBe(true);

  // The expanded toolbox exposes real tools in the expected families.
  await page.getByRole("button", { name: "Lines & channels", exact: true }).click();
  for (const tool of ["Horizontal ray", "Info line", "Trend angle", "Regression trend", "Flat top / bottom", "Disjoint channel"]) {
    await expect(page.getByRole("button", { name: tool, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Lines & channels", exact: true }).click();
  await page.getByRole("button", { name: "Fibonacci", exact: true }).click();
  await expect(page.getByRole("button", { name: "Trend-based Fib extension", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fibonacci", exact: true }).click();
  await page.getByRole("button", { name: "Positions & measure", exact: true }).click();
  for (const tool of ["Price range", "Date range", "Date & price range"]) {
    await expect(page.getByRole("button", { name: tool, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Positions & measure", exact: true }).click();

  for (const timeframe of ["3m", "10m", "45m", "2h", "6h", "12h", "1w", "1M", "1yr"]) {
    await expect(page.getByRole("button", { name: `Display ${timeframe} candles`, exact: true })).toHaveCount(1);
  }
  await page.getByRole("button", { name: "Display 10m candles", exact: true }).click();
  await expect(page.getByRole("button", { name: "Display 10m candles", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(chart).toHaveAttribute("data-axis-timeframe", "10m");
  await expect(chart).toHaveAttribute("data-axis-tick-max-chars", "5");
  await expect(chart).toHaveAttribute("data-axis-time-visible", "true");
  await expect(page.getByText("Loading 10m chart history…", { exact: true })).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole("button", { name: "Display 1M candles", exact: true }).click();
  await expect(chart).toHaveAttribute("data-axis-timeframe", "1M");
  await expect(chart).toHaveAttribute("data-axis-tick-max-chars", "4");
  await expect(chart).toHaveAttribute("data-axis-time-visible", "false");
  await expect(page.getByText("Loading 1M chart history…", { exact: true })).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole("button", { name: "Display 1m candles", exact: true }).click();
  await expect(page.getByRole("button", { name: "Display 1m candles", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Loading 1m chart history…", { exact: true })).toHaveCount(0, { timeout: 30_000 });

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

  const sessionToolbar = firstCell.getByRole("toolbar", {
    name: "session drawing settings",
  });
  await expect(sessionToolbar).toBeVisible();

  // Empty chart space clears selection and its contextual controls.
  await page.mouse.click(bounds.x + bounds.width * 0.86, bounds.y + bounds.height * 0.12);
  await expect(sessionToolbar).toHaveCount(0);

  // Circle creation paints only the circle itself. The transparent interaction
  // canvas must stay empty until pointer-up adds real selection handles.
  await firstCell.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  await page.mouse.move(bounds.x + bounds.width * 0.42, bounds.y + bounds.height * 0.42);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.56, bounds.y + bounds.height * 0.58, { steps: 6 });
  const creationOverlayPixels = await firstCell.evaluate((cell) => {
    const canvases = cell.querySelectorAll<HTMLCanvasElement>(
      'div[style*="pointer-events: none"] > canvas',
    );
    const overlay = canvases[1];
    const context = overlay?.getContext("2d");
    if (!overlay || !context) return -1;
    const pixels = context.getImageData(0, 0, overlay.width, overlay.height).data;
    let painted = 0;
    for (let offset = 3; offset < pixels.length; offset += 16) {
      if (pixels[offset] !== 0) painted += 1;
    }
    return painted;
  });
  expect(creationOverlayPixels).toBe(0);
  await page.mouse.up();
  const circleToolbar = firstCell.getByRole("toolbar", { name: "circle drawing settings" });
  await expect(circleToolbar).toBeVisible();
  await expect(circleToolbar.getByLabel("Drawing stroke color")).toHaveCount(1);
  const backgroundColor = circleToolbar.getByLabel("Drawing background color");
  await expect(backgroundColor).toHaveCount(1);
  await expect(circleToolbar.getByRole("button", { name: "Remove drawing background" })).toHaveCount(0);
  await backgroundColor.fill("#ff5500");
  await expect.poll(() => page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("forextestlab:drawings:")) continue;
      const drawings = JSON.parse(localStorage.getItem(key) ?? "[]") as {
        kind?: string;
        style?: { fillColor?: string };
      }[];
      if (drawings.some((drawing) => drawing.kind === "circle" && drawing.style?.fillColor === "#ff5500")) {
        return true;
      }
    }
    return false;
  })).toBe(true);

  // Straight line tools expose only their two real endpoints. They must not
  // inherit the eight bounding-box handles used to resize area shapes.
  await firstCell.getByRole("button", { name: "Lines & channels", exact: true }).click();
  await page.getByRole("button", { name: "Trend line", exact: true }).click();
  await page.mouse.move(bounds.x + bounds.width * 0.30, bounds.y + bounds.height * 0.30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.52, bounds.y + bounds.height * 0.56, { steps: 6 });
  await page.mouse.up();
  await expect(firstCell.getByRole("toolbar", { name: "trend drawing settings" })).toBeVisible();
  const lineHandleColumnGroups = await firstCell.evaluate((cell) => {
    const canvases = cell.querySelectorAll<HTMLCanvasElement>(
      'div[style*="pointer-events: none"] > canvas',
    );
    const overlay = canvases[1];
    const context = overlay?.getContext("2d");
    if (!overlay || !context) return [];
    const { width, height } = overlay;
    const pixels = context.getImageData(0, 0, width, height).data;
    const paintedColumns = new Uint8Array(width);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      if (pixels[pixel * 4 + 3] !== 0) paintedColumns[pixel % width] = 1;
    }
    const groups: Array<{ start: number; end: number }> = [];
    for (let x = 0; x < paintedColumns.length; x += 1) {
      if (paintedColumns[x] && (x === 0 || !paintedColumns[x - 1])) groups.push({ start: x, end: x });
      if (paintedColumns[x] && groups.length) groups[groups.length - 1]!.end = x;
    }
    return groups;
  });
  expect(lineHandleColumnGroups).toHaveLength(2);

  // A Path commits on double-click without retaining the two duplicate
  // points generated by the browser's double-click event sequence.
  await firstCell.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByRole("button", { name: "Path", exact: true }).click();
  await page.mouse.click(bounds.x + bounds.width * 0.34, bounds.y + bounds.height * 0.66);
  await page.mouse.click(bounds.x + bounds.width * 0.43, bounds.y + bounds.height * 0.58);
  await page.mouse.dblclick(bounds.x + bounds.width * 0.53, bounds.y + bounds.height * 0.70);
  await expect(firstCell.getByRole("toolbar", { name: "path drawing settings" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("forextestlab:drawings:")) continue;
      const drawings = JSON.parse(localStorage.getItem(key) ?? "[]") as {
        kind?: string;
        points?: unknown[];
      }[];
      const path = drawings.find((drawing) => drawing.kind === "path");
      if (path) return path.points?.length ?? 0;
    }
    return 0;
  })).toBe(3);

  // Rectangles expose a midpoint line in advanced settings, disabled by
  // default and persisted when enabled.
  await firstCell.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.32);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.78, bounds.y + bounds.height * 0.62, { steps: 6 });
  await page.mouse.up();
  const rectangleToolbar = firstCell.getByRole("toolbar", { name: "rectangle drawing settings" });
  await expect(rectangleToolbar).toBeVisible();
  await rectangleToolbar.getByRole("button", { name: "More drawing settings" }).click();
  const centerLine = page.getByLabel("Show rectangle center line");
  await expect(centerLine).not.toBeChecked();
  await centerLine.check();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("forextestlab:drawings:")) continue;
      const drawings = JSON.parse(localStorage.getItem(key) ?? "[]") as {
        kind?: string;
        style?: { showCenterLine?: boolean };
      }[];
      if (drawings.some((drawing) => drawing.kind === "rectangle" && drawing.style?.showCenterLine)) {
        return true;
      }
    }
    return false;
  })).toBe(true);

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

  const speed = page.getByRole("button", { name: "Replay speed" });
  for (let click = 0; click < 5; click += 1) await speed.click();
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
