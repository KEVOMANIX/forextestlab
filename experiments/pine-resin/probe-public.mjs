import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(here, "ema-gold-15m.pine"), "utf8");
const base = process.env.PINE_TEST_URL || "https://www.forextestlab.com";
const response = await fetch(new URL("/api/strategy-tests/pine", base), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    code, symbol: "XAUUSD", source: "demo", timeframe: "15m",
    startTime: Date.UTC(2024, 2, 1), endTime: Date.UTC(2024, 2, 15) - 1,
    startingBalance: 10_000,
  }),
  signal: AbortSignal.timeout(45_000),
});
const result = await response.json();
assert.equal(response.status, 200, JSON.stringify(result));
assert.equal(result.ok, true, JSON.stringify(result));
assert.equal(result.report.symbol, "XAUUSD");
assert.equal(result.report.timeframe, "15m");
assert.ok(result.report.trades.length > 0);
console.log(JSON.stringify({ ok: true, url: base, bars: result.report.bars, trades: result.report.trades.length, netPnl: result.report.netPnl }));
