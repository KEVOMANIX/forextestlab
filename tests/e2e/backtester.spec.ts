import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end coverage of the public backtesting workflow. Runs without any
 * login and without an external market-data API (seeded demo data).
 */

async function startSession(page: Page) {
  await page.goto("/app/backtest");
  // Wait for the setup form and its prefilled symbol/dates.
  await expect(page.getByRole("heading", { name: /Start a backtest session/i })).toBeVisible();
  await page.getByLabel("Session name").fill("E2E strategy session");
  await page.getByRole("button", { name: /Continue/i }).click();
  await page.getByRole("button", { name: /Continue/i }).click();

  // The bounded replay window is preloaded once for smooth browser-local play.
  const createResponse = page.waitForResponse(
    (r) => r.url().includes("/api/backtest/sessions") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Start session/i }).click();
  const res = await createResponse;
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(Array.isArray(body.candles)).toBe(true);
  // Only the initial visible window is returned, never the full series.
  expect(body.candles.length).toBeLessThanOrEqual(60);
  expect(body.candles.length).toBeLessThan(body.state.totalCandles);
  expect(body.replayCandles.length).toBe(body.state.totalCandles);
  expect(body.state.config.timeframe).toBe("1m");
  expect(Array.isArray(body.contextCandles)).toBe(true);
  expect(body.candles[0].timestamp).toBeGreaterThanOrEqual(
    body.state.config.startTime,
  );
  const closeTour = page.getByRole("button", { name: /Close trading tour/i });
  if (await closeTour.isVisible()) await closeTour.click();
}

test("loads pre-start context without moving the replay start", async ({ page }) => {
  const selectedStart = Date.parse("2024-03-05T00:00:00Z");
  const response = await page.request.post("/api/backtest/sessions", {
    data: {
      name: "Context boundary session",
      symbols: ["EURUSD"],
      startTime: selectedStart,
      endTime: Date.parse("2024-03-08T23:59:59Z"),
    },
  });
  const body = await response.json();
  expect(response.ok()).toBe(true);
  expect(body.contextCandles.length).toBeGreaterThan(0);
  expect(body.contextCandles.at(-1).timestamp).toBeLessThan(
    body.state.config.startTime,
  );
  expect(body.candles[0].timestamp).toBeGreaterThanOrEqual(
    body.state.config.startTime,
  );

  await page.goto("/app/backtest");
  await page.evaluate(
    ({ sessionId, token }) => {
      window.sessionStorage.setItem(
        `forextestlab:session:${sessionId}`,
        token,
      );
    },
    { sessionId: body.sessionId, token: body.token },
  );
  await page.goto(`/app/backtest?session=${encodeURIComponent(body.sessionId)}`);
  await expect(page.getByText(/Loading 1m chart history/i)).toBeHidden();
  await expect(page.getByRole("button", { name: /Display 1m candles/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const olderHistory = page.getByRole("button", { name: /Load older candles/i });
  await expect(olderHistory).toBeVisible();
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/context?")),
    olderHistory.click(),
  ]);
});

test("keeps the custom date calendar open and submits the selected period", async ({ page }) => {
  let createRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/backtest/sessions") && request.method() === "POST") {
      createRequests += 1;
    }
  });
  await page.goto("/app/backtest");
  await page.getByLabel("Session name").fill("Calendar selection session");
  await page.getByRole("button", { name: /Continue/i }).click();
  await page.getByRole("button", { name: /Continue/i }).click();

  await page.getByLabel("Start date").click();
  const startCalendar = page.getByRole("dialog", { name: /Start date calendar/i });
  await expect(startCalendar).toBeVisible();
  await expect(startCalendar.getByLabel("Calendar year")).toBeVisible();
  await startCalendar.getByLabel("Calendar year").selectOption("2024");
  await startCalendar.getByLabel("Calendar month").selectOption("2");
  expect(createRequests).toBe(0);
  await expect(page).toHaveURL(/\/app\/backtest$/);
  await startCalendar.getByRole("button", { name: "2024-03-04" }).click();
  await expect(startCalendar).toBeHidden();

  await page.getByLabel("End date").click();
  const endCalendar = page.getByRole("dialog", { name: /End date calendar/i });
  await expect(endCalendar).toBeVisible();
  await endCalendar.getByRole("button", { name: "2024-03-08" }).click();

  const createResponse = page.waitForResponse(
    (response) => response.url().includes("/api/backtest/sessions") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Start session/i }).click();
  const body = await (await createResponse).json();
  expect(body.state.config.startTime).toBe(Date.parse("2024-03-04T00:00:00Z"));
  expect(body.state.config.endTime).toBe(Date.parse("2024-03-08T23:59:59.999Z"));
});

test("completes a full public backtest workflow without login", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  // (1)(2)(3)(4) open + configure + start
  await startSession(page);

  // (3) initial candles + workspace visible
  await expect(page.getByRole("img", { name: /Candlestick price chart/i })).toBeVisible();
  const counter = page.getByText(/Candle \d+ of \d+/);
  await expect(counter).toBeVisible();
  const before = await counter.textContent();

  // (4) advance the replay a few candles
  const next = page.getByRole("button", { name: /Next candle/i });
  await next.click();
  await expect(counter).not.toHaveText(before ?? "");
  await next.click();

  // (6) place a Buy trade with (7) chart-based stop-loss and take-profit
  await page.getByRole("button", { name: /Add stop-loss line/i }).click();
  await page.getByRole("button", { name: /Add take-profit line/i }).click();
  await expect(page.getByTestId("stop-loss-line")).toBeVisible();
  await expect(page.getByTestId("take-profit-line")).toBeVisible();
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/action") && r.request().method() === "POST"),
    page.getByRole("button", { name: "Buy", exact: true }).click(),
  ]);
  await expect(page.getByText(/^Long$/i)).toBeVisible();

  // Protection levels remain interactive after entry and update the session.
  if (testInfo.project.name === "chromium") {
    const stopLine = page.getByTestId("stop-loss-line");
    await stopLine.hover();
    const stopBox = await stopLine.boundingBox();
    expect(stopBox).not.toBeNull();
    const modifiedStop = page.waitForRequest((request) => {
      if (!request.url().includes("/action")) return false;
      return (request.postDataJSON() as { type?: string } | null)?.type === "modify-stop";
    });
    await page.mouse.move(stopBox!.x + stopBox!.width / 2, stopBox!.y + stopBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(stopBox!.x + stopBox!.width / 2, stopBox!.y - 28, { steps: 5 });
    await page.mouse.up();
    await modifiedStop;
  }

  // (8) advance more candles
  await next.click();
  await next.click();

  // (9) close the position manually
  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/action") && r.request().method() === "POST"),
    page.getByRole("button", { name: /Close position/i }).click(),
  ]);

  // (10)(11) balance + statistics update; trade recorded
  await page.getByRole("button", { name: /Analytics/i }).click();
  await expect(page.getByText(/Total trades/i)).toBeVisible();
  await page.getByRole("tab", { name: /^Trades/ }).click();
  await expect(page.getByRole("cell", { name: /Long|Short/ }).first()).toBeVisible();

  // Anonymous demonstrations are temporary and do not expose saved results.
  await expect(page.getByText(/temporary demonstration/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Create a free account/i })).toBeVisible();
});

test("restarts a session", async ({ page }) => {
  await startSession(page);
  const next = page.getByRole("button", { name: /Next candle/i });
  await next.click();
  await next.click();
  await page.getByRole("button", { name: /Restart session/i }).click();
  await expect(page.getByText(/Candle \d+ of \d+/)).toBeVisible();
});

test("resumes a saved session at the last revealed candle", async ({ page }) => {
  test.setTimeout(60_000);
  await startSession(page);

  const next = page.getByRole("button", { name: /Next candle/i });
  await next.click();
  await next.click();
  await Promise.all([
    page.waitForResponse((response) => {
      if (!response.url().includes("/action")) return false;
      return (
        (response.request().postDataJSON() as { type?: string } | null)?.type ===
        "place-order"
      );
    }),
    page.getByRole("button", { name: "Buy", exact: true }).click(),
  ]);

  const counter = page.getByText(/Candle \d+ of \d+/);
  const savedCounter = await counter.textContent();
  await expect(page).toHaveURL(/\/app\/backtest\?session=/);
  await expect(page.getByText(/^Long$/i)).toBeVisible();

  await page.reload();

  await expect(page.getByText(/Session resumed:/i)).toBeVisible();
  await expect(counter).toHaveText(savedCounter ?? "");
  await expect(page.getByText(/^Long$/i)).toBeVisible();
  await expect(page.getByTestId("stop-loss-line")).toBeVisible();
  await expect(page.getByTestId("take-profit-line")).toBeVisible();

  await next.click();
  await expect(counter).not.toHaveText(savedCounter ?? "");
});

test("shows trading actions above the chart and moves the replay toolbox", async ({ page }) => {
  await startSession(page);

  const tradingHeader = page.locator('[aria-label="Trading header"]');
  const chart = page.getByRole("img", { name: /Candlestick price chart/i });
  const headerBox = await tradingHeader.boundingBox();
  const chartBox = await chart.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(chartBox).not.toBeNull();
  expect(headerBox!.y + headerBox!.height).toBeLessThanOrEqual(chartBox!.y);
  expect(headerBox!.height).toBeLessThanOrEqual(64);
  const buy = tradingHeader.getByRole("button", { name: "Buy", exact: true });
  await expect(buy).toBeVisible();
  await expect(tradingHeader.getByRole("button", { name: "Sell", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Display 1m candles/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const speedSlider = page.getByLabel("Replay speed");
  await expect(page.getByRole("button", { name: "Quick Buy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Quick Sell" })).toBeVisible();
  await expect(page.getByTestId("replay-toolbox")).not.toContainText(/Candle \d+ \/ \d+/);
  await expect(speedSlider).toHaveAttribute(
    "aria-valuetext",
    /60 times real market time, 1 step \/ 1s/,
  );
  const speedSave = page.waitForRequest((request) => {
    if (!request.url().includes("/action")) return false;
    return (
      (request.postDataJSON() as { type?: string } | null)?.type ===
      "set-speed"
    );
  });
  await speedSlider.fill("4");
  await speedSave;
  await expect(speedSlider).toHaveAttribute(
    "aria-valuetext",
    /300 times real market time, 5\.0 steps\/s/,
  );
  await Promise.all([
    page.waitForResponse((response) => {
      if (!response.url().includes("/action")) return false;
      return (
        (response.request().postDataJSON() as { type?: string } | null)?.type ===
        "place-order"
      );
    }),
    buy.click(),
  ]);
  await expect(page.getByTestId("stop-loss-line")).toBeVisible();
  await expect(page.getByTestId("take-profit-line")).toBeVisible();
  await expect(page.getByTestId("stop-loss-line")).toHaveCount(1);
  await expect(page.getByTestId("take-profit-line")).toHaveCount(1);

  await page.getByRole("button", { name: /Display 15m candles/i }).click();
  await expect(page.getByRole("button", { name: /Display 15m candles/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: /Fit chart data/i }).click();

  const toolbox = page.getByTestId("replay-toolbox");
  const handle = page.getByTestId("replay-toolbox-handle");
  await handle.hover();
  const before = await toolbox.boundingBox();
  expect(before).not.toBeNull();

  await page.mouse.move(
    before!.x + 3,
    before!.y + 3,
  );
  await page.mouse.down();
  await page.mouse.move(
    before!.x + 3,
    before!.y - 137,
    { steps: 8 },
  );
  await page.mouse.up();

  const moved = await toolbox.boundingBox();
  expect(moved).not.toBeNull();
  expect(moved!.y).toBeLessThan(before!.y - 60);

  await page.getByRole("button", { name: /Reset replay controls position/i }).click();
  const reset = await toolbox.boundingBox();
  expect(reset).not.toBeNull();
  expect(reset!.y).toBeGreaterThan(moved!.y + 60);
});

test("shows a new market order immediately while it saves", async ({ page }) => {
  await startSession(page);

  await page.route("**/api/backtest/sessions/*/action", async (route) => {
    const body = route.request().postDataJSON() as { type?: string } | null;
    if (body?.type === "place-order") {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
    }
    await route.continue();
  });

  const response = page.waitForResponse((item) => {
    if (!item.url().includes("/action")) return false;
    return (
      (item.request().postDataJSON() as { type?: string } | null)?.type ===
      "place-order"
    );
  });
  await page.getByRole("button", { name: "Buy", exact: true }).click();
  await expect(page.getByText(/^Long$/i)).toBeVisible({ timeout: 300 });
  await response;
});

test("replay advances locally and pause stays responsive during checkpoint saves", async ({ page }) => {
  test.setTimeout(45_000);
  await startSession(page);

  await page.route("**/api/backtest/sessions/*/action", async (route) => {
    const body = route.request().postDataJSON() as { type?: string } | null;
    if (body?.type === "sync") {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    await route.continue();
  });

  const counter = page.getByText(/Candle \d+ of \d+/);
  const before = await counter.textContent();
  await page.getByRole("button", { name: /Play replay/i }).click();
  const pause = page.getByRole("button", { name: /Pause replay/i });
  await expect(pause).toBeVisible();

  // Candles continue advancing while the deliberately slow save is in flight.
  await expect(counter).not.toHaveText(before ?? "", { timeout: 2_500 });
  await expect(pause).toBeEnabled();
  await expect(page.getByRole("button", { name: "Buy", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Sell", exact: true })).toBeEnabled();

  const pauseResponse = page.waitForResponse((response) => {
    if (!response.url().includes("/action")) return false;
    const body = response.request().postDataJSON() as {
      type?: string;
      status?: string;
    } | null;
    return body?.type === "sync" && body.status === "paused";
  });
  await pause.click();

  // The UI stops immediately, before the delayed checkpoint completes.
  await expect(page.getByRole("button", { name: /Play replay/i })).toBeVisible();
  await pauseResponse;

  const pausedAt = await counter.textContent();
  await page.waitForTimeout(1_500);
  await expect(counter).toHaveText(pausedAt ?? "");
});

test("mobile navigation and workflow", async ({ page }) => {
  await page.goto("/");
  const landing = page.locator("main");
  await expect(
    landing.getByRole("link", { name: /Create free account/i }),
  ).toBeVisible();

  // The landing-page launch action opens the dashboard first.
  await landing.getByRole("link", { name: /Open dashboard/i }).click();
  await expect(page.getByRole("heading", { name: /Turn every backtest/i })).toBeVisible();

  // Signed-out users can continue into the temporary demonstration.
  await page.getByRole("link", { name: /Try a temporary demo/i }).click();
  await expect(page.getByRole("heading", { name: /Start a backtest session/i })).toBeVisible();
});
