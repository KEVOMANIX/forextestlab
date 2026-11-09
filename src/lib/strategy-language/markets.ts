import { getSymbolDefinition } from "@/lib/market-data/symbols";

/** This version prices stops in FX pips; contracts such as metals and CFDs need separate sizing rules. */
const FIAT = new Set([
  "AUD", "CAD", "CHF", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "JPY",
  "MXN", "NOK", "NZD", "PLN", "SEK", "SGD", "TRY", "USD", "ZAR",
]);

export function isStrategyFxMarket(symbol: string): boolean {
  const definition = getSymbolDefinition(symbol);
  return Boolean(definition && FIAT.has(definition.baseCurrency) && FIAT.has(definition.quoteCurrency));
}
