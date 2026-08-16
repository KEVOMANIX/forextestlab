"use client";

import { createContext, useContext } from "react";

/**
 * Lets a cited trade number inside an AI answer jump to that trade in the
 * ledger. The AI panel is handed to the analytics screen as a ReactNode from a
 * server component, so it cannot receive a callback as a prop — context reaches
 * it through the rendered tree instead.
 *
 * A null value means citations are not navigable here (the portfolio-scoped
 * panel on the dashboard spans many sessions, so a bare trade number would be
 * ambiguous). Consumers render plain text in that case.
 */
export type TradeFocus = {
  /** Highest valid trade number; anything above it is not rendered as a link. */
  tradeCount: number;
  focusTrade: (tradeNumber: number) => void;
};

const TradeFocusContext = createContext<TradeFocus | null>(null);

export const TradeFocusProvider = TradeFocusContext.Provider;

export function useTradeFocus() {
  return useContext(TradeFocusContext);
}
