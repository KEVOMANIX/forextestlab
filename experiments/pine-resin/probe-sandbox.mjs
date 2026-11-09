import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(here, "ema-gold-15m.pine"), "utf8");
const candles = Array.from({ length: 120 }, (_, i) => {
  const close = 2350 + Math.sin(i / 4) * 2;
  return { timestamp: Date.UTC(2024, 2, 1) + i * 900_000, open: close, high: close + 0.5, low: close - 0.5, close, volume: 100 };
});
const input = { code, candles, symbol: "XAUUSD", timeframe: "15m", startingBalance: 10_000, dataSource: "sandbox-probe" };
const result = await new Promise((resolve, reject) => {
  const socket = createConnection("/run/forextestlab-pine.sock");
  let output = "";
  const timer = setTimeout(() => socket.destroy(new Error("Pine socket timed out")), 20_000);
  socket.setEncoding("utf8");
  socket.on("connect", () => socket.end(JSON.stringify(input)));
  socket.on("data", chunk => { output += chunk; });
  socket.on("end", () => {
    clearTimeout(timer);
    try { resolve(JSON.parse(output)); } catch (error) { reject(error); }
  });
  socket.on("error", error => { clearTimeout(timer); reject(error); });
});
assert.equal(result.ok, true, JSON.stringify(result));
assert.equal(result.report.symbol, "XAUUSD");
assert.equal(result.report.timeframe, "15m");
assert.ok(result.report.trades.length > 0);
assert.ok(result.report.trades.every(trade => trade.quantity === 1));
console.log(JSON.stringify({ ok: true, bars: result.report.bars, trades: result.report.trades.length, netPnl: result.report.netPnl }));
