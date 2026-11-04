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
    symbol: "USA30IDXUSD",
    displayName: "US30",
    baseCurrency: "USA30IDX",
    quoteCurrency: "USD",
    pipSize: "1",
    pricePrecision: 3,
    demoBasePrice: "42000.000",
  },
  {
    symbol: "USA500IDXUSD",
    displayName: "US500",
    baseCurrency: "USA500IDX",
    quoteCurrency: "USD",
    pipSize: "0.1",
    pricePrecision: 3,
    demoBasePrice: "6500.000",
  },
  {
    symbol: "USATECHIDXUSD",
    displayName: "US100",
    baseCurrency: "USATECHIDX",
    quoteCurrency: "USD",
    pipSize: "1",
    pricePrecision: 3,
    demoBasePrice: "21000.000",
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
  {
    symbol: "LIGHTCMDUSD",
    displayName: "WTI / US Oil",
    baseCurrency: "LIGHTCMD",
    quoteCurrency: "USD",
    pipSize: "0.01",
    pricePrecision: 2,
    demoBasePrice: "68.00",
  },
];

/** HistData instruments absent from the Dukascopy catalogue. Keep them out of
 * Dukascopy sync and marketing counts; they appear only for HistData replays. */
const HISTDATA_ONLY_SYMBOLS = [
  "AUXAUD", "BCOUSD", "ETXEUR", "EURCZK", "EURDKK", "EURHUF", "EURNOK", "EURPLN", "EURSEK", "EURTRY",
  "FRXEUR", "GRXEUR", "HKXHKD", "JPXJPY", "NSXUSD", "SGDJPY", "SPXUSD", "UDXUSD", "UKXGBP",
  "USDCZK", "USDDKK", "USDHKD", "USDHUF", "USDMXN", "USDNOK", "USDPLN", "USDSEK", "USDSGD", "USDTRY", "USDZAR",
  "WTIUSD", "XAUAUD", "XAUCHF", "XAUEUR", "XAUGBP", "ZARJPY",
] as const;

const HISTDATA_INDEX_CODES = new Set(["AUXAUD", "ETXEUR", "FRXEUR", "GRXEUR", "HKXHKD", "JPXJPY", "NSXUSD", "SPXUSD", "UDXUSD", "UKXGBP"]);
const HISTDATA_ENERGY_CODES = new Set(["BCOUSD", "WTIUSD"]);

export const HISTDATA_ONLY_SYMBOL_DEFINITIONS: SymbolDefinition[] = HISTDATA_ONLY_SYMBOLS.map((symbol) => {
  const baseCurrency = symbol.slice(0, 3);
  const quoteCurrency = symbol.slice(3);
  const index = HISTDATA_INDEX_CODES.has(symbol);
  const energy = HISTDATA_ENERGY_CODES.has(symbol);
  const metal = baseCurrency === "XAU";
  const coarseFx = quoteCurrency === "JPY" || quoteCurrency === "HUF";
  const pricePrecision = index || energy || metal ? 2 : coarseFx ? 3 : 5;
  const pipSize = index ? "1" : energy || metal || coarseFx ? "0.01" : "0.0001";
  const displayName = symbol === "WTIUSD" ? "WTI / US Oil"
    : symbol === "BCOUSD" ? "Brent / US Oil"
      : index ? `${baseCurrency} Index / ${quoteCurrency}`
        : `${baseCurrency}/${quoteCurrency}`;
  return {
    symbol, displayName, baseCurrency, quoteCurrency, pipSize, pricePrecision,
    demoBasePrice: index ? "1000.00" : energy ? "80.00" : metal ? "2000.00" : coarseFx ? "100.000" : "1.00000",
  };
});

export const HISTDATA_SYMBOL_DEFINITIONS: SymbolDefinition[] = [...SYMBOL_DEFINITIONS, ...HISTDATA_ONLY_SYMBOL_DEFINITIONS];

export function getSymbolDefinition(
  symbol: string,
): SymbolDefinition | undefined {
  return HISTDATA_SYMBOL_DEFINITIONS.find((s) => s.symbol === symbol);
}

const FIAT_CURRENCIES = ["AUD", "CAD", "CHF", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "JPY", "MXN", "NOK", "NZD", "PLN", "SEK", "SGD", "TRY", "USD", "ZAR"];

/** The market group a symbol is listed under in the market picker and on the AI Analyst cards. */
export function marketCategory(item: Pick<MarketSymbol, "symbol" | "baseCurrency" | "quoteCurrency">): "Forex" | "Indices" | "Crypto" | "Metals" | "Energies" | "Stocks" {
  if (["BTC", "ETH", "LTC", "ADA"].includes(item.baseCurrency)) return "Crypto";
  if (["XAU", "XAG"].includes(item.baseCurrency)) return "Metals";
  if (["LIGHTCMD", "BRENTCMD", "GASCMD"].includes(item.baseCurrency) || HISTDATA_ENERGY_CODES.has(item.symbol)) return "Energies";
  if (item.symbol.includes("IDX") || item.symbol === "DXY" || HISTDATA_INDEX_CODES.has(item.symbol)) return "Indices";
  if (FIAT_CURRENCIES.includes(item.baseCurrency) && FIAT_CURRENCIES.includes(item.quoteCurrency)) return "Forex";
  return "Stocks";
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
  CZK: "Czech Koruna",
  DKK: "Danish Krone",
  ETH: "Ethereum",
  EUR: "Euro",
  GBP: "British Pound",
  HKD: "Hong Kong Dollar",
  HUF: "Hungarian Forint",
  JPY: "Japanese Yen",
  LTC: "Litecoin",
  MXN: "Mexican Peso",
  NOK: "Norwegian Krone",
  LIGHTCMD: "WTI Crude Oil",
  NZD: "New Zealand Dollar",
  PLN: "Polish Zloty",
  SEK: "Swedish Krona",
  SGD: "Singapore Dollar",
  TRY: "Turkish Lira",
  USD: "US Dollar",
  XAG: "Silver",
  XAU: "Gold",
  ZAR: "South African Rand",
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
