import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end coverage of the public backtesting workflow. Runs without any
 * login and without an external market-data API (seeded demo data).
 */

async function startSession(page: Page) {
  await page.goto("/app/backtest");
  const trialButton = page.getByRole("button", { name: /Start trial session/i });
  if (await trialButton.isVisible()) {
    const response = await page.request.post("/api/backtest/sessions", {
      data: {
        name: "E2E strategy session",
        symbols: ["EURUSD"],
        startTime: Date.parse("2024-03-05T00:00:00Z"),
        endTime: Date.parse("2024-03-08T23:59:59Z"),
      },
    });
    const body = await response.json();
    expect(response.ok()).toBe(true);
    expect(body.replayCandles.length).toBe(body.state.totalCandles);
    await page.evaluate(
      ({ sessionId, token }) => {
        window.sessionStorage.setItem(
          `forextestlab:session:${sessionId}`,
          token,
        );
      },
      { sessionId: body.sessionId, token: body.token },
    );
    await page.goto(
      `/app/backtest?session=${encodeURIComponent(body.sessionId)}`,
    );
    const closeTour = page.getByRole("button", {
      name: /Close trading tour/i,
    });
    if (await closeTour.isVisible()) await closeTour.click();
    return;
  }
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

async function dragProtectionHandle(
  page: Page,
  testId: "add-stop-loss-handle" | "add-take-profit-handle",
  deltaY: number,
  actionType: "modify-stop" | "modify-target",
) {
  const handle = page.getByTestId(testId);
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const response = page.waitForResponse((candidate) => {
    if (!candidate.url().includes("/action")) return false;
    return (
      (candidate.request().postDataJSON() as { type?: string } | null)?.type ===
      actionType
    );
  });
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2,
    box!.y + box!.height / 2 + deltaY,
    { steps: 8 },
  );
  await page.mouse.up();
  await response;
}

async function dragActiveProtectionLine(
  page: Page,
  testId: "stop-loss-line" | "take-profit-line",
  deltaY: number,
  actionType: "modify-stop" | "modify-target",
) {
  const line = page.getByTestId(testId);
  const box = await line.boundingBox();
  expect(box).not.toBeNull();
  const response = page.waitForResponse((candidate) => {
    if (!candidate.url().includes("/action")) return false;
    return (
      (candidate.request().postDataJSON() as { type?: string } | null)?.type ===
      actionType
    );
  });
  await page.mouse.move(box!.x + box!.width * 0.4, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width * 0.4,
    box!.y + box!.height / 2 + deltaY,
    { steps: 8 },
  );
  await page.mouse.up();
  await response;
}

test("builds and places a chart-connected trade plan", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await startSession(page);

  await expect(page.getByTestId("trade-order-panel")).toBeHidden();
  await page.getByRole("button", { name: /Buy plan/i }).click();
  await expect(page.getByTestId("trade-order-panel")).toBeVisible();
  await expect(page.getByTestId("trade-plan-overlay")).toHaveAttribute(
    "data-direction",
    "long",
  );
  await expect(page.getByTestId("trade-plan-entryPrice")).toBeVisible();
  await expect(page.getByTestId("trade-plan-stopLoss")).toHaveCount(0);
  await expect(page.getByTestId("trade-plan-takeProfit")).toHaveCount(0);

  if (testInfo.project.name === "chromium") {
    const chartBox = await page.getByTestId("chart-cell-1").boundingBox();
    const panel = page.getByTestId("trade-order-panel");
    const centeredBox = await panel.boundingBox();
    expect(chartBox).not.toBeNull();
    expect(centeredBox).not.toBeNull();
    expect(
      Math.abs(
        centeredBox!.x +
          centeredBox!.width / 2 -
          (chartBox!.x + chartBox!.width / 2),
      ),
    ).toBeLessThan(35);

    const handle = page.getByTestId("trade-order-drag-handle");
    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2,
      handleBox!.y + handleBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2 + 60,
      handleBox!.y + handleBox!.height / 2 + 35,
      { steps: 5 },
    );
    await page.mouse.up();
    const movedBox = await panel.boundingBox();
    expect(movedBox!.x).toBeGreaterThan(centeredBox!.x + 30);
    expect(movedBox!.y).toBeGreaterThanOrEqual(centeredBox!.y);
  }

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/action") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: /Buy.*EURUSD MARKET/i }).click(),
  ]);
  await expect(page.getByTestId("trade-order-panel")).toBeHidden();
  await expect(page.getByRole("button", { name: /Buy plan/i })).toBeVisible();
  await expect(page.getByTestId("trade-plan-overlay")).toBeHidden();
  await expect(page.getByTestId("position-entry-line")).toHaveCount(1);
  await expect(page.getByTestId("stop-loss-line")).toHaveCount(0);
  await expect(page.getByTestId("take-profit-line")).toHaveCount(0);
  await expect(page.getByTestId("add-stop-loss-handle")).toBeVisible();
  await expect(page.getByTestId("add-take-profit-handle")).toBeVisible();

  if (testInfo.project.name === "chromium") {
    await dragProtectionHandle(
      page,
      "add-stop-loss-handle",
      55,
      "modify-stop",
    );
    await expect(page.getByTestId("stop-loss-line")).toBeVisible();
    await expect(page.getByTestId("add-stop-loss-handle")).toHaveCount(0);
    await Promise.all([
      page.waitForResponse((response) => {
        if (!response.url().includes("/action")) return false;
        return (
          (response.request().postDataJSON() as { type?: string } | null)?.type ===
          "modify-stop"
        );
      }),
      page
        .getByRole("button", { name: "Remove stop loss" })
        .evaluate((button: HTMLButtonElement) => button.click()),
    ]);
    await expect(page.getByTestId("stop-loss-line")).toHaveCount(0);
    await expect(page.getByTestId("add-stop-loss-handle")).toBeVisible();

    await dragProtectionHandle(
      page,
      "add-take-profit-handle",
      -55,
      "modify-target",
    );
    await expect(page.getByTestId("take-profit-line")).toBeVisible();
    await expect(page.getByTestId("add-take-profit-handle")).toHaveCount(0);
    await dragActiveProtectionLine(
      page,
      "take-profit-line",
      -24,
      "modify-target",
    );
  }

  await page.getByRole("button", { name: "Manage buy position" }).click();
  await expect(
    page.getByRole("heading", { name: "Manage position" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "25%" })).toBeVisible();
  await expect(page.getByRole("button", { name: "50%" })).toBeVisible();
  await expect(page.getByRole("button", { name: "75%" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close all" })).toBeVisible();
  await expect(page.getByLabel("Live position performance")).toBeVisible();
  await expect(page.getByText("Remaining risk")).toBeVisible();
  await expect(page.getByRole("button", { name: "Move to break-even" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Trailing stop" })).toBeVisible();
  await expect(page.getByLabel("Custom lot amount")).toBeVisible();

  await page.getByLabel("Custom lot amount").fill("0.02");
  await Promise.all([
    page.waitForResponse((response) => {
      if (!response.url().includes("/action")) return false;
      const action = response.request().postDataJSON() as {
        type?: string;
        lots?: string;
      } | null;
      return action?.type === "close" && action.lots === "0.02";
    }),
    page.getByRole("button", { name: "Close lots" }).click(),
  ]);
  await expect(
    page.getByRole("heading", { name: "Manage position" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("position-entry-line")).toContainText("0.08");

  await page.getByRole("button", { name: "Manage buy position" }).click();
  await page.getByRole("switch", { name: "Trailing stop" }).click();
  await page.getByLabel("Distance in pips").fill("12");
  await Promise.all([
    page.waitForResponse((response) => {
      if (!response.url().includes("/action")) return false;
      const action = response.request().postDataJSON() as {
        type?: string;
        pips?: string;
      } | null;
      return action?.type === "modify-trailing" && action.pips === "12";
    }),
    page.getByRole("button", { name: "Apply" }).click(),
  ]);
  await page.getByRole("button", { name: "Close position editor" }).click();
  await expect(page.getByTestId("stop-loss-line")).toContainText("TRAIL");
  await expect(page.getByTestId("trade-line-key")).toContainText("Planned");
  await expect(page.getByTestId("trade-line-key")).toContainText("Pending");
  await expect(page.getByTestId("trade-line-key")).toContainText("Active");
});

test("places, modifies and cancels a pending order from the chart", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await startSession(page);

  await page.getByRole("button", { name: /Buy plan/i }).click();
  await page.getByRole("tab", { name: "limit" }).click();
  await expect(page.getByLabel("Pending order expiry")).toBeVisible();
  await page.getByLabel("Pending order expiry").selectOption("60");

  const placeResponse = page.waitForResponse((response) => {
    if (!response.url().includes("/action")) return false;
    const action = response.request().postDataJSON() as {
      type?: string;
      orderType?: string;
      expiresAt?: number;
    } | null;
    return action?.type === "place-order" &&
      action.orderType === "limit" &&
      typeof action.expiresAt === "number";
  });
  await page.getByRole("button", { name: /Buy.*EURUSD LIMIT/i }).click();
  await placeResponse;

  const line = page.getByTestId("pending-order-line");
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("data-line-state", "pending");
  await expect(line).toContainText("PENDING · BUY LIMIT");
  await expect(page.getByTestId("position-entry-line")).toHaveCount(0);

  if (testInfo.project.name === "chromium") {
    const box = await line.boundingBox();
    expect(box).not.toBeNull();
    const modifyResponse = page.waitForResponse((response) => {
      if (!response.url().includes("/action")) return false;
      return (
        response.request().postDataJSON() as { type?: string } | null
      )?.type === "modify-pending";
    });
    await page.mouse.move(box!.x + box!.width * 0.4, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box!.x + box!.width * 0.4,
      box!.y + box!.height / 2 + 25,
      { steps: 6 },
    );
    await page.mouse.up();
    await modifyResponse;
  }

  await page.getByRole("tab", { name: /Pending Orders/i }).click();
  await expect(page.getByRole("tabpanel")).toContainText("pending");
  await expect(page.getByRole("tabpanel")).toContainText("limit");

  const cancelResponse = page.waitForResponse((response) => {
    if (!response.url().includes("/action")) return false;
    return (
      response.request().postDataJSON() as { type?: string } | null
    )?.type === "cancel-pending";
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await cancelResponse;
  await expect(page.getByTestId("pending-order-line")).toHaveCount(0);
  await expect(page.getByRole("tabpanel")).toContainText("cancelled");
});

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

test("completes a full public backtest workflow without login", async ({ page }) => {
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

  // (6) Build a Buy plan. Protection is added from the live entry line.
  await page.getByRole("button", { name: /Buy plan/i }).click();
  await expect(page.getByTestId("trade-order-panel")).toBeVisible();
  await expect(page.getByTestId("trade-plan-entryPrice")).toBeVisible();
  await expect(page.getByTestId("trade-plan-stopLoss")).toHaveCount(0);
  await expect(page.getByTestId("trade-plan-takeProfit")).toHaveCount(0);

  // (7) place the planned market trade.
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/action") && r.request().method() === "POST"),
    page.getByRole("button", { name: /Buy.*EURUSD MARKET/i }).click(),
  ]);
  await expect(page.getByTestId("trade-plan-overlay")).toBeHidden();
  await expect(page.getByTestId("position-entry-line")).toHaveCount(1);
  await expect(page.getByTestId("add-stop-loss-handle")).toBeVisible();
  await expect(page.getByTestId("add-take-profit-handle")).toBeVisible();

  // (8) advance more candles
  await next.click();
  await next.click();

  // (9) manage the position from its chart entry line and close it manually
  await page.getByRole("button", { name: /Manage buy position/i }).click();
  await expect(page.getByRole("heading", { name: "Manage position" })).toBeVisible();
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/action") && r.request().method() === "POST"),
    page.getByRole("button", { name: /Close all/i }).click(),
  ]);

  // (10)(11) balance + statistics update; trade recorded
  await page
    .getByRole("button", { name: /Analytics/i })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByText(/Total trades/i)).toBeVisible();
  await page.getByRole("tab", { name: /^Trades/ }).click();
  await expect(page.getByRole("cell", { name: /Long|Short/ }).first()).toBeVisible();

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
  await expect(page.getByTestId("position-entry-line")).toBeVisible();
  await expect(page.getByTestId("add-stop-loss-handle")).toBeVisible();
  await expect(page.getByTestId("add-take-profit-handle")).toBeVisible();

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
  await expect(page.getByTestId("position-entry-line")).toHaveCount(1);
  await expect(page.getByTestId("stop-loss-line")).toHaveCount(0);
  await expect(page.getByTestId("take-profit-line")).toHaveCount(0);
  await expect(page.getByTestId("add-stop-loss-handle")).toHaveCount(1);
  await expect(page.getByTestId("add-take-profit-handle")).toHaveCount(1);

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

test("creates a trade journal with an entry snapshot", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await startSession(page);
  if (testInfo.project.name === "mobile") {
    const sessionId = new URL(page.url()).searchParams.get("session");
    expect(sessionId).toBeTruthy();
    const token = await page.evaluate((id) => window.sessionStorage.getItem(`forextestlab:session:${id}`), sessionId);
    const response = await page.request.post(`/api/backtest/sessions/${sessionId}/action`, {
      headers: token ? { "x-session-token": token } : undefined,
      data: {
        type: "place-order",
        direction: "long",
        sizingMode: "fixed-lots",
        lots: "0.10",
      },
    });
    expect(response.ok()).toBe(true);
    await page.reload();
    const tour = page.getByRole("button", { name: /Close trading tour/i });
    await tour.waitFor({ state: "visible" });
    await tour.click();
  } else {
    await Promise.all([
      page.waitForResponse((response) => {
        if (!response.url().includes("/action")) return false;
        return (
          (response.request().postDataJSON() as { type?: string } | null)?.type ===
          "place-order"
        );
      }),
      page.getByRole("button", { name: "Quick Buy", exact: true }).click({ force: true }),
    ]);
  }

  await page.getByRole("tab", { name: /Journal/i }).click();
  await expect(page.getByText("Trade journals", { exact: true })).toBeVisible();
  await page.getByText("Chart snapshots", { exact: false }).click({ force: true });
  await expect(page.getByLabel("Before entry candlestick snapshot")).toBeVisible();
  await expect(page.getByText("Planned R:R", { exact: true })).toBeVisible();
  await expect(page.getByText("Realized R", { exact: true })).toBeVisible();
  const entryReason = page.getByPlaceholder("Why was this entry valid?");
  await entryReason.fill("Breakout retest at London open");
  await expect(entryReason).toHaveValue("Breakout retest at London open");
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
