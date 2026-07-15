"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo } from "react";
import { RotateCcw } from "lucide-react";

import type { ChartMarker } from "./PriceChart";
import { BottomPanel } from "./BottomPanel";
import { DemoDataNotice, MarketDataNotice, SimulationNotice } from "./LegalNotices";
import { OrderTicket } from "./OrderTicket";
import { ReplayToolbar } from "./ReplayToolbar";
import { SessionSetup } from "./SessionSetup";
import { useAppTheme } from "./ThemeContext";
import { useBacktester } from "./useBacktester";

const PriceChart = dynamic(() => import("./PriceChart"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center app-muted text-sm">Loading chart…</div>
  ),
});

export function Backtester() {
  const { theme } = useAppTheme();
  const bt = useBacktester();
  const { state, actions } = bt;

  // Keyboard shortcuts for replay (ignored while typing in a field).
  useEffect(() => {
    if (bt.phase !== "active") return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === " ") {
        e.preventDefault();
        if (state?.status === "running") actions.pause();
        else actions.play();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        actions.stepNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        actions.stepPrev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bt.phase, state?.status, actions]);

  const markers = useMemo<ChartMarker[]>(() => {
    if (!state) return [];
    const out: ChartMarker[] = [];
    for (const t of state.closedTrades) {
      out.push({
        time: t.entryTime,
        position: t.direction === "long" ? "belowBar" : "aboveBar",
        color: t.direction === "long" ? "#22c3a0" : "#f4646c",
        shape: t.direction === "long" ? "arrowUp" : "arrowDown",
        text: t.direction === "long" ? "Buy" : "Sell",
      });
      out.push({
        time: t.exitTime,
        position: t.direction === "long" ? "aboveBar" : "belowBar",
        color: "#93a1b8",
        shape: "circle",
        text: `Exit ${t.pnl}`,
      });
    }
    if (state.openPosition) {
      out.push({
        time: state.openPosition.entryTime,
        position: state.openPosition.direction === "long" ? "belowBar" : "aboveBar",
        color: state.openPosition.direction === "long" ? "#22c3a0" : "#f4646c",
        shape: state.openPosition.direction === "long" ? "arrowUp" : "arrowDown",
        text: state.openPosition.direction === "long" ? "Buy" : "Sell",
      });
    }
    return out;
  }, [state]);

  if (bt.phase === "setup" || !state) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-8">
        <SessionSetup onStart={actions.startSession} busy={bt.busy} error={bt.error} />
        <div className="mx-auto mt-6 max-w-xl space-y-3">
          <SimulationNotice />
          <MarketDataNotice />
        </div>
      </div>
    );
  }

  const pos = state.openPosition;

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4">
      {/* aria-live region announces replay + order updates to assistive tech */}
      <p className="sr-only" aria-live="polite">
        {`Candle ${state.visibleIndex + 1} of ${state.totalCandles}. Balance ${state.balance}. ${
          pos ? `Open ${pos.direction} position.` : "No open position."
        }`}
      </p>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-lg font-semibold">
            {state.config.symbol} · {state.config.timeframe}
          </h1>
          {state.demoData && (
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-300">
              Demo data
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/app/results/${state.sessionId}`} className="btn-secondary py-2 text-xs">
            View results
          </Link>
          <button type="button" onClick={actions.newSession} className="btn-secondary py-2 text-xs">
            <RotateCcw size={14} aria-hidden /> New session
          </button>
        </div>
      </div>

      {bt.error && (
        <p role="alert" className="mb-3 rounded-lg border border-bear/30 bg-bear/10 px-3 py-2 text-sm text-bear">
          {bt.error}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        {/* Chart + toolbar */}
        <div className="panel flex flex-col overflow-hidden">
          <div className="h-[360px] sm:h-[440px] lg:h-[520px]">
            <PriceChart
              key={`${state.sessionId}-${bt.resetNonce}`}
              initialCandles={bt.initialCandles}
              lastCandle={bt.lastCandle}
              markers={markers}
              entryPrice={pos ? Number(pos.entryPrice) : null}
              stopLoss={pos?.stopLoss ? Number(pos.stopLoss) : null}
              takeProfit={pos?.takeProfit ? Number(pos.takeProfit) : null}
              precision={state.config.pricePrecision}
              theme={theme}
            />
          </div>
          <ReplayToolbar
            state={state}
            busy={bt.busy}
            onPlay={actions.play}
            onPause={actions.pause}
            onNext={actions.stepNext}
            onPrev={actions.stepPrev}
            onRestart={actions.restart}
            onEnd={actions.endSession}
            onSpeed={actions.setSpeed}
          />
        </div>

        {/* Order ticket */}
        <aside aria-label="Order ticket" className="lg:sticky lg:top-16 lg:self-start">
          <OrderTicket
            state={state}
            busy={bt.busy}
            onPlaceOrder={actions.placeOrder}
            onClose={actions.closePosition}
          />
        </aside>
      </div>

      <div className="mt-3">
        <BottomPanel state={state} onSaveNotes={actions.saveNotes} busy={bt.busy} />
      </div>

      <div className="mt-4 space-y-2">
        {state.demoData && <DemoDataNotice />}
        <SimulationNotice />
        <MarketDataNotice />
      </div>
    </div>
  );
}
