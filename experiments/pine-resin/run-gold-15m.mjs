import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { generateDemoSeries } from "../../src/lib/market-data/demo-generator.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const candles = generateDemoSeries("XAUUSD", "15m");
const code = readFileSync(join(here, "ema-gold-15m.pine"), "utf8");
const child = spawn(process.execPath, ["--max-old-space-size=256", "--import", "@nullarch/resin/register", join(root, "workers/pine-resin-worker.mjs")], {
  cwd: root, stdio: ["pipe", "pipe", "pipe"],
});
let output = "";
let stderr = "";
child.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
child.stdin.end(JSON.stringify({ code, candles, symbol: "XAUUSD", timeframe: "15m", startingBalance: 10_000, dataSource: "demo" }));
const exitCode = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("close", resolve);
});
assert.equal(exitCode, 0, stderr);
const result = JSON.parse(output);
assert.equal(result.ok, true, JSON.stringify(result));
const { report } = result;
assert.equal(report.bars, candles.length);
assert.ok(report.trades.length > 0, "The 15m gold script should produce trades.");
assert.ok(report.trades.some(trade => trade.direction === "long"));
assert.ok(report.trades.some(trade => trade.direction === "short"));

const closes = candles.map(candle => Number(candle.close));
const ema = (length) => {
  const values = [closes[0]];
  const alpha = 2 / (length + 1);
  for (let i = 1; i < closes.length; i++) values.push(alpha * closes[i] + (1 - alpha) * values[i - 1]);
  return values;
};
const fast = ema(3);
const slow = ema(7);
const signal = new Map();
for (let i = 1; i < closes.length - 1; i++) {
  if (fast[i - 1] <= slow[i - 1] && fast[i] > slow[i]) signal.set(candles[i + 1].timestamp, "long");
  if (fast[i - 1] >= slow[i - 1] && fast[i] < slow[i]) signal.set(candles[i + 1].timestamp, "short");
}
let sum = 0;
for (const trade of report.trades) {
  assert.equal(trade.quantity, 1, "TradingView screenshot uses one gold unit per entry.");
  assert.equal(signal.get(trade.entryTime), trade.direction, "Entry should fill on the bar after its EMA cross.");
  assert.equal(signal.get(trade.exitTime), trade.direction === "long" ? "short" : "long", "Opposite cross should close the position.");
  const expected = (trade.exitPrice - trade.entryPrice) * (trade.direction === "long" ? 1 : -1);
  assert.ok(Math.abs(trade.pnl - expected) < 1e-7, "Gold P/L should equal the dollar price move for one unit.");
  sum += trade.pnl;
}
assert.ok(Math.abs(sum - report.netPnl) < 1e-7);
assert.ok(Math.abs(report.endingBalance - report.startingBalance - sum) < 1e-7);
console.log(JSON.stringify({
  source: "ForexTestLab synthetic sample candles, not FOREXCOM",
  symbol: report.symbol, timeframe: report.timeframe, bars: report.bars,
  trades: report.trades.length, longTrades: report.trades.filter(trade => trade.direction === "long").length,
  shortTrades: report.trades.filter(trade => trade.direction === "short").length,
  firstTrade: report.trades[0], netPnl: report.netPnl,
  checks: "next-bar EMA entries, reversals, one-unit sizing, and P/L passed",
}, null, 2));
