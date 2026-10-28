/**
 * Loads the candles the Tier 2 counterfactual needs and runs it.
 *
 * Kept server-side and behind a finished-session check. The candles this walks
 * are the ones a running replay has not revealed yet, so nothing here may
 * reach the browser until the session is over — see the note in exit-quality.
 */

import "server-only";

import {
  planTestable,
  summarisePlanTests,
  testTradePlan,
  tradePlanTestable,
  type PlanConfig,
  type PlanSummary,
  type PlanTest,
} from "@/lib/backtest/exit-quality";
import {
  buildOptimizerReport,
  optimizerTradeEligible,
  PHASE_ONE_EXIT_RULES,
  simulateExitRule,
  type ExitOptimizerReport,
  type OptimizedTradeResult,
} from "@/lib/backtest/exit-optimizer";
import { configForSymbol, recordSymbol } from "@/lib/backtest/instrument-config";
import type { SessionState } from "@/lib/backtest/types";
import { getMarketDataProvider } from "@/lib/market-data";
import type { Candle } from "@/lib/market-data/types";
import { isAnalyticsTrade } from "@/lib/analytics/trade-scope";

export interface ExitQualityReport {
  tests: PlanTest[];
  summary: PlanSummary | null;
  optimizer: ExitOptimizerReport | null;
}

/**
 * Null when the session is still being replayed, or when no trade was cut by
 * hand with a plan left to resolve. Callers render nothing rather than an
 * empty report in both cases.
 */
export async function buildExitQualityReport(
  state: SessionState,
): Promise<ExitQualityReport | null> {
  if (!planTestable(state)) return null;

  const planCandidates = state.closedTrades.filter(
    (trade) => isAnalyticsTrade(trade) && tradePlanTestable(trade),
  );
  const optimizerCandidates = state.closedTrades.filter(
    (trade) => isAnalyticsTrade(trade) && optimizerTradeEligible(trade),
  );
  const candidates = [...new Map([...planCandidates, ...optimizerCandidates].map((trade) => [trade.id, trade])).values()];
  if (!candidates.length) return null;

  // One fetch per instrument covering every candidate, sliced per trade. The
  // walk stops at the session's own end: "if I had let it run" means within
  // the period under test, not into data the session never covered.
  const bySymbol = new Map<string, typeof candidates>();
  for (const trade of candidates) {
    const symbol = recordSymbol(trade, state.config);
    const group = bySymbol.get(symbol) ?? [];
    group.push(trade);
    bySymbol.set(symbol, group);
  }

  const provider = getMarketDataProvider();
  const tests: PlanTest[] = [];
  const optimizedByRule = new Map(PHASE_ONE_EXIT_RULES.map((rule) => [rule.id, { rule, trades: [] as OptimizedTradeResult[] }]));
  const tradeNumbers = new Map(state.closedTrades.map((trade, index) => [trade.id, index + 1]));

  // Each instrument's history is a separate read from storage, so they are
  // fetched side by side rather than one after another.
  const candlesBySymbol = new Map(await Promise.all([...bySymbol].map(async ([symbol, group]) => {
    try {
      const candles = await provider.getCandles({
        symbol,
        timeframe: state.config.timeframe,
        startTime: Math.min(...group.map((trade) => trade.entryTime)),
        endTime: state.config.endTime,
      });
      return [symbol, candles] as const;
    } catch {
      // Missing history for one instrument must not take the whole report
      // down; the others still have something to say.
      return [symbol, [] as Candle[]] as const;
    }
  })));

  for (const [symbol, group] of bySymbol) {
    const candles = candlesBySymbol.get(symbol) ?? [];
    if (!candles.length) continue;

    const symbolConfig = configForSymbol(state.config, symbol);
    const planConfig: PlanConfig = {
      spreadPips: symbolConfig.spreadPips,
      pipSize: symbolConfig.pipSize,
      quoteCurrency: symbolConfig.quoteCurrency,
      accountCurrency: symbolConfig.accountCurrency,
      baseCurrency: symbolConfig.baseCurrency,
      symbol,
      executionPolicy: state.config.executionPolicy,
    };

    for (const trade of group) {
      // Slice once per trade. Passing the symbol's whole multi-year array into
      // every candidate rule would repeatedly rescan hundreds of thousands of
      // candles and make opening Reports progressively slower with history.
      const tradeCandles = candles.filter((candle) => candle.timestamp >= trade.entryTime).slice(0, 10_000);
      if (tradePlanTestable(trade)) {
        const result = testTradePlan(trade, tradeCandles, planConfig);
        if (result) tests.push(result);
      }
      if (optimizerTradeEligible(trade)) {
        for (const row of optimizedByRule.values()) {
          const result = simulateExitRule(trade, tradeNumbers.get(trade.id) ?? 0, tradeCandles, planConfig, row.rule);
          if (result) row.trades.push(result);
        }
      }
    }
  }

  const optimizer = buildOptimizerReport([...optimizedByRule.values()]);
  if (!tests.length && !optimizer) return null;
  return { tests, summary: tests.length ? summarisePlanTests(tests) : null, optimizer };
}
