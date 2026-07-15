import type { MarketSymbol } from "./types";

/**
 * Instrument catalogue supported by the ForexTestLab architecture. A symbol is
 * only surfaced as `enabled` in the UI when a provider actually has data for
 * it (the LocalDatabaseProvider decides this from seeded/imported candles).
 */
export interface SymbolDefinition extends Omit<MarketSymbol, "enabled"> {
  /** Approximate starting price used only by the deterministic demo generator. */
  demoBasePrice: string;
}

export const SYMBOL_DEFINITIONS: SymbolDefinition[] = [
  {
    symbol: "EURUSD",
    displayName: "EUR/USD",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "1.08500",
  },
  {
    symbol: "GBPUSD",
    displayName: "GBP/USD",
    baseCurrency: "GBP",
    quoteCurrency: "USD",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "1.27000",
  },
  {
    symbol: "USDJPY",
    displayName: "USD/JPY",
    baseCurrency: "USD",
    quoteCurrency: "JPY",
    pipSize: "0.01",
    pricePrecision: 3,
    demoBasePrice: "149.500",
  },
  {
    symbol: "AUDUSD",
    displayName: "AUD/USD",
    baseCurrency: "AUD",
    quoteCurrency: "USD",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "0.66000",
  },
  {
    symbol: "USDCAD",
    displayName: "USD/CAD",
    baseCurrency: "USD",
    quoteCurrency: "CAD",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "1.36000",
  },
  {
    symbol: "USDCHF",
    displayName: "USD/CHF",
    baseCurrency: "USD",
    quoteCurrency: "CHF",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "0.88000",
  },
  {
    symbol: "NZDUSD",
    displayName: "NZD/USD",
    baseCurrency: "NZD",
    quoteCurrency: "USD",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "0.61000",
  },
  {
    symbol: "EURGBP",
    displayName: "EUR/GBP",
    baseCurrency: "EUR",
    quoteCurrency: "GBP",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "0.85500",
  },
];

export function getSymbolDefinition(
  symbol: string,
): SymbolDefinition | undefined {
  return SYMBOL_DEFINITIONS.find((s) => s.symbol === symbol);
}
