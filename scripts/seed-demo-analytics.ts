/**
 * Seed a rich, realistic *finished* backtest session so the analytics page can
 * be reviewed with real-looking data.
 *
 * Idempotent: it upserts a single well-known session id for the target account,
 * so re-running replaces the previous demo instead of piling up duplicates.
 *
 * Usage:  npx tsx scripts/seed-demo-analytics.ts [email]
 *   defaults email to kelvinmwaniki62@gmail.com
 *
 * The generated trades and equity curve are synthetic (deterministic PRNG) and
 * are clearly flagged demoData: true.
 */

import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import type {
  ClosedTrade,
  EquityPoint,
  ExitReason,
  SessionState,
  TradeDirection,
} from "../src/lib/backtest/types";

const prisma = new PrismaClient();

const TARGET_EMAIL = process.argv[2] ?? "kelvinmwaniki62@gmail.com";
const SESSION_ID = "demo-analytics-eurusd-showcase";
const SESSION_TOKEN = "demo-analytics-eurusd-showcase-token";

// ── Deterministic PRNG (mulberry32) so results are reproducible ───────────────
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(20260724);
const rand = (min: number, max: number) => min + rng() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

// ── Session parameters ────────────────────────────────────────────────────────
const SYMBOL = "EURUSD";
const TIMEFRAME = "15m";
const PIP_SIZE = 0.0001;
const PIP_VALUE_PER_LOT = 10; // USD per pip per 1.0 standard lot for a USD-quoted major
const CANDLE_MS = 15 * 60 * 1000;
const STARTING_BALANCE = 25_000;

// Start on Monday 3 March 2025 00:00 UTC; build ~4 trading weeks of 15m candles.
const START_TIME = Date.UTC(2025, 2, 3, 0, 0, 0);
const TRADING_DAYS = 30;

interface Candle {
  index: number;
  time: number;
  close: number;
}

/** A weekday-only 15m price walk around 1.08, with gentle trend + intraday swing. */
function buildCandles(): Candle[] {
  const candles: Candle[] = [];
  let price = 1.081;
  let index = 0;
  let cursor = START_TIME;
  let daysBuilt = 0;
  while (daysBuilt < TRADING_DAYS) {
    const weekday = new Date(cursor).getUTCDay();
    if (weekday === 0 || weekday === 6) {
      cursor += 24 * 60 * 60 * 1000;
      continue;
    }
    // one weekday = 96 fifteen-minute candles
    for (let c = 0; c < 96; c++) {
      const drift = 0.000004; // slight long-run uptrend
      const swing = Math.sin((c / 96) * Math.PI * 2) * 0.00012; // intraday shape
      const noise = (rng() - 0.5) * 0.0006;
      price = Math.max(1.05, price + drift + swing * 0.02 + noise);
      candles.push({ index, time: cursor, close: Number(price.toFixed(5)) });
      index += 1;
      cursor += CANDLE_MS;
    }
    daysBuilt += 1;
  }
  return candles;
}

function money(n: number) {
  return n.toFixed(2);
}

function generate() {
  const candles = buildCandles();
  const total = candles.length;

  const trades: ClosedTrade[] = [];
  const equity: EquityPoint[] = [];

  let balance = STARTING_BALANCE;
  let tradeNo = 0;

  // Schedule ~160 trades across the candle range. Track open trades so the
  // equity curve diverges from the balance line while positions are live.
  interface Live {
    entryIndex: number;
    exitIndex: number;
    finalPnl: number;
    peakPnl: number; // MFE
    troughPnl: number; // MAE
  }
  const live: Live[] = [];

  const targetTrades = 150;

  let nextEntry = randInt(20, 40);
  for (let idx = 0; idx < total && trades.length < targetTrades; ) {
    if (idx < nextEntry) {
      idx = nextEntry;
      continue;
    }
    const entry = candles[idx]!;
    const direction: TradeDirection = rng() < 0.52 ? "long" : "short";
    const lots = Number(rand(0.1, 0.6).toFixed(2));
    const stopPips = Number(rand(9, 26).toFixed(1));
    const rrTarget = rand(1.1, 2.8);
    const tpPips = Number((stopPips * rrTarget).toFixed(1));
    const holdCandles = randInt(2, 26);
    const exitIdx = Math.min(total - 1, idx + holdCandles);

    // Positive but realistic edge: ~54% win rate. The result pips and exit
    // reason always agree in sign with the win/loss decision.
    const win = rng() < 0.54;
    const nearEnd = exitIdx >= total - 6;
    let reason: ExitReason;
    if (nearEnd && rng() < 0.6) reason = "session-end";
    else if (win) reason = rng() < 0.82 ? "take-profit" : "manual";
    else reason = rng() < 0.8 ? "stop-loss" : "manual";

    let resultPips: number;
    if (win) {
      resultPips =
        reason === "take-profit" ? tpPips * rand(0.96, 1.0) : rand(2, tpPips * 0.8);
    } else {
      resultPips =
        reason === "stop-loss" ? -stopPips * rand(0.98, 1.02) : rand(-stopPips * 0.9, -1);
    }
    resultPips = Number(resultPips.toFixed(1));

    const dir = direction === "long" ? 1 : -1;
    const entryPrice = entry.close;
    const exitPrice = Number((entryPrice + dir * resultPips * PIP_SIZE).toFixed(5));
    const stopLoss = Number((entryPrice - dir * stopPips * PIP_SIZE).toFixed(5));
    const takeProfit = Number((entryPrice + dir * tpPips * PIP_SIZE).toFixed(5));

    const commission = Number((lots * 3.5).toFixed(2)); // $3.5 per lot round-turn
    const pnl = Number((resultPips * lots * PIP_VALUE_PER_LOT - commission).toFixed(2));
    const initialRiskAmount = Number((stopPips * lots * PIP_VALUE_PER_LOT).toFixed(2));

    // MFE/MAE: winners run up before closing; losers dip before/at exit.
    const maxFavorablePnl = Number(
      Math.max(pnl, tpPips * lots * PIP_VALUE_PER_LOT * rand(0.3, win ? 1.0 : 0.55)).toFixed(2),
    );
    const maxAdversePnl = Number(
      Math.min(pnl, -stopPips * lots * PIP_VALUE_PER_LOT * rand(0.15, win ? 0.5 : 0.98)).toFixed(2),
    );

    tradeNo += 1;
    trades.push({
      id: `trade_${tradeNo}`,
      direction,
      entryPrice: entryPrice.toFixed(5),
      exitPrice: exitPrice.toFixed(5),
      entryTime: entry.time,
      exitTime: candles[exitIdx]!.time,
      entryIndex: idx,
      exitIndex: exitIdx,
      lots: lots.toFixed(2),
      stopLoss: stopLoss.toFixed(5),
      takeProfit: takeProfit.toFixed(5),
      initialStopLoss: stopLoss.toFixed(5),
      initialTakeProfit: takeProfit.toFixed(5),
      initialRiskAmount: initialRiskAmount.toFixed(2),
      maxFavorablePnl: maxFavorablePnl.toFixed(2),
      maxAdversePnl: maxAdversePnl.toFixed(2),
      commission: commission.toFixed(2),
      pnl: pnl.toFixed(2),
      pips: resultPips.toFixed(1),
      exitReason: reason,
      intrabarAmbiguous: false,
    });

    // entryPrice must keep 5dp precision
    trades[trades.length - 1]!.entryPrice = entryPrice.toFixed(5);

    live.push({
      entryIndex: idx,
      exitIndex: exitIdx,
      finalPnl: pnl,
      peakPnl: maxFavorablePnl,
      troughPnl: maxAdversePnl,
    });

    nextEntry = exitIdx + randInt(1, 7);
    idx = nextEntry;
  }

  // Build a dense equity curve: balance is realised, equity adds live unrealised.
  let realised = STARTING_BALANCE;
  let li = 0;
  let peak = STARTING_BALANCE;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  let maxEquity = STARTING_BALANCE;

  // Realise trades in exit order as we walk candles.
  const byExit = [...live].sort((a, b) => a.exitIndex - b.exitIndex);

  for (const candle of candles) {
    // realise any trades that closed on/before this candle
    while (li < byExit.length && byExit[li]!.exitIndex <= candle.index) {
      realised += byExit[li]!.finalPnl;
      li += 1;
    }
    // unrealised from currently-open trades
    let unrealised = 0;
    for (const t of live) {
      if (candle.index > t.entryIndex && candle.index <= t.exitIndex) {
        const span = Math.max(1, t.exitIndex - t.entryIndex);
        const progress = (candle.index - t.entryIndex) / span;
        // swing between MAE and MFE, converging to finalPnl at exit
        const swing = Math.sin(progress * Math.PI) * (t.peakPnl - t.troughPnl) * 0.5;
        const base = t.troughPnl + (t.finalPnl - t.troughPnl) * progress;
        unrealised += base + swing * (rng() - 0.4);
      }
    }
    const equityValue = realised + unrealised;
    maxEquity = Math.max(maxEquity, equityValue);
    peak = Math.max(peak, equityValue);
    const dd = peak - equityValue;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPercent = (dd / peak) * 100;
    }
    equity.push({
      index: candle.index,
      time: candle.time,
      balance: realised.toFixed(2),
      equity: equityValue.toFixed(2),
    });
  }
  // realise any stragglers
  while (li < byExit.length) {
    realised += byExit[li]!.finalPnl;
    li += 1;
  }
  balance = realised;

  const endTime = candles[total - 1]!.time + CANDLE_MS;

  const config: SessionState["config"] = {
    name: "EUR/USD London-session breakout — showcase",
    symbols: [SYMBOL],
    tags: ["breakout", "london", "demo"],
    symbol: SYMBOL,
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    timeframe: TIMEFRAME as SessionState["config"]["timeframe"],
    startTime: START_TIME,
    endTime,
    startingBalance: String(STARTING_BALANCE),
    accountCurrency: "USD",
    spreadPips: "0.8",
    commissionPerLot: "3.5",
    slippagePips: "0.2",
    executionPolicy: "conservative",
    pipSize: String(PIP_SIZE),
    pricePrecision: 5,
    initialVisibleCount: 60,
  };

  const state: SessionState = {
    sessionId: SESSION_ID,
    config,
    status: "finished",
    speed: 60,
    visibleIndex: total - 1,
    totalCandles: total,
    balance: balance.toFixed(2),
    equity: balance.toFixed(2),
    maxEquity: maxEquity.toFixed(2),
    maxDrawdown: maxDrawdown.toFixed(2),
    maxDrawdownPercent: maxDrawdownPercent.toFixed(1),
    openPositions: [],
    closedTrades: trades,
    equityCurve: equity,
    lockedBeforeIndex: trades[0]?.entryIndex ?? 0,
    dataSource: "demo",
    demoData: true,
  };

  return { state, total, endTime, balance, maxEquity, maxDrawdown, maxDrawdownPercent };
}

async function main() {
  const user = await prisma.userProfile.findUnique({ where: { email: TARGET_EMAIL } });
  if (!user) throw new Error(`No account for ${TARGET_EMAIL}`);

  const instrument = await prisma.marketInstrument.findUniqueOrThrow({
    where: { symbol: SYMBOL },
  });

  const { state, total, endTime, balance, maxEquity, maxDrawdown, maxDrawdownPercent } =
    generate();

  const wins = state.closedTrades.filter((t) => Number(t.pnl) > 0).length;
  console.log(
    `Generated ${state.closedTrades.length} trades · ${total} candles · ` +
      `${wins} wins (${((wins / state.closedTrades.length) * 100).toFixed(1)}%) · ` +
      `end balance $${balance.toFixed(2)} · max DD $${maxDrawdown.toFixed(2)}`,
  );

  const common = {
    token: SESSION_TOKEN,
    userId: user.id,
    anonymous: false,
    instrumentId: instrument.id,
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    startTime: BigInt(state.config.startTime),
    endTime: BigInt(endTime),
    status: "finished",
    speed: 60,
    visibleIndex: total - 1,
    totalCandles: total,
    lockedBeforeIndex: state.lockedBeforeIndex,
    startingBalance: String(STARTING_BALANCE),
    balance: balance.toFixed(2),
    equity: balance.toFixed(2),
    maxEquity: maxEquity.toFixed(2),
    maxDrawdown: maxDrawdown.toFixed(2),
    maxDrawdownPercent: maxDrawdownPercent.toFixed(1),
    accountCurrency: "USD",
    spreadPips: "0.8",
    commissionPerLot: "3.5",
    slippagePips: "0.2",
    executionPolicy: "conservative",
    dataSource: "demo",
    demoData: true,
    notes:
      "Synthetic showcase session for reviewing the analytics dashboard. " +
      "London-session breakout strategy on EUR/USD 15m.",
    stateJson: JSON.stringify(state),
  } as const;

  await prisma.backtestSession.upsert({
    where: { id: SESSION_ID },
    update: common,
    create: { id: SESSION_ID, ...common },
  });

  console.log(`\nUpserted session ${SESSION_ID} for ${TARGET_EMAIL}.`);
  console.log(`View at: /app/results/${SESSION_ID}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
