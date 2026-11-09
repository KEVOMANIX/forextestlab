import { transpile, compile, Context } from "@nullarch/resin";

const MAX_CODE_LENGTH = 20_000;
const MAX_BARS = 30_000;
const SUPPORTED_SYMBOLS = new Set(["EURUSD", "XAUUSD"]);
const SUPPORTED_TIMEFRAMES = new Set(["15m", "1h", "4h", "1d"]);

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("The Pine request is invalid.");
  const { code, candles, symbol, timeframe, startingBalance } = input;
  if (typeof code !== "string" || code.length < 1 || code.length > MAX_CODE_LENGTH) throw new Error(`Pine code must contain 1 to ${MAX_CODE_LENGTH.toLocaleString()} characters.`);
  if (!/^\s*\/\/@version=6\s*$/m.test(code)) throw new Error("This runner accepts Pine Script v6 strategies only. Add //@version=6.");
  if (/^\s*import\s+/m.test(code)) throw new Error("Imported Pine libraries are not available in this runner.");
  if (/\brequest\s*\./.test(code)) throw new Error("request.* data feeds are not available in this runner.");
  if (/\buse_bar_magnifier\s*=\s*true\b/.test(code)) throw new Error("Bar magnifier is not available because lower-timeframe intrabar data is not supplied.");
  if (/\bcalc_on_every_tick\s*=\s*true\b/.test(code)) throw new Error("Realtime tick recalculation is not available in historical Pine tests.");
  if (!SUPPORTED_SYMBOLS.has(symbol) || !SUPPORTED_TIMEFRAMES.has(timeframe)) throw new Error("The Pine market or timeframe is not supported.");
  if (!Number.isFinite(startingBalance) || startingBalance < 100 || startingBalance > 1_000_000) throw new Error("The Pine starting balance is invalid.");
  if (!Array.isArray(candles) || candles.length < 2 || candles.length > MAX_BARS) throw new Error(`Pine tests require 2 to ${MAX_BARS.toLocaleString()} candles.`);
  let previousTime = -1;
  for (const candle of candles) {
    const timestamp = Number(candle?.timestamp);
    const open = Number(candle?.open);
    const high = Number(candle?.high);
    const low = Number(candle?.low);
    const close = Number(candle?.close);
    const volume = Number(candle?.volume ?? 0);
    if (![timestamp, open, high, low, close, volume].every(Number.isFinite) || !Number.isInteger(timestamp) || timestamp <= previousTime) throw new Error("Market candles must have finite values and strictly increasing integer timestamps.");
    if (high < Math.max(open, low, close) || low > Math.min(open, high, close) || volume < 0) throw new Error("Market candles contain an invalid OHLC or volume value.");
    previousTime = timestamp;
  }
}

try {
  const chunks = [];
  let inputBytes = 0;
  for await (const chunk of process.stdin) {
    inputBytes += chunk.length;
    if (inputBytes > 16_000_000) throw new Error("Pine request exceeds the input limit.");
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  validateInput(input);
  const { code, candles, symbol, timeframe, startingBalance } = input;
  const data = {
    open: candles.map((c) => Number(c.open)), high: candles.map((c) => Number(c.high)),
    low: candles.map((c) => Number(c.low)), close: candles.map((c) => Number(c.close)),
    volume: candles.map((c) => Number(c.volume ?? 0)), time: candles.map((c) => c.timestamp),
  };
  const symbolSettings = symbol === "XAUUSD"
    ? { ticker: symbol, prefix: "FTL", mintick: 0.01, minmove: 1, pricescale: 100, pointvalue: 1, type: "cfd", timezone: "UTC" }
    : { ticker: symbol, prefix: "FTL", mintick: 0.00001, minmove: 1, pricescale: 100000, pointvalue: 1, type: "forex", timezone: "UTC" };
  const result = transpile(code, {
    chartTf: timeframe === "15m" ? "15" : timeframe === "1h" ? "60" : timeframe === "4h" ? "240" : "D",
    syminfo: symbolSettings,
    strategy: { initial_capital: startingBalance },
  });
  if (!result.ok) {
    process.stdout.write(JSON.stringify({ ok: false, error: "Fix the Pine script errors before running.", diagnostics: result.errors.map((message) => ({ line: Number(/\(L(\d+):\d+\)/.exec(message)?.[1] ?? 1), message })) }));
  } else if (!result.isStrategy) {
    process.stdout.write(JSON.stringify({ ok: false, error: "Use a Pine strategy() script to run a backtest." }));
  } else {
    const context = Context.from(result, data);
    const runBar = compile(result.code)(context);
    const equity = [];
    for (let i = 0; i < context.barCount; i++) {
      context.advance();
      runBar();
      if (i % Math.max(1, Math.ceil(context.barCount / 1500)) === 0 || i === context.barCount - 1) {
        equity.push({ time: candles[i].timestamp, balance: startingBalance + context.strategy.realizedPnl });
      }
    }
    const trades = context.strategy.closedTradeRecords.map((trade, i) => ({
      number: i + 1, direction: trade.size >= 0 ? "long" : "short",
      entryTime: trade.entryTime, exitTime: trade.exitTime,
      entryPrice: trade.entryPrice, exitPrice: trade.exitPrice,
      quantity: Math.abs(trade.size), pnl: trade.profit,
      entryId: trade.entryId, exitId: trade.exitId,
    }));
    const grossProfit = trades.reduce((sum, t) => sum + Math.max(0, t.pnl), 0);
    const grossLoss = trades.reduce((sum, t) => sum + Math.max(0, -t.pnl), 0);
    process.stdout.write(JSON.stringify({ ok: true, report: {
      engine: "Resin 0.3.0 experimental", symbol, timeframe, dataSource: input.dataSource,
      compatibility: "Pine v6 historical strategy subset (single chart feed)",
      bars: candles.length, startingBalance, netPnl: context.strategy.realizedPnl,
      endingBalance: startingBalance + context.strategy.realizedPnl,
      winRate: trades.length ? trades.filter((t) => t.pnl > 0).length / trades.length * 100 : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
      maxDrawdown: context.strategy.maxDrawdown ?? 0,
      openPosition: context.strategy.posSize, trades, equity,
    } }));
  }
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Pine test failed." }));
}
