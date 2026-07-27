import { expect, test, type Page } from "@playwright/test";

/**
 * The text and label tools: click the chart, type, and the note stays.
 *
 * These were unusable — the editor opened focused, but the pointerup from the
 * very click that created the drawing blurred it, and an empty commit deleted
 * the drawing before a key could be pressed.
 */

async function openSession(page: Page) {
  const response = await page.request.post("/api/backtest/sessions", {
    data: {
      name: "Text tool session",
      symbols: ["EURUSD"],
      startTime: Date.parse("2024-03-05T00:00:00Z"),
      endTime: Date.parse("2024-03-08T23:59:59Z"),
    },
  });
  const body = await response.json();
  expect(response.ok()).toBe(true);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/app/backtest");
  await page.evaluate(
    ({ sessionId, token }) => {
      window.sessionStorage.setItem(`forextestlab:session:${sessionId}`, token);
      window.localStorage.setItem("forextestlab:onboarding:trading", "done");
      window.localStorage.removeItem(`forextestlab:drawings:${sessionId}:EURUSD`);
    },
    { sessionId: body.sessionId, token: body.token },
  );
  await page.goto(`/app/backtest?session=${encodeURIComponent(body.sessionId)}`);
  await expect(page.getByRole("img", { name: "Candlestick price chart" })).toHaveCount(1, {
    timeout: 30_000,
  });
  await page.waitForTimeout(3000);
  return body.sessionId as string;
}

async function drawingCount(page: Page, sessionId: string) {
  return page.evaluate((id) => {
    const raw = window.localStorage.getItem(`forextestlab:drawings:${id}:EURUSD`);
    return raw ? (JSON.parse(raw) as unknown[]).length : 0;
  }, sessionId);
}

for (const tool of ["Text", "Label"] as const) {
  test(`the ${tool.toLowerCase()} tool keeps what you type`, async ({ page }) => {
    const sessionId = await openSession(page);
    const chart = page.getByRole("img", { name: "Candlestick price chart" });
    const box = (await chart.boundingBox())!;

    await page.getByRole("button", { name: /Text & notes/i }).click();
    await page.getByRole("button", { name: new RegExp(`^${tool}$`, "i") }).click();
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.35);

    // The editor must survive the click that opened it.
    const editor = page.getByLabel("Drawing text");
    await expect(editor).toBeVisible();
    await expect(editor).toBeFocused();

    await editor.fill(`${tool} note`);
    await page.keyboard.press("Enter");
    await expect(editor).toHaveCount(0);

    expect(await drawingCount(page, sessionId)).toBe(1);

    // And it is still there after a reload, with its text.
    await page.reload();
    await expect(chart).toHaveCount(1, { timeout: 30_000 });
    await page.waitForTimeout(2500);
    const stored = await page.evaluate((id) => {
      const raw = window.localStorage.getItem(`forextestlab:drawings:${id}:EURUSD`);
      return raw ?? "";
    }, sessionId);
    expect(stored).toContain(`${tool} note`);
  });
}

test("an editor dismissed without typing leaves no empty drawing behind", async ({ page }) => {
  const sessionId = await openSession(page);
  const chart = page.getByRole("img", { name: "Candlestick price chart" });
  const box = (await chart.boundingBox())!;

  await page.getByRole("button", { name: /Text & notes/i }).click();
  await page.getByRole("button", { name: /^Text$/i }).click();
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.35);
  await expect(page.getByLabel("Drawing text")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Drawing text")).toHaveCount(0);
  expect(await drawingCount(page, sessionId)).toBe(0);
});
