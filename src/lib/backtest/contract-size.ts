/**
 * Simulator contract sizes, in base-asset units per lot.
 * Gold: 100 troy ounces; silver: 5,000 troy ounces; Bitcoin: 1 BTC;
 * US30 and NAS100: 1 index unit.
 * Broker contracts can vary; these are ForexTestLab's explicit conventions.
 * References:
 * https://help.oanda.com/eu/en/faqs/check-leverage-eu.htm
 * https://www.axi.com/files/pdf/AxiTrader-Product-Schedule.pdf
 * https://cdn.icmarkets.com/uploads/Cryptocurrency-Specification-Sheet.pdf
 */
export function contractUnitsPerLot(baseCurrency: string): number {
  switch (baseCurrency.toUpperCase()) {
    case "XAU": return 100;
    case "XAG": return 5000;
    case "BTC": return 1;
    case "USA30IDX": return 1;
    case "USATECHIDX": return 1;
    default: return 100000;
  }
}
