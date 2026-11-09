import { transpile, compile, Context } from "@nullarch/resin";

try {
  const chunks = [];
  let inputBytes = 0;
  for await (const chunk of process.stdin) {
    inputBytes += chunk.length;
    if (inputBytes > 16_000_000) throw new Error("Pine request exceeds the input limit.");
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const { code, candles, symbol, timeframe, startingBalance } = input;
  if (/\brequest\s*\./.test(code)) {
    throw new Error("External request.* data is not connected to this experimental runner yet.");
  }
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
