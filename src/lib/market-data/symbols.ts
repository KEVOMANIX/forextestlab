import type { MarketSymbol } from "./types";

/**
 * Instrument catalogue supported by the ForexTestLab architecture. A symbol is
 * only surfaced as `enabled` in the UI when a provider actually has data for
 * it (the active R2 provider decides this from stored monthly files).
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
  {
    symbol: "EURAUD",
    displayName: "EUR/AUD",
    baseCurrency: "EUR",
    quoteCurrency: "AUD",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "1.65000",
  },
  {
    symbol: "EURCAD",
    displayName: "EUR/CAD",
    baseCurrency: "EUR",
    quoteCurrency: "CAD",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "1.47000",
  },
  {
    symbol: "EURCHF",
    displayName: "EUR/CHF",
    baseCurrency: "EUR",
    quoteCurrency: "CHF",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "0.95000",
  },
  {
    symbol: "EURJPY",
    displayName: "EUR/JPY",
    baseCurrency: "EUR",
    quoteCurrency: "JPY",
    pipSize: "0.01",
    pricePrecision: 3,
    demoBasePrice: "162.000",
  },
  {
    symbol: "EURNZD",
    displayName: "EUR/NZD",
    baseCurrency: "EUR",
    quoteCurrency: "NZD",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "1.78000",
  },
  {
    symbol: "GBPAUD",
    displayName: "GBP/AUD",
    baseCurrency: "GBP",
    quoteCurrency: "AUD",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "1.93000",
  },
  {
    symbol: "GBPCAD",
    displayName: "GBP/CAD",
    baseCurrency: "GBP",
    quoteCurrency: "CAD",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "1.72000",
  },
  {
    symbol: "GBPCHF",
    displayName: "GBP/CHF",
    baseCurrency: "GBP",
    quoteCurrency: "CHF",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "1.11000",
  },
  {
    symbol: "GBPJPY",
    displayName: "GBP/JPY",
    baseCurrency: "GBP",
    quoteCurrency: "JPY",
    pipSize: "0.01",
    pricePrecision: 3,
    demoBasePrice: "189.000",
  },
  {
    symbol: "GBPNZD",
    displayName: "GBP/NZD",
    baseCurrency: "GBP",
    quoteCurrency: "NZD",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "2.08000",
  },
  {
    symbol: "AUDCAD",
    displayName: "AUD/CAD",
    baseCurrency: "AUD",
    quoteCurrency: "CAD",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "0.90000",
  },
  {
    symbol: "AUDCHF",
    displayName: "AUD/CHF",
    baseCurrency: "AUD",
    quoteCurrency: "CHF",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "0.58000",
  },
  {
    symbol: "AUDJPY",
    displayName: "AUD/JPY",
    baseCurrency: "AUD",
    quoteCurrency: "JPY",
    pipSize: "0.01",
    pricePrecision: 3,
    demoBasePrice: "97.000",
  },
  {
    symbol: "AUDNZD",
    displayName: "AUD/NZD",
    baseCurrency: "AUD",
    quoteCurrency: "NZD",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "1.08000",
  },
  {
    symbol: "CADCHF",
    displayName: "CAD/CHF",
    baseCurrency: "CAD",
    quoteCurrency: "CHF",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "0.65000",
  },
  {
    symbol: "CADJPY",
    displayName: "CAD/JPY",
    baseCurrency: "CAD",
    quoteCurrency: "JPY",
    pipSize: "0.01",
    pricePrecision: 3,
    demoBasePrice: "108.000",
  },
  {
    symbol: "CHFJPY",
    displayName: "CHF/JPY",
    baseCurrency: "CHF",
    quoteCurrency: "JPY",
    pipSize: "0.01",
    pricePrecision: 3,
    demoBasePrice: "166.000",
  },
  {
    symbol: "NZDCAD",
    displayName: "NZD/CAD",
    baseCurrency: "NZD",
    quoteCurrency: "CAD",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "0.83000",
  },
  {
    symbol: "NZDCHF",
    displayName: "NZD/CHF",
    baseCurrency: "NZD",
    quoteCurrency: "CHF",
    pipSize: "0.0001",
    pricePrecision: 5,
    demoBasePrice: "0.54000",
  },
  {
    symbol: "NZDJPY",
    displayName: "NZD/JPY",
    baseCurrency: "NZD",
    quoteCurrency: "JPY",
    pipSize: "0.01",
    pricePrecision: 3,
    demoBasePrice: "90.500",
  },
  {
    symbol: "ETHUSD",
    displayName: "ETH/USD",
    baseCurrency: "ETH",
    quoteCurrency: "USD",
    pipSize: "0.01",
    pricePrecision: 2,
    demoBasePrice: "3500.00",
  },
  {
    symbol: "LTCUSD",
    displayName: "LTC/USD",
    baseCurrency: "LTC",
    quoteCurrency: "USD",
    pipSize: "0.01",
    pricePrecision: 2,
    demoBasePrice: "85.00",
  },
  {
    symbol: "ADAUSD",
    displayName: "ADA/USD",
    baseCurrency: "ADA",
    quoteCurrency: "USD",
    pipSize: "0.0001",
    pricePrecision: 4,
    demoBasePrice: "0.45",
  },
  {
    symbol: "XAUUSD",
    displayName: "XAU/USD",
    baseCurrency: "XAU",
    quoteCurrency: "USD",
    pipSize: "0.01",
    pricePrecision: 2,
    demoBasePrice: "2350.00",
  },
  {
    symbol: "XAGUSD",
    displayName: "XAG/USD",
    baseCurrency: "XAG",
    quoteCurrency: "USD",
    pipSize: "0.001",
    pricePrecision: 3,
    demoBasePrice: "29.000",
  },
  {
    symbol: "BTCUSD",
    displayName: "BTC/USD",
    baseCurrency: "BTC",
    quoteCurrency: "USD",
    pipSize: "0.01",
    pricePrecision: 2,
    demoBasePrice: "65000.00",
  },
  {
    symbol: "DXY",
    displayName: "US Dollar Index",
    baseCurrency: "DXY",
    quoteCurrency: "USD",
    pipSize: "0.001",
    pricePrecision: 3,
    demoBasePrice: "104.000",
  },
];

export function getSymbolDefinition(
  symbol: string,
): SymbolDefinition | undefined {
  return SYMBOL_DEFINITIONS.find((s) => s.symbol === symbol);
}

export function formatSymbol(symbol: string): string {
  return getSymbolDefinition(symbol)?.displayName ?? symbol;
}

const CURRENCY_NAMES: Record<string, string> = {
  ADA: "Cardano",
  AUD: "Australian Dollar",
  BTC: "Bitcoin",
  CAD: "Canadian Dollar",
  CHF: "Swiss Franc",
  ETH: "Ethereum",
  EUR: "Euro",
  GBP: "British Pound",
  JPY: "Japanese Yen",
  LTC: "Litecoin",
  NZD: "New Zealand Dollar",
  USD: "US Dollar",
  XAG: "Silver",
  XAU: "Gold",
};

/**
 * Long-form name for a symbol, e.g. "Australian Dollar / Canadian Dollar".
 *
 * Used where a symbol needs to be recognisable rather than compact — the symbol
 * picker in particular, where a trader may be choosing an instrument they have
 * never charted before.
 */
export function describeSymbol(symbol: string): string {
  const definition = getSymbolDefinition(symbol);
  if (!definition) return symbol;
  const base = CURRENCY_NAMES[definition.baseCurrency];
  const quote = CURRENCY_NAMES[definition.quoteCurrency];
  if (!base || !quote) return definition.displayName;
  // An index quotes against a basket, so a "base / quote" reading would mislead.
  if (definition.baseCurrency === definition.symbol) return definition.displayName;
  return `${base} / ${quote}`;
}
