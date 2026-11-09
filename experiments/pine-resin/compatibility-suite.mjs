import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const worker = join(root, "workers/pine-resin-worker.mjs");
const candles = Array.from({ length: 120 }, (_, index) => {
  const close = 1.08 + Math.sin(index / 5) * 0.004;
  return { timestamp: Date.UTC(2026, 0, 2) + index * 3_600_000, open: close, high: close + 0.001, low: close - 0.001, close, volume: 100 + index };
});

async function run(code, overrides = {}) {
  const child = spawn(process.execPath, ["--max-old-space-size=256", "--import", "@nullarch/resin/register", worker], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  child.stdin.end(JSON.stringify({ code, candles, symbol: "EURUSD", timeframe: "1h", startingBalance: 10_000, dataSource: "compatibility-suite", ...overrides }));
  const exitCode = await new Promise((resolveExit, reject) => { child.on("error", reject); child.on("close", resolveExit); });
  assert.equal(exitCode, 0, stderr);
  return JSON.parse(stdout);
}

const emaStrategy = `//@version=6
strategy("Compatibility EMA", overlay=true, default_qty_type=strategy.fixed, default_qty_value=1)
fast = ta.ema(close, 3)
slow = ta.ema(close, 7)
if ta.crossover(fast, slow)
    strategy.entry("Long", strategy.long)
if ta.crossunder(fast, slow)
    strategy.entry("Short", strategy.short)`;

const supported = await run(emaStrategy);
assert.equal(supported.ok, true, JSON.stringify(supported));
assert.equal(supported.report.compatibility, "Pine v6 historical strategy subset (single chart feed)");
assert.ok(supported.report.trades.length > 5);
assert.ok(supported.report.trades.some(trade => trade.direction === "long"));
assert.ok(supported.report.trades.some(trade => trade.direction === "short"));
assert.ok(supported.report.trades.every(trade => trade.exitTime > trade.entryTime));
assert.ok(Math.abs(supported.report.endingBalance - supported.report.startingBalance - supported.report.netPnl) < 1e-9);

const bracket = await run(`//@version=6
strategy("Bracket", default_qty_type=strategy.fixed, default_qty_value=1, commission_type=strategy.commission.cash_per_order, commission_value=0.01, slippage=1)
if bar_index == 1
    strategy.entry("Long", strategy.long)
strategy.exit("Bracket exit", "Long", profit=20, loss=10)`);
assert.equal(bracket.ok, true, JSON.stringify(bracket));
assert.equal(bracket.report.trades.length, 1);
assert.ok(Number.isFinite(bracket.report.trades[0].pnl));
assert.equal(bracket.report.openPosition, 0);

const rejectedCases = [
  [emaStrategy.replace("//@version=6", "//@version=5"), "v6 strategies only"],
  [`//@version=6\nimport vendor/library/1 as lib\nstrategy("Import")`, "Imported Pine libraries"],
  [`//@version=6\nstrategy("External")\nx = request.security("GBPUSD", "D", close)`, "request.* data feeds"],
  [`//@version=6\nstrategy("Magnifier", use_bar_magnifier=true)`, "Bar magnifier"],
  [`//@version=6\nstrategy("Ticks", calc_on_every_tick=true)`, "Realtime tick recalculation"],
];
for (const [code, expected] of rejectedCases) {
  const result = await run(code);
  assert.equal(result.ok, false);
  assert.match(result.error, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

const malformed = await run(emaStrategy, { candles: [candles[0], { ...candles[1], high: candles[1].low - 1 }] });
assert.equal(malformed.ok, false);
assert.match(malformed.error, /invalid OHLC/);

for (const symbol of ["GBPJPY", "AUDCAD", "USDZAR"]) {
  const result = await run(emaStrategy, { symbol });
  assert.equal(result.ok, true, `${symbol}: ${JSON.stringify(result)}`);
  assert.equal(result.report.symbol, symbol);
}

console.log(JSON.stringify({ ok: true, supported: { emaReversalTrades: supported.report.trades.length, bracketTrades: bracket.report.trades.length, additionalPairs: ["GBPJPY", "AUDCAD", "USDZAR"] }, rejected: rejectedCases.length + 1, scope: supported.report.compatibility }, null, 2));
