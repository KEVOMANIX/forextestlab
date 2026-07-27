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

test.skip(!process.env.PERF, "performance harness — set PERF=1 to run");
test.setTimeout(180_000);

async function seed(page: Page, layout: string) {
  const response = await page.request.post("/api/backtest/sessions", {
    data: {
      name: "Perf session",
      symbols: ["EURUSD", "GBPUSD"],
      startTime: Date.parse("2024-03-05T00:00:00Z"),
      endTime: Date.parse("2024-03-08T23:59:59Z"),
    },
  });
  const body = await response.json();
  await page.goto("/app/backtest");
  await page.evaluate(
    ({ sessionId, token, layout }) => {
      window.sessionStorage.setItem(`forextestlab:session:${sessionId}`, token);
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
      // Cell 3 on a higher timeframe, to include aggregation cost.
      window.localStorage.setItem(
        `forextestlab:chart:${sessionId}:cell-3`,
        JSON.stringify({ timeframe: "15m" }),
      );
    },
    { sessionId: body.sessionId, token: body.token, layout },
  );
  await page.goto(`/app/backtest?session=${encodeURIComponent(body.sessionId)}`);
  return body.sessionId as string;
}

test("replay perf", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 950 });
  await seed(page, LAYOUT);
  await page.getByRole("img", { name: "Candlestick price chart" }).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(4000);

  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });

  // Max speed. Playwright cannot fill a range input, so drive it natively and
  // let React see the change through its own value setter.
  await page.getByLabel("Replay speed").evaluate((el) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, input.max);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(500);
  const startCandle = Number(
    /Candle (\d+) of/.exec(await page.evaluate(() => document.querySelector("p.sr-only")?.textContent ?? ""))?.[1] ?? 0,
  );
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
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
    return {
      frames: frames.length,
      fps: Math.round((frames.length / (last - start)) * 1000),
      medianFrameMs: Math.round(pct(50) * 10) / 10,
      p95FrameMs: Math.round(pct(95) * 10) / 10,
      worstFrameMs: Math.round(sorted[sorted.length - 1] ?? 0),
      jankFrames: frames.filter((f) => f > 50).length,
      longTasks: longTasks.length,
      longTaskMs: Math.round(longTasks.reduce((a, b) => a + b, 0)),
    };
  }, RUN_MS);

  const after = await page.evaluate(() => document.querySelector("p.sr-only")?.textContent ?? "");
  const advanced = Number(/Candle (\d+) of/.exec(after)?.[1] ?? 0) - startCandle;
  console.log(
    `PERF layout=${LAYOUT} throttle=${THROTTLE}x`,
    JSON.stringify({ ...stats, candlesAdvanced: advanced, candlesPerSec: Math.round((advanced / RUN_MS) * 1000) }),
  );
});
