"use client";

import type { PublicSessionState } from "@/lib/backtest/types";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";
import { AnalyticsDesignPrototype } from "./AnalyticsDesignPrototype";

/** The same analytics experience used by the saved-session results route, shown over the live replay. */
export function SessionAnalyticsScreen({
  state,
  fullAccess,
  onClose,
}: {
  state: PublicSessionState;
  fullAccess: boolean;
  onClose: () => void;
}) {
  const containerRef = useModalBehavior<HTMLDivElement>({ open: true, onClose });

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Session analytics"
      data-testid="session-analytics-screen"
      className="fixed inset-0 z-[110] overflow-y-auto bg-[var(--app-bg)]"
    >
      <AnalyticsDesignPrototype
        mode="live"
        sessionId={state.sessionId}
        sessionName={state.config.name || "Backtest session"}
        symbols={state.config.symbols ?? [state.config.symbol]}
        startTime={state.config.startTime}
        endTime={state.config.endTime}
        status={state.status}
        trades={state.closedTrades}
        equityCurve={state.equityCurve}
        startingBalance={state.config.startingBalance}
        fullAccess={fullAccess}
        onClose={onClose}
      />
    </div>
  );
}
