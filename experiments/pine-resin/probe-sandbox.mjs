import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(here, "ema-gold-15m.pine"), "utf8");
const count = Number(process.argv[2] ?? 120);
assert.ok(Number.isInteger(count) && count >= 10 && count <= 30_000);
const symbol = process.argv[3] ?? "XAUUSD";
const fiat = new Set(["AUD", "CAD", "CHF", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "JPY", "MXN", "NOK", "NZD", "PLN", "SEK", "SGD", "TRY", "USD", "ZAR"]);
assert.ok(symbol === "XAUUSD" || (symbol.length === 6 && fiat.has(symbol.slice(0, 3)) && fiat.has(symbol.slice(3))));
const candles = Array.from({ length: count }, (_, i) => {
  const base = symbol === "XAUUSD" ? 2350 : symbol.endsWith("JPY") ? 150 : 1.08;
  const amplitude = symbol === "XAUUSD" ? 2 : symbol.endsWith("JPY") ? 0.2 : 0.002;
  const close = base + Math.sin(i / 4) * amplitude;
  const wick = symbol === "XAUUSD" ? 0.5 : symbol.endsWith("JPY") ? 0.05 : 0.0005;
  return { timestamp: Date.UTC(2024, 2, 1) + i * 900_000, open: close, high: close + wick, low: close - wick, close, volume: 100 };
});
const input = { code, candles, symbol, timeframe: "15m", startingBalance: 10_000, dataSource: "sandbox-probe" };
const result = await new Promise((resolve, reject) => {
  const socket = createConnection("/run/forextestlab-pine.sock");
  let output = "";
  const timer = setTimeout(() => socket.destroy(new Error("Pine socket timed out")), 40_000);
  socket.setEncoding("utf8");
  socket.on("connect", () => {
    const payload = JSON.stringify(input);
    const split = Math.floor(payload.length / 2);
    socket.write(payload.slice(0, split));
    setTimeout(() => socket.end(payload.slice(split)), 250);
  });
  socket.on("data", chunk => { output += chunk; });
  socket.on("end", () => {
    clearTimeout(timer);
    try { resolve(JSON.parse(output)); } catch (error) { reject(error); }
  });
  socket.on("error", error => { clearTimeout(timer); reject(error); });
});
assert.equal(result.ok, true, JSON.stringify(result));
assert.equal(result.report.symbol, symbol);
assert.equal(result.report.timeframe, "15m");
assert.ok(result.report.trades.length > 0);
assert.ok(result.report.trades.every(trade => trade.quantity === 1));
console.log(JSON.stringify({ ok: true, bars: result.report.bars, trades: result.report.trades.length, netPnl: result.report.netPnl }));
