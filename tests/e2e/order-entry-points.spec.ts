import { expect, test, type Page } from "@playwright/test";

type TradingSettings = {
  oneClickTrading?: boolean;
  pauseOnTradeClose?: boolean;
  promptEntryReason?: boolean;
};

async function openSession(
  page: Page,
  settings: TradingSettings = {},
) {
  const sessionId = "order-entry-points-e2e";
  const start = Date.UTC(2025, 0, 6, 8);
  const replayCandles = Array.from({ length: 180 }, (_, index) => {
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
  });
  const state = {
    sessionId,
    config: {
      name: "Order entry points",
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
    pendingOrders: [],
    bookmarks: [],
    equityCurve: [{
      index: 59,
      time: replayCandles[59]!.timestamp,
      balance: "10000.00",
      equity: "10000.00",
    }],
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
        contextCandles: [],
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
  await page.addInitScript(
    ({ sessionId, settings }) => {
      window.localStorage.setItem(
        "forextestlab:onboarding:trading",
        "done",
      );
      window.localStorage.setItem(
        `forextestlab:chart-settings:${sessionId}`,
        JSON.stringify(settings),
      );
    },
    { sessionId, settings },
  );
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/app/backtest?trial=instant");
  await expect(
    page.getByRole("img", { name: "Candlestick price chart" }),
  ).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Desktop trading overlays are covered in Chromium.",
  );
});

test("chart and replay quotes open the same draggable planner", async ({
  page,
}) => {
  await openSession(page);

  const panel = page.getByTestId("trade-order-panel");
  await expect(panel).toBeHidden();

  await page.getByRole("button", { name: /Buy plan at/i }).click();
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("trade-plan-overlay")).toHaveAttribute(
    "data-direction",
    "long",
  );
  await page.getByRole("button", { name: "Clear trade plan" }).click();

  await page.getByRole("button", { name: "Quick Sell" }).click();
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("trade-plan-overlay")).toHaveAttribute(
    "data-direction",
    "short",
  );
  await expect(page.getByTestId("position-entry-line")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear trade plan" }).click();

  await page.getByRole("button", { name: "Quick Buy" }).click();
  await expect(panel).toBeVisible();
  const placed = page.waitForResponse((response) => {
    if (!response.url().includes("/action")) return false;
    return (
      response.request().postDataJSON() as {
        type?: string;
        direction?: string;
      } | null
    )?.type === "place-order" &&
      (
        response.request().postDataJSON() as {
          direction?: string;
        }
      ).direction === "long";
  });
  await page
    .getByRole("button", { name: /Buy.*EURUSD MARKET/i })
    .click();
  await placed;

  await expect(panel).toBeHidden();
  await expect(page.getByTestId("position-entry-line")).toHaveCount(1);
});

test("a one-click replay quote places the order with a single click", async ({
  page,
}) => {
  await openSession(page, {
    oneClickTrading: true,
    pauseOnTradeClose: false,
    promptEntryReason: false,
  });

  const placed = page.waitForResponse((response) => {
    if (!response.url().includes("/action")) return false;
    const action = response.request().postDataJSON() as {
      type?: string;
      direction?: string;
    } | null;
    return action?.type === "place-order" && action.direction === "short";
  });
  await page.getByRole("button", { name: "Quick Sell" }).click();
  await placed;

  // One click means one click: no confirmation, and no planner in between.
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByTestId("trade-order-panel")).toBeHidden();
  await expect(page.getByTestId("position-entry-line")).toHaveCount(1);
});

test("price-sensitive trade dialogs pause and restore a running replay", async ({
  page,
}) => {
  await openSession(page);

  await page.getByRole("button", { name: "Play replay" }).click();
  await expect(page.getByRole("button", { name: "Pause replay" })).toBeVisible();

  await page.getByRole("button", { name: "Quick Buy" }).click();
  await expect(page.getByTestId("trade-order-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play replay" })).toBeVisible();

  await page.getByRole("button", { name: "Clear trade plan" }).click();
  await expect(page.getByTestId("trade-order-panel")).toBeHidden();
  await expect(page.getByRole("button", { name: "Pause replay" })).toBeVisible();

  // Opening the planner while already paused must not start the replay later.
  await page.getByRole("button", { name: "Pause replay" }).click();
  await page.getByRole("button", { name: "Quick Sell" }).click();
  await page.getByRole("button", { name: "Clear trade plan" }).click();
  await expect(page.getByRole("button", { name: "Play replay" })).toBeVisible();
});

test("previous candle rewinds the mounted chart without reloading it", async ({
  page,
}) => {
  await openSession(page);

  const chart = page.getByRole("img", { name: "Candlestick price chart" });
  await chart.evaluate((element) => {
    element.setAttribute("data-rewind-instance", "same-chart");
  });
  const counter = page.getByText(/Candle \d+ of \d+/);
  const startingCounter = await counter.textContent();

  await page.getByRole("button", { name: "Next candle" }).click();
  await expect(counter).not.toHaveText(startingCounter ?? "");

  const rewound = page.waitForResponse((response) =>
    response.url().includes("/action") &&
    (response.request().postDataJSON() as { type?: string } | null)?.type ===
      "prev",
  );
  await page.getByRole("button", { name: "Previous candle" }).click();
  await rewound;

  await expect(counter).toHaveText(startingCounter ?? "");
  await expect(chart).toHaveAttribute("data-rewind-instance", "same-chart");
});

test("managing an open position pauses until the editor closes", async ({
  page,
}) => {
  await openSession(page, {
    oneClickTrading: true,
    pauseOnTradeClose: false,
    promptEntryReason: false,
  });

  const placed = page.waitForResponse((response) =>
    response.url().includes("/action") &&
    (response.request().postDataJSON() as { type?: string } | null)?.type ===
      "place-order",
  );
  await page.getByRole("button", { name: "Quick Buy" }).click();
  await placed;
  await page.getByRole("button", { name: "Play replay" }).click();

  await page.getByRole("button", { name: "Manage buy position" }).click();
  await expect(page.getByRole("heading", { name: "Manage position" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play replay" })).toBeVisible();

  await page.getByRole("button", { name: "Close position editor" }).click();
  await expect(page.getByRole("button", { name: "Pause replay" })).toBeVisible();

  await page.getByRole("button", { name: /Open Positions/ }).click();
  await page.getByRole("button", { name: "Close all positions" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Close all open positions?" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Play replay" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Pause replay" })).toBeVisible();
});

test("diagnostics measures replay without replacing its controls", async ({
  page,
}) => {
  await openSession(page);

  const counter = page.getByText(/Candle \d+ of \d+/);
  const before = await counter.textContent();
  await page
    .getByRole("button", { name: "Trading experience settings" })
    .click();
  const experience = page.getByRole("dialog", {
    name: "Trading experience settings",
  });
  await expect(experience).toBeVisible();
  await experience
    .getByRole("button", { name: /Replay diagnostics/i })
    .click();

  const diagnostics = page.getByTestId("replay-diagnostics");
  await expect(diagnostics).toBeVisible();
  await expect(
    diagnostics.getByTestId("diagnostics-requested-rate"),
  ).toHaveText("1.0m/s");
  await expect(
    diagnostics.getByTestId("diagnostics-fps"),
  ).toHaveText(/\d+ FPS/);
  await expect(
    page.getByRole("button", { name: "Play replay" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Play replay" }).click();
  await expect(counter).not.toHaveText(before ?? "", { timeout: 4_000 });
  await expect(
    diagnostics.getByTestId("diagnostics-observed-rate"),
  ).not.toHaveText(/Paused|Sampling/, { timeout: 4_000 });

  await page.getByRole("button", { name: "Pause replay" }).click();
  await expect(
    page.getByRole("button", { name: "Play replay" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close replay diagnostics" })
    .click();
  await expect(diagnostics).toBeHidden();
});
