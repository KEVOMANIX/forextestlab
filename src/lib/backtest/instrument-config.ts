import { getSymbolDefinition } from "@/lib/market-data/symbols";

import type { SessionConfig } from "./types";

/**
 * Apply one session symbol's immutable market metadata to the shared account
 * configuration. Spread, commission, slippage and account rules stay shared;
 * pair-specific currency, pip and precision values do not.
 */
export function configForSymbol(
  config: SessionConfig,
  symbol: string,
): SessionConfig {
  if (symbol === config.symbol) return config;
  const definition = getSymbolDefinition(symbol);
  if (!definition) return config;
  return {
    ...config,
    symbol: definition.symbol,
    baseCurrency: definition.baseCurrency,
    quoteCurrency: definition.quoteCurrency,
    pipSize: definition.pipSize,
    pricePrecision: definition.pricePrecision,
  };
}

export function recordSymbol(
  record: { symbol?: string },
  config: SessionConfig,
): string {
  return record.symbol ?? config.symbol;
}
