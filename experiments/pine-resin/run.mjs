import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const resin = join(root, ".tmp", "resin-poc");
const pinnedCommit = "fa683a0ce81bf54832805f3e386c504c144d451a";

let actualCommit;
try {
  actualCommit = execFileSync("git", ["-C", resin, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
} catch {
  throw new Error("Clone Resin into .tmp/resin-poc first. See experiments/pine-resin/README.md.");
}
assert.equal(actualCommit, pinnedCommit, "Use the pinned Resin commit from README.md for reproducible results.");

const [{ transpile, compile, Context }, { generateDemoSeries }] = await Promise.all([
  import(pathToFileURL(join(resin, "src", "index.ts")).href),
  import(pathToFileURL(join(root, "src", "lib", "market-data", "demo-generator.ts")).href),
]);

const source = readFileSync(join(here, "ema-crossover.pine"), "utf8");
const candles = generateDemoSeries("EURUSD", "1h");
const data = {
  open: candles.map((c) => Number(c.open)),
  high: candles.map((c) => Number(c.high)),
  low: candles.map((c) => Number(c.low)),
  close: candles.map((c) => Number(c.close)),
  volume: candles.map((c) => Number(c.volume ?? 0)),
  time: candles.map((c) => c.timestamp),
};
const program = transpile(source, {
  chartTf: "60",
  syminfo: { ticker: "EURUSD", prefix: "FTL", mintick: 0.00001, minmove: 1, pricescale: 100000, pointvalue: 1 },
});
if (!program.ok) throw new Error(program.errors.join("\n"));
assert.equal(program.isStrategy, true);

const context = Context.from(program, data);
const runBar = compile(program.code)(context);
for (let i = 0; i < context.barCount; i++) {
  context.advance();
  runBar();
}

const [fast, slow] = context.plots.map((plot) => plot.toArray());
assert.equal(fast.length, candles.length);
assert.equal(slow.length, candles.length);
const expectedEntries = [];
const expectedExits = [];
for (let i = 1; i < candles.length - 1; i++) {
  if (fast[i - 1] <= slow[i - 1] && fast[i] > slow[i]) expectedEntries.push(i + 1);
  if (fast[i - 1] >= slow[i - 1] && fast[i] < slow[i]) expectedExits.push(i + 1);
}
const trades = context.strategy.closedTradeRecords;
assert.deepEqual(trades.map((trade) => trade.entryBarIndex), expectedEntries.slice(0, trades.length));
assert.deepEqual(trades.map((trade) => trade.exitBarIndex), expectedExits.slice(0, trades.length));
assert.ok(Math.abs(trades.reduce((sum, trade) => sum + trade.profit, 0) - context.strategy.realizedPnl) < 1e-7);
for (const trade of trades) {
  assert.equal(trade.entryTime, candles[trade.entryBarIndex].timestamp);
  assert.equal(trade.exitTime, candles[trade.exitBarIndex].timestamp);
}

console.log(JSON.stringify({
  engineCommit: actualCommit,
  data: "ForexTestLab deterministic demonstration candles, EURUSD 1h",
  bars: candles.length,
  entrySignals: expectedEntries.length,
  closedTrades: trades.length,
  openPosition: context.strategy.posSize,
  firstTrade: trades.length ? {
    entryBar: trades[0].entryBarIndex,
    exitBar: trades[0].exitBarIndex,
    entryPrice: trades[0].entryPrice,
    exitPrice: trades[0].exitPrice,
    profit: Number(trades[0].profit.toFixed(2)),
  } : null,
  netProfit: Number(context.strategy.realizedPnl.toFixed(2)),
  checks: "entry/exit on next bar, timestamps, and net P/L passed",
}, null, 2));
