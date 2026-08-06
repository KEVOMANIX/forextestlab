import { expect, test } from "@playwright/test";

import { aggregateCandles } from "../../src/lib/market-data/aggregation";
import type { Timeframe } from "../../src/lib/market-data/types";

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
      for (let offset = 3; offset < pixels.length; offset += 4) {
        if (pixels[offset] !== 0) painted += 1;
      }
    }
    return painted;
  }, cellId);
}

/** CSS-pixel horizontal bounds of committed drawing ink in one pane. */
async function drawingHorizontalBounds(page: import("@playwright/test").Page, cellId: string) {
  return page.evaluate((id) => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      `[data-testid="${id}"] [data-drawing-count] canvas[style*="z-index: 1"]`,
    );
    if (!canvas) return null;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let maxX = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] !== 0) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }
    }
    if (maxX < 0) return null;
    const dpr = canvas.width / canvas.getBoundingClientRect().width;
    return { minX: minX / dpr, maxX: maxX / dpr };
  }, cellId);
}

/** WCAG contrast failures among every visible text node in the terminal. */
async function visibleTextContrastViolations(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    type Rgba = { r: number; g: number; b: number; a: number };
    const parse = (value: string): Rgba | null => {
      const match = value.match(/rgba?\((\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)(?:[, /]+(\d+(?:\.\d+)?))?\)/);
      return match
        ? { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] == null ? 1 : Number(match[4]) }
        : null;
    };
    const composite = (front: Rgba, back: Rgba): Rgba => {
      const a = front.a + back.a * (1 - front.a);
      if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (front.r * front.a + back.r * back.a * (1 - front.a)) / a,
        g: (front.g * front.a + back.g * back.a * (1 - front.a)) / a,
        b: (front.b * front.a + back.b * back.a * (1 - front.a)) / a,
        a,
      };
    };
    const luminance = ({ r, g, b }: Rgba) => {
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (a: Rgba, b: Rgba) => {
      const first = luminance(a);
      const second = luminance(b);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const background = (element: Element) => {
      const ancestors: Element[] = [];
      for (let current: Element | null = element; current; current = current.parentElement) ancestors.unshift(current);
      let result: Rgba = { r: 255, g: 255, b: 255, a: 1 };
      for (const ancestor of ancestors) {
        const layer = parse(getComputedStyle(ancestor).backgroundColor);
        if (layer && layer.a > 0) result = composite(layer, result);
      }
      return result;
    };

    const shell = document.querySelector(".app-shell");
    if (!shell) return ["app shell missing"];
    const failures: string[] = [];
    const elements = document.querySelectorAll<HTMLElement>(
      ".app-shell *, .app-theme-surface, .app-theme-surface *",
    );
    for (const element of Array.from(elements)) {
      if (element.closest(".sr-only") || element.closest("[disabled], [aria-disabled='true']")) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) continue;
      let hiddenByOpacity = false;
      for (let current: Element | null = element; current; current = current.parentElement) {
        if (Number.parseFloat(getComputedStyle(current).opacity) < 0.01) {
          hiddenByOpacity = true;
          break;
        }
      }
      if (hiddenByOpacity) continue;
      const ownText = Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
      );
      if (!ownText) continue;
      const foreground = parse(style.color);
      if (!foreground) continue;
      const ratio = contrast(composite(foreground, background(element)), background(element));
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
      const minimum = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
      if (ratio + 0.01 < minimum) {
        failures.push(`${element.tagName.toLowerCase()} "${element.textContent?.trim().slice(0, 45)}" ${ratio.toFixed(2)}:${minimum}`);
      }
    }
    return failures;
  });
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
  await page.route("**/api/backtest/sessions/*/context?*", async (route) => {
    const timeframe = new URL(route.request().url()).searchParams.get("timeframe") as Timeframe;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        candles: aggregateCandles(contextCandles, "1m", timeframe),
        hasMore: false,
      }),
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

  const draggedRectangle = (await storedDrawings(page))
    .flatMap((entry) => entry.drawings)
    .find((drawing) => drawing.kind === "rectangle");
  expect(draggedRectangle?.points).toHaveLength(2);
  // A gesture made left-to-right on a fine chart must remain chronologically
  // left-to-right. Merely finding painted pixels missed the old failure where
  // one anchor jumped into future whitespace and inverted on higher frames.
  expect(draggedRectangle!.points![0]!.time).toBeLessThan(
    draggedRectangle!.points![1]!.time,
  );

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

  const speed = page.getByRole("button", { name: "Replay speed", exact: true });
  for (let click = 0; click < 5; click += 1) await speed.click();
  await page.getByRole("button", { name: /Play replay/i }).click();
  // Let a few hundred candles arrive.
  await expect
    .poll(() => firstChart.getAttribute("data-current-price"), { timeout: 20_000 })
    .not.toBe(String(Number(state.currentPrice)));
  await page.getByRole("button", { name: /Pause replay/i }).click();

  expect(await anchorsFor()).toEqual(before);
});

test("a drawing made on 15m stays visible on 4h", async ({ page }) => {
  test.setTimeout(60_000);
  const chart = page.getByRole("img", { name: "Candlestick price chart" });
  await page.getByRole("button", { name: "Display 15m candles", exact: true }).click();
  await expect(chart).toHaveAttribute("data-axis-timeframe", "15m");
  await expect(page.getByText(/^Loading .* chart historyâ€¦$/)).toHaveCount(0, { timeout: 30_000 });
  await expect(chart).toHaveAttribute("data-visible-range-timeframe", "15m");
  const visibleOn15m = {
    from: Number(await chart.getAttribute("data-visible-time-from")),
    to: Number(await chart.getAttribute("data-visible-time-to")),
  };

  const rail = page.getByRole("toolbar", { name: "Drawing tools" });
  await rail.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const bounds = await chart.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width * 0.32, bounds!.y + bounds!.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.7, bounds!.y + bounds!.height * 0.78, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => paintedPixels(page, "chart-cell-1"), { timeout: 15_000 }).toBeGreaterThan(0);
  const before = await storedDrawings(page);
  const rectangle = before.flatMap((entry) => entry.drawings).find((drawing) => drawing.kind === "rectangle");
  expect(rectangle?.points).toHaveLength(2);
  expect(rectangle!.points![0]!.time).toBeLessThan(rectangle!.points![1]!.time);
  expect(rectangle!.points![0]!.time).toBeGreaterThanOrEqual(visibleOn15m.from - 15 * 60);
  expect(rectangle!.points![1]!.time).toBeLessThanOrEqual(visibleOn15m.to + 15 * 60);
  const expectChronologicalProjection = async () => {
    await expect.poll(async () => {
      const chartBox = await chart.boundingBox();
      const ink = await drawingHorizontalBounds(page, "chart-cell-1");
      if (!chartBox || !ink || ink.maxX <= ink.minX) return -Infinity;
      // The regression projected the two fine anchors to opposite chart edges,
      // painting only horizontal lines across the full higher-timeframe pane.
      // Both vertical edges must remain inside the canvas with real width.
      return Math.min(ink.minX, chartBox.width - ink.maxX, ink.maxX - ink.minX);
    }, { timeout: 15_000 }).toBeGreaterThan(20);
  };
  await page.getByRole("button", { name: "Display 4h candles", exact: true }).click();
  await expect(chart).toHaveAttribute("data-axis-timeframe", "4h");
  await expect(page.getByText(/^Loading .* chart historyâ€¦$/)).toHaveCount(0, { timeout: 30_000 });
  await expect(chart).toHaveAttribute("data-visible-range-timeframe", "4h");
  const visibleOn4h = {
    from: Number(await chart.getAttribute("data-visible-time-from")),
    to: Number(await chart.getAttribute("data-visible-time-to")),
  };

  await expect.poll(() => paintedPixels(page, "chart-cell-1"), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(await storedDrawings(page)).toEqual(before);
  await expectChronologicalProjection();
  // Coarser bars may snap each edge by at most one 4h interval, but changing
  // timeframe must not expand a one-day view into the multi-week view that made
  // correctly anchored drawings look displaced.
  expect(Math.abs(visibleOn4h.from - visibleOn15m.from)).toBeLessThanOrEqual(8 * 60 * 60);
  expect(Math.abs(visibleOn4h.to - visibleOn15m.to)).toBeLessThanOrEqual(8 * 60 * 60);

  await page.getByRole("button", { name: "Display 1h candles", exact: true }).click();
  await expect(chart).toHaveAttribute("data-axis-timeframe", "1h");
  await expect(page.getByText(/^Loading .* chart historyâ€¦$/)).toHaveCount(0, { timeout: 30_000 });
  await expect(chart).toHaveAttribute("data-visible-range-timeframe", "1h");
  const visibleOn1h = {
    from: Number(await chart.getAttribute("data-visible-time-from")),
    to: Number(await chart.getAttribute("data-visible-time-to")),
  };
  await expect.poll(() => paintedPixels(page, "chart-cell-1"), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(await storedDrawings(page)).toEqual(before);
  await expectChronologicalProjection();
  expect(Math.abs(visibleOn1h.from - visibleOn15m.from)).toBeLessThanOrEqual(4 * 60 * 60);
  expect(Math.abs(visibleOn1h.to - visibleOn15m.to)).toBeLessThanOrEqual(4 * 60 * 60);
});

test("late history responses cannot overwrite a newer timeframe", async ({ page }) => {
  test.setTimeout(60_000);
  await page.unroute("**/api/backtest/sessions/*/context?*");
  let startedResponses = 0;
  let completedResponses = 0;
  await page.route("**/api/backtest/sessions/*/context?*", async (route) => {
    startedResponses += 1;
    const timeframe = new URL(route.request().url()).searchParams.get("timeframe") as Timeframe;
    const delay = timeframe === "15m" ? 500 : timeframe === "1h" ? 250 : 0;
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        candles: aggregateCandles(contextCandles, "1m", timeframe),
        hasMore: false,
      }),
    });
    completedResponses += 1;
  });

  const chart = page.getByRole("img", { name: "Candlestick price chart" });
  await page.getByRole("button", { name: "Display 15m candles", exact: true }).click();
  await expect(chart).toHaveAttribute("data-axis-timeframe", "15m");
  await expect.poll(() => startedResponses).toBe(1);
  await page.getByRole("button", { name: "Display 1h candles", exact: true }).click();
  await expect(chart).toHaveAttribute("data-axis-timeframe", "1h");
  await expect.poll(() => startedResponses).toBe(2);
  await page.getByRole("button", { name: "Display 4h candles", exact: true }).click();
  await expect(chart).toHaveAttribute("data-axis-timeframe", "4h");
  await expect.poll(() => startedResponses).toBe(3);
  await expect(page.getByText(/^Loading .* chart historyâ€¦$/)).toHaveCount(0, { timeout: 30_000 });

  // Wait for all intentionally out-of-order responses and confirm neither late
  // response was allowed to replace the final 4h context timeline.
  await expect.poll(() => completedResponses, { timeout: 5_000 }).toBe(3);
  await expect(chart).toHaveAttribute("data-history-timeframe", "4h");
  await expect(chart).toHaveAttribute("data-visible-range-timeframe", "4h");
});

test("the execution cost sits in both Sell and Buy seams", async ({ page }) => {
  const spread = page.getByTestId("quick-trade-spread");
  await expect(spread).toHaveText("1.4");
  await expect(spread).toHaveAttribute("aria-label", "1.4 pips");
  await expect(page.getByTestId("quick-sell-cost")).toHaveCount(0);
  await expect(page.getByTestId("quick-buy-cost")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Quick Sell" })).toHaveAttribute("title", /^1\.4 pips · 1\.0/);
  await expect(page.getByRole("button", { name: "Quick Buy" })).toHaveAttribute("title", /^1\.4 pips · 1\.0/);

  const sell = await page.getByRole("button", { name: "Quick Sell" }).boundingBox();
  const buy = await page.getByRole("button", { name: "Quick Buy" }).boundingBox();
  const badge = await spread.boundingBox();
  expect(sell).not.toBeNull();
  expect(buy).not.toBeNull();
  expect(badge).not.toBeNull();
  const seam = (sell!.x + sell!.width + buy!.x) / 2;
  expect(Math.abs(badge!.x + badge!.width / 2 - seam)).toBeLessThanOrEqual(2);

  const chartSpread = page.getByTestId("chart-trade-spread");
  await expect(chartSpread).toHaveText("1.4");
  await expect(chartSpread).toHaveAttribute("aria-label", "1.4 pips");
  await expect(page.getByText("1-click", { exact: true })).toHaveCount(0);

  const chartSell = await page.getByTestId("chart-quick-sell").boundingBox();
  const chartBuy = await page.getByTestId("chart-quick-buy").boundingBox();
  const chartBadge = await chartSpread.boundingBox();
  expect(chartSell).not.toBeNull();
  expect(chartBuy).not.toBeNull();
  expect(chartBadge).not.toBeNull();
  const chartSeam = (chartSell!.x + chartSell!.width + chartBuy!.x) / 2;
  expect(Math.abs(chartBadge!.x + chartBadge!.width / 2 - chartSeam)).toBeLessThanOrEqual(2);
});

test("the legend fills the plot corner and light mode keeps text contrast", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Open Strategy Lab" })).toHaveCount(0);
  await expect(page.getByText("Algo", { exact: true })).toHaveCount(0);
  const cell = await page.getByTestId("chart-cell-1").boundingBox();
  const legend = await page.getByTestId("chart-legend").boundingBox();
  expect(cell).not.toBeNull();
  expect(legend).not.toBeNull();
  expect(legend!.x - cell!.x).toBeLessThanOrEqual(12);
  expect(await visibleTextContrastViolations(page)).toEqual([]);
  await expect(page.locator(".app-logo-dark")).toBeVisible();
  await expect(page.locator(".app-logo-light")).toBeHidden();
  await expect(page.getByTestId("terminal-logo-mark")).not.toHaveAttribute("src", /logo-mark-light/);

  await page
    .getByLabel("Trading header")
    .getByRole("button", { name: "Switch to light theme" })
    .click();
  const lightShell = page.locator(".app-shell.light");
  await expect(lightShell).toHaveCount(1);
  expect(
    await lightShell.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.getPropertyValue("--app-bg").trim(),
        text: style.getPropertyValue("--app-text").trim(),
        muted: style.getPropertyValue("--app-muted").trim(),
      };
    }),
  ).toEqual({ background: "#eef2f6", text: "#0b1220", muted: "#506078" });
  await expect(page.locator(".app-logo-dark")).toBeHidden();
  await expect(page.locator(".app-logo-light")).toBeVisible();
  await expect(page.getByTestId("terminal-logo-mark")).toHaveAttribute("src", /logo-mark-light/);
  expect(await visibleTextContrastViolations(page)).toEqual([]);

  const linesMenu = page.getByRole("button", { name: /Lines & channels/i });
  await linesMenu.click();
  await expect(page.getByText("Trend line", { exact: true })).toBeVisible();
  expect(await visibleTextContrastViolations(page)).toEqual([]);
  await linesMenu.click();
  await expect(page.getByText("Trend line", { exact: true })).toHaveCount(0);

  const chart = page.getByRole("img", { name: "Candlestick price chart" });
  const chartBox = await chart.boundingBox();
  expect(chartBox).not.toBeNull();
  await page.mouse.click(chartBox!.x + chartBox!.width * 0.7, chartBox!.y + chartBox!.height * 0.55, {
    button: "right",
  });
  const chartMenu = page.getByRole("menu", { name: "Chart actions" });
  await expect(chartMenu).toBeVisible();
  expect(await visibleTextContrastViolations(page)).toEqual([]);
  await chartMenu.getByRole("menuitem", { name: /^Settings/ }).click();
  const settings = page.getByRole("dialog", { name: "Chart settings" });
  await expect(settings).toBeVisible();
  expect(await visibleTextContrastViolations(page)).toEqual([]);
  await settings.getByRole("button", { name: "Close chart settings" }).click();

  await page.getByTitle("New order").click();
  await expect(page.getByTestId("trade-order-panel")).toBeVisible();
  expect(await visibleTextContrastViolations(page)).toEqual([]);
});

test("the layout picker groups arrangements by chart count", async ({ page }) => {
  await page.getByRole("button", { name: "Chart layout" }).click();
  const menu = page.getByTestId("chart-layout-menu");
  await expect(menu).toBeVisible();

  // Every count from one to ten is offered, named for the screen reader.
  for (const label of ["One pane", "Two panes", "Five panes", "Ten panes"]) {
    await expect(menu.getByText(label, { exact: true })).toHaveCount(1);
  }
  // Several arrangements per count, not one.
  await expect(menu.getByRole("button", { name: "Four charts" })).toHaveCount(1);
  await expect(menu.getByRole("button", { name: "Four columns" })).toHaveCount(1);
  await expect(menu.getByRole("button", { name: "Four rows" })).toHaveCount(1);
  await expect(menu.getByRole("button", { name: "Main chart with three side charts" })).toHaveCount(1);
  // The current layout reads as the pressed one.
  await expect(menu.getByRole("button", { name: "Single chart" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await menu.getByRole("button", { name: "Six panes, 3 by 2" }).click();
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(6, {
    timeout: 30_000,
  });
  // Still one rail and one favorites bar, however many panes there are.
  await expect(page.getByRole("toolbar", { name: "Drawing tools" })).toHaveCount(1);
});

test("a feature pane spans exactly the rows and columns its layout gives it", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Chart layout" }).click();
  await page
    .getByTestId("chart-layout-menu")
    .getByRole("button", { name: "Main chart with two side charts" })
    .click();
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(3, {
    timeout: 30_000,
  });

  const main = await page.getByTestId("chart-cell-1").boundingBox();
  const upper = await page.getByTestId("chart-cell-2").boundingBox();
  const lower = await page.getByTestId("chart-cell-3").boundingBox();
  expect(main).not.toBeNull();
  expect(upper).not.toBeNull();
  expect(lower).not.toBeNull();

  // The main pane owns the left column for both rows; the other two share the
  // right column. Grid gaps are a pixel, so allow a couple either way.
  expect(main!.x).toBeLessThan(upper!.x);
  expect(main!.x).toBeLessThan(lower!.x);
  expect(Math.abs(main!.height - (upper!.height + lower!.height))).toBeLessThanOrEqual(3);
  expect(Math.abs(upper!.x - lower!.x)).toBeLessThanOrEqual(2);
  expect(upper!.y).toBeLessThan(lower!.y);

  // And the choice survives a reload, like every other workspace preference.
  await page.reload();
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(3, {
    timeout: 30_000,
  });
});

test("the favourites toolbox can be parked over any pane, and stays there", async ({
  page,
}) => {
  const rail = page.getByRole("toolbar", { name: "Drawing tools" });
  await rail.getByRole("button", { name: "Lines & channels", exact: true }).click();
  await page.getByRole("button", { name: /Favorite Horizontal line/i }).click();
  await rail.getByRole("button", { name: "Lines & channels", exact: true }).click();

  const toolbox = page.getByRole("toolbar", { name: /Favorite tools/i });
  await expect(toolbox).toHaveCount(1);

  await page.getByRole("button", { name: "Chart layout" }).click();
  await page.getByTestId("chart-layout-menu").getByRole("button", { name: "Four charts" }).click();
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(4);
  // Still one toolbox however many panes there are.
  await expect(toolbox).toHaveCount(1);

  // It's portalled straight to the document body and fixed to the viewport,
  // not clipped inside the focused pane — which is what lets it travel and be
  // dragged anywhere in the window, not just over the chart grid.
  expect(
    await toolbox.evaluate((bar) => bar.parentElement === document.body),
  ).toBe(true);

  // Drag it from its default spot over pane one into the bottom-right pane.
  const target = await page.getByTestId("chart-cell-4").boundingBox();
  const grip = await toolbox.boundingBox();
  expect(target).not.toBeNull();
  expect(grip).not.toBeNull();
  await page.mouse.move(grip!.x + 6, grip!.y + grip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width * 0.5, target!.y + target!.height * 0.6, {
    steps: 12,
  });
  await page.mouse.up();

  const moved = await toolbox.boundingBox();
  expect(moved!.x).toBeGreaterThan(target!.x);
  expect(moved!.y).toBeGreaterThan(target!.y);
  expect(moved!.x + moved!.width).toBeLessThanOrEqual(target!.x + target!.width + 1);

  // Focusing a different pane must not send the toolbox home — it is one shared
  // control, not a per-pane one.
  await page
    .getByTestId("chart-cell-2")
    .getByRole("img", { name: "Candlestick price chart" })
    .click({ position: { x: 40, y: 120 } });
  await expect(toolbox).toHaveCount(1);
  const afterFocus = await toolbox.boundingBox();
  expect(Math.abs(afterFocus!.x - moved!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(afterFocus!.y - moved!.y)).toBeLessThanOrEqual(2);

  // And it is remembered, like the replay toolbox's position.
  await page.reload();
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(4, {
    timeout: 30_000,
  });
  const afterReload = await page.getByRole("toolbar", { name: /Favorite tools/i }).boundingBox();
  expect(Math.abs(afterReload!.x - moved!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(afterReload!.y - moved!.y)).toBeLessThanOrEqual(2);
});

/**
 * Contrast of a glyph's painted panes against the surface behind them. Graphical
 * controls need 3:1; drawn faintly, the layout icons read as empty dark boxes on
 * a dark panel.
 */
async function glyphContrast(page: import("@playwright/test").Page, scope: string) {
  return page.evaluate((selector) => {
    type Rgba = { r: number; g: number; b: number; a: number };
    const parse = (value: string): Rgba | null => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1]!.split(",").map((part) => Number.parseFloat(part.trim()));
      const [r, g, b, a] = parts;
      if (r == null || g == null || b == null) return null;
      return { r, g, b, a: a == null ? 1 : a };
    };
    const over = (top: Rgba, bottom: Rgba): Rgba => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1,
    });
    const relative = ({ r, g, b }: Rgba) => {
      const channel = (value: number) => {
        const n = value / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };

    const pane = document.querySelector<HTMLElement>(
      `${selector} [data-testid="layout-glyph-pane"]`,
    );
    if (!pane) return -1;
    // Every backdrop under the pane, root first.
    let backdrop: Rgba = { r: 255, g: 255, b: 255, a: 1 };
    const chain: Element[] = [];
    for (let node: Element | null = pane.parentElement; node; node = node.parentElement) {
      chain.unshift(node);
    }
    for (const node of chain) {
      const layer = parse(getComputedStyle(node).backgroundColor);
      if (layer && layer.a > 0) backdrop = over(layer, backdrop);
    }
    const style = getComputedStyle(pane);
    const fill = parse(style.backgroundColor);
    if (!fill) return -1;
    const alpha = fill.a * Number.parseFloat(style.opacity || "1");
    const painted = over({ ...fill, a: alpha }, backdrop);
    const first = relative(painted);
    const second = relative(backdrop);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }, scope);
}

test("the layout controls stay legible in both themes", async ({ page }) => {
  const header = page.getByLabel("Trading header");

  for (const theme of ["dark", "light"] as const) {
    const toggle = header.getByRole("button", { name: new RegExp(`Switch to ${theme} theme`, "i") });
    if (await toggle.count()) await toggle.click();

    // The trigger's own glyph, which is all that shows before the menu opens.
    await expect
      .poll(() => glyphContrast(page, '[aria-label="Chart layout"]'), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(3);

    await page.getByRole("button", { name: "Chart layout" }).click();
    const menu = page.getByTestId("chart-layout-menu");
    await expect(menu).toBeVisible();
    // And an unselected layout in the menu, which is the faintest of the set.
    expect(
      await glyphContrast(page, '[data-testid="chart-layout-menu"] [aria-pressed="false"]'),
    ).toBeGreaterThanOrEqual(3);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  }
});

test("the timeframe bar stays in ascending order however stars are added", async ({ page }) => {
  const bar = page.locator('[aria-label="Pinned timeframes"]');
  const pinned = () => bar.getByRole("button").allInnerTexts();

  // Defaults are already ascending.
  expect(await pinned()).toEqual(["1m", "5m", "15m", "1h", "4h", "1d"]);

  const menu = page.getByRole("menu").filter({ hasText: "Timeframe" });
  await page.getByRole("button", { name: "Choose timeframe" }).click();
  await expect(menu).toBeVisible();
  // Star out of order: 4h is already on the bar, so 30m and 3m arrive last.
  await menu.getByRole("button", { name: "Pin 30m from the timeframe bar" }).click();
  await menu.getByRole("button", { name: "Pin 3m from the timeframe bar" }).click();
  await page.keyboard.press("Escape");

  // Each still lands where the eye expects it, not on the end.
  expect(await pinned()).toEqual(["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"]);

  await page.reload();
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(1, {
    timeout: 30_000,
  });
  expect(await page.locator('[aria-label="Pinned timeframes"]').getByRole("button").allInnerTexts())
    .toEqual(["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"]);
});
