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
import { configForSymbol, recordSymbol } from "@/lib/backtest/instrument-config";
import type { SessionState } from "@/lib/backtest/types";
import { getMarketDataProvider } from "@/lib/market-data";
import type { Candle } from "@/lib/market-data/types";

export interface ExitQualityReport {
  tests: PlanTest[];
  summary: PlanSummary;
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

  const candidates = state.closedTrades.filter(tradePlanTestable);
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

  for (const [symbol, group] of bySymbol) {
    const earliest = Math.min(...group.map((trade) => trade.entryTime));
    let candles: Candle[];
    try {
      candles = await provider.getCandles({
        symbol,
        timeframe: state.config.timeframe,
        startTime: earliest,
        endTime: state.config.endTime,
      });
    } catch {
      // Missing history for one instrument must not take the whole report
      // down; the others still have something to say.
      continue;
    }
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
      const result = testTradePlan(trade, candles, planConfig);
      if (result) tests.push(result);
    }
  }

  if (!tests.length) return null;
  return { tests, summary: summarisePlanTests(tests) };
}
