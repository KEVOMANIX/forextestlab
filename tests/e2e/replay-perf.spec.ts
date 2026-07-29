import { test, type Page } from "@playwright/test";

/**
 * Replay smoothness harness. Opt in with PERF=1; measures frame pacing,
 * long tasks and candles advanced while the replay runs at maximum speed.
 *
 *   PERF=1 PERF_LAYOUT=4 PERF_THROTTLE=2 npx playwright test tests/e2e/replay-perf --project=chromium
 */

const LAYOUT = process.env.PERF_LAYOUT ?? "1";
const THROTTLE = Number(process.env.PERF_THROTTLE ?? "4");
const RUN_MS = Number(process.env.PERF_RUN_MS ?? "20000");
const PROFILE = process.env.PERF_PROFILE === "1";
const WITH_INDICATORS = process.env.PERF_INDICATORS === "1";
const START = Date.UTC(2025, 0, 6, 8);
const CANDLE_COUNT = 7_200;

test.skip(!process.env.PERF, "performance harness — set PERF=1 to run");
test.setTimeout(180_000);

async function seed(page: Page, layout: string) {
  const candle = (index: number, offset = 0) => {
    const open = 1.08 + offset + index * 0.000001;
    const close = open + (index % 2 ? -0.00004 : 0.00004);
    return {
      timestamp: START + index * 60_000,
      open: open.toFixed(5),
      high: (Math.max(open, close) + 0.00008).toFixed(5),
      low: (Math.min(open, close) - 0.00008).toFixed(5),
      close: close.toFixed(5),
      volume: "100",
      source: "perf",
    };
  };
  const replayCandles = Array.from({ length: CANDLE_COUNT }, (_, index) =>
    candle(index),
  );
  const pairCandles = Array.from({ length: CANDLE_COUNT }, (_, index) =>
    candle(index, 0.18),
  );
  const contextCandles = Array.from({ length: 600 }, (_, index) => ({
    ...candle(index),
    timestamp: START - (600 - index) * 60_000,
  }));
  const sessionId = "replay-perf";
  const initialVisibleCount = 300;
  const state = {
    sessionId,
    config: {
      name: "Perf session",
      symbols: ["EURUSD", "GBPUSD"],
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
      initialVisibleCount,
    },
    status: "idle",
    speed: 60,
    visibleIndex: initialVisibleCount - 1,
    totalCandles: replayCandles.length,
    balance: "10000.00",
    equity: "10000.00",
    maxEquity: "10000.00",
    maxDrawdown: "0.00",
    maxDrawdownPercent: "0.0",
    currentPrice: replayCandles[initialVisibleCount - 1]!.close,
    currentTime: replayCandles[initialVisibleCount - 1]!.timestamp,
    openPositions: [],
    closedTrades: [],
    pendingOrders: [],
    bookmarks: [],
    equityCurve: [],
    lockedBeforeIndex: 0,
    dataSource: "perf",
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
        token: "perf-token",
        state,
        candles: replayCandles.slice(0, initialVisibleCount),
        replayCandles,
        contextCandles,
      }),
    });
  });
  await page.route("**/api/backtest/sessions/*/action", async (route) => {
    const action = route.request().postDataJSON() as {
      type?: string;
      speed?: number;
    };
    const responseState =
      action.type === "set-speed" && action.speed
        ? { ...state, speed: action.speed }
        : state;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, state: responseState, newCandle: null }),
    });
  });
  await page.route("**/api/backtest/sessions/*/pair?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        symbol: "GBPUSD",
        candles: pairCandles,
        contextCandles,
        pipSize: "0.0001",
        pricePrecision: 5,
      }),
    });
  });
  await page.route("**/api/backtest/sessions/*/context?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        candles: contextCandles,
        hasMore: false,
        timeframe: "1m",
      }),
    });
  });
  await page.addInitScript(
    ({ sessionId, layout, withIndicators }) => {
      window.localStorage.setItem("forextestlab:onboarding:trading", "done");
      const cells = [
        { id: "cell-1", symbol: "EURUSD", timeframe: null },
        { id: "cell-2", symbol: "GBPUSD", timeframe: null },
        { id: "cell-3", symbol: "EURUSD", timeframe: null },
        { id: "cell-4", symbol: "EURUSD", timeframe: null },
      ];
      window.localStorage.setItem(
        `forextestlab:layout:${sessionId}`,
        JSON.stringify({ layout, cells, focusedId: "cell-1" }),
      );
      window.localStorage.setItem(
        `forextestlab:chart:${sessionId}:cell-3`,
        JSON.stringify({
          timeframe: "15m",
          indicators: withIndicators
            ? [
                { id: "perf-rsi", kind: "rsi", length: 14, visible: true },
                { id: "perf-ema", kind: "ema", length: 20, visible: true },
              ]
            : [],
        }),
      );
    },
    { sessionId, layout, withIndicators: WITH_INDICATORS },
  );
  await page.goto("/app/backtest?trial=instant");
}

test("replay perf", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 950 });
  await seed(page, LAYOUT);
  await page
    .getByRole("img", { name: "Candlestick price chart" })
    .first()
    .waitFor({ timeout: 30_000 });
  await page.waitForTimeout(4000);

  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  if (PROFILE) {
    await client.send("Profiler.enable");
    await client.send("Profiler.setSamplingInterval", { interval: 200 });
  }

  // Max speed. Playwright cannot fill a range input, so drive it natively and
  // let React see the change through its own value setter.
  await page.getByLabel("Replay speed").evaluate((el) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, input.max);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(500);
  const startCandle = Number(
    /Candle (\d+) of/.exec(
      await page.evaluate(
        () => document.querySelector("p.sr-only")?.textContent ?? "",
      ),
    )?.[1] ?? 0,
  );
  await page.evaluate(() => {
    (
      window as Window & {
        __FOREXTESTLAB_REPLAY_METRICS__?: Record<string, unknown>;
      }
    ).__FOREXTESTLAB_REPLAY_METRICS__ = {};
  });
  if (PROFILE) await client.send("Profiler.start");
  await page.getByRole("button", { name: /^Play/i }).first().click();

  const stats = await page.evaluate(async (runMs) => {
    const frames: number[] = [];
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ entryTypes: ["longtask"] });
    let last = performance.now();
    const start = last;
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        frames.push(now - last);
        last = now;
        if (now - start >= runMs) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    observer.disconnect();
    const sorted = [...frames].sort((a, b) => a - b);
    const pct = (p: number) =>
      sorted[
        Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
      ] ?? 0;
    return {
      frames: frames.length,
      fps: Math.round((frames.length / (last - start)) * 1000),
      medianFrameMs: Math.round(pct(50) * 10) / 10,
      p95FrameMs: Math.round(pct(95) * 10) / 10,
      worstFrameMs: Math.round(sorted[sorted.length - 1] ?? 0),
      jankFrames: frames.filter((frame) => frame > 50).length,
      longTasks: longTasks.length,
      longTaskMs: Math.round(longTasks.reduce((total, task) => total + task, 0)),
      replayMetrics:
        (
          window as Window & {
            __FOREXTESTLAB_REPLAY_METRICS__?: Record<string, unknown>;
          }
        ).__FOREXTESTLAB_REPLAY_METRICS__ ?? {},
    };
  }, RUN_MS);

  const after = await page.evaluate(
    () => document.querySelector("p.sr-only")?.textContent ?? "",
  );
  const advanced =
    Number(/Candle (\d+) of/.exec(after)?.[1] ?? 0) - startCandle;
  let profileRows:
    | { ms: number; fn: string; at: string }[]
    | undefined;
  if (PROFILE) {
    const { profile } = (await client.send("Profiler.stop")) as {
      profile: {
        nodes: {
          id: number;
          callFrame: {
            functionName: string;
            url: string;
            lineNumber: number;
          };
        }[];
        samples?: number[];
        timeDeltas?: number[];
      };
    };
    const selfTime = new Map<number, number>();
    const byId = new Map(profile.nodes.map((node) => [node.id, node]));
    for (let index = 0; index < (profile.samples?.length ?? 0); index += 1) {
      const id = profile.samples![index]!;
      selfTime.set(
        id,
        (selfTime.get(id) ?? 0) +
          Math.max(0, profile.timeDeltas?.[index] ?? 0),
      );
    }
    profileRows = [...selfTime.entries()]
      .map(([id, microseconds]) => {
        const frame = byId.get(id)?.callFrame;
        return {
          ms: Math.round(microseconds / 1_000),
          fn: frame?.functionName || "(anonymous)",
          at: `${(frame?.url ?? "").split("/").at(-1) ?? ""}:${frame?.lineNumber ?? ""}`,
        };
      })
      .filter((row) => row.ms > 20)
      .sort((left, right) => right.ms - left.ms)
      .slice(0, 30);
  }
  console.log(
    `PERF layout=${LAYOUT} throttle=${THROTTLE}x`,
    JSON.stringify({
      ...stats,
      candlesAdvanced: advanced,
      candlesPerSec: Math.round((advanced / RUN_MS) * 1000),
    }),
  );
  if (profileRows) {
    console.log(
      "PROFILE TOP SELF TIME\n" +
        profileRows
          .map(
            (row) =>
              `${String(row.ms).padStart(6)}ms  ${row.fn}  @${row.at}`,
          )
          .join("\n"),
    );
  }
});
