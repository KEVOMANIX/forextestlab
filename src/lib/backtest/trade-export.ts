import type { ClosedTrade } from "./types";

/**
 * The trade export: the trader's SIMULATED TRADE results as CSV. It deliberately
 * does NOT export the underlying market-data dataset, only the trades made.
 * Built on the server (`/api/backtest/sessions/[id]/export`), where the Pro
 * entitlement is checked.
 */
export function tradesCsv(trades: ClosedTrade[], sessionSymbol: string): string {
  const header = [
    // First column, because a multi-pair export without it is unusable: the
    // rows arrive interleaved with nothing to group them by.
    "symbol",
    "direction",
    "entryTime",
    "entryPrice",
    "exitTime",
    "exitPrice",
    "lots",
    "stopLoss",
    "takeProfit",
    "initialRiskAmount",
    "maxAdversePnl",
    "maxFavorablePnl",
    "commission",
    "pips",
    "pnl",
    "exitReason",
    "intrabarAmbiguous",
  ];
  const rows = trades.map((t) =>
    [
      // Trades saved before multi-pair execution carry no symbol of their own;
      // those were all taken on the session's traded pair.
      t.symbol ?? sessionSymbol,
      t.direction,
      new Date(t.entryTime).toISOString(),
      t.entryPrice,
      new Date(t.exitTime).toISOString(),
      t.exitPrice,
      t.lots,
      t.stopLoss ?? "",
      t.takeProfit ?? "",
      t.initialRiskAmount ?? "",
      t.maxAdversePnl ?? "",
      t.maxFavorablePnl ?? "",
      t.commission,
      t.pips,
      t.pnl,
      t.exitReason,
      String(t.intrabarAmbiguous),
    ].join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

/** Named for the session, not one of its pairs: a file called "EURUSD" holding GBP/USD trades misfiles itself. */
export function tradesCsvFileName(trades: ClosedTrade[], sessionSymbol: string, sessionId: string): string {
  const pairs = new Set(trades.map((t) => t.symbol ?? sessionSymbol));
  const label = pairs.size === 1 ? [...pairs][0] : `${pairs.size}-pairs`;
  return `forextestlab-${label}-${sessionId.slice(0, 8)}-trades.csv`;
}
