/**
 * Simulation defaults (from env) and helpers to build a SessionConfig.
 * Server-only: reads server env vars.
 */

import type { Timeframe } from "@/lib/market-data/types";
import type { ExecutionPolicy, SessionConfig } from "./types";

export function simulationDefaults() {
  return {
    startingBalance: process.env.DEFAULT_ACCOUNT_BALANCE ?? "10000",
    spreadPips: process.env.DEFAULT_SPREAD_PIPS ?? "1.0",
    commissionPerLot: process.env.DEFAULT_COMMISSION_PER_LOT ?? "0",
    slippagePips: process.env.DEFAULT_SLIPPAGE_PIPS ?? "0",
    accountCurrency: "USD",
  };
}

export const INITIAL_VISIBLE_CANDLES = 60;

export interface BuildConfigInput {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  pipSize: string;
  pricePrecision: number;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  startingBalance?: string;
  spreadPips?: string;
  commissionPerLot?: string;
  slippagePips?: string;
  executionPolicy?: ExecutionPolicy;
}

export function buildSessionConfig(input: BuildConfigInput): SessionConfig {
  const defaults = simulationDefaults();
  return {
    symbol: input.symbol,
    baseCurrency: input.baseCurrency,
    quoteCurrency: input.quoteCurrency,
    timeframe: input.timeframe,
    startTime: input.startTime,
    endTime: input.endTime,
    startingBalance: input.startingBalance ?? defaults.startingBalance,
    accountCurrency: defaults.accountCurrency,
    spreadPips: input.spreadPips ?? defaults.spreadPips,
    commissionPerLot: input.commissionPerLot ?? defaults.commissionPerLot,
    slippagePips: input.slippagePips ?? defaults.slippagePips,
    executionPolicy: input.executionPolicy ?? "conservative",
    pipSize: input.pipSize,
    pricePrecision: input.pricePrecision,
    initialVisibleCount: INITIAL_VISIBLE_CANDLES,
  };
}
