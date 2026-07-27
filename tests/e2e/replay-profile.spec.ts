import { test, type Page } from "@playwright/test";

/**
 * CPU profile of a running replay; prints the hottest functions by self time.
 * Opt in with PERF=1.
 *
 *   PERF=1 npx playwright test tests/e2e/replay-profile --project=chromium
 */

const LAYOUT = process.env.PERF_LAYOUT ?? "4";
const RUN_MS = Number(process.env.PERF_RUN_MS ?? "12000");

test.skip(!process.env.PERF, "performance harness — set PERF=1 to run");
test.setTimeout(180_000);

async function seed(page: Page, layout: string) {
  const response = await page.request.post("/api/backtest/sessions", {
    data: {
      name: "Profile session",
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
        JSON.stringify({ layout, cells, focusedId: "cell-1", syncCrosshair: true, syncTime: true }),
      );
      window.localStorage.setItem(
        `forextestlab:chart:${sessionId}:cell-3`,
        JSON.stringify({ timeframe: "15m" }),
      );
    },
    { sessionId: body.sessionId, token: body.token, layout },
  );
  await page.goto(`/app/backtest?session=${encodeURIComponent(body.sessionId)}`);
}

test("profile replay", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 950 });
  await seed(page, LAYOUT);
  await page.getByRole("img", { name: "Candlestick price chart" }).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(4000);

  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await client.send("Profiler.enable");
  await client.send("Profiler.setSamplingInterval", { interval: 200 });

  await page.getByLabel("Replay speed").evaluate((el) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, input.max);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^Play/i }).first().click();
  await client.send("Profiler.start");
  await page.waitForTimeout(RUN_MS);
  const { profile } = (await client.send("Profiler.stop")) as {
    profile: {
      nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number }[];
      samples?: number[];
      timeDeltas?: number[];
    };
  };

  const selfTime = new Map<number, number>();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i += 1) {
    const id = samples[i]!;
    selfTime.set(id, (selfTime.get(id) ?? 0) + Math.max(0, deltas[i] ?? 0));
  }
  const rows = [...selfTime.entries()]
    .map(([id, us]) => {
      const node = byId.get(id);
      const frame = node?.callFrame;
      const file = (frame?.url ?? "").split("/").slice(-1)[0] ?? "";
      return {
        ms: Math.round(us / 1000),
        fn: frame?.functionName || "(anonymous)",
        at: `${file}:${frame?.lineNumber ?? ""}`,
      };
    })
    .filter((r) => r.ms > 20)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 30);
  console.log("PROFILE TOP SELF TIME\n" + rows.map((r) => `${String(r.ms).padStart(6)}ms  ${r.fn}  @${r.at}`).join("\n"));
});
