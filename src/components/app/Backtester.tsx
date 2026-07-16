"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
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
  const [plannedStop, setPlannedStop] = useState<string | null>(null);
  const [plannedTarget, setPlannedTarget] = useState<string | null>(null);

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

  useEffect(() => {
    setPlannedStop(null);
    setPlannedTarget(null);
  }, [state?.sessionId, state?.openPosition?.id]);

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
  const chartStop = pos?.stopLoss ?? plannedStop;
  const chartTarget = pos?.takeProfit ?? plannedTarget;

  const changeStop = (price: string | null) => {
    if (pos) void actions.modifyStop(price);
    else setPlannedStop(price);
  };
  const changeTarget = (price: string | null) => {
    if (pos) void actions.modifyTarget(price);
    else setPlannedTarget(price);
  };
  const closePosition = () => {
    setPlannedStop(null);
    setPlannedTarget(null);
    void actions.closePosition();
  };

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
          {!state.anonymous && (
            <Link href={`/app/results/${state.sessionId}`} className="btn-secondary py-2 text-xs">
              View results
            </Link>
          )}
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

      <div className="space-y-3">
        <section aria-label="Trading header">
          <OrderTicket
            state={state}
            busy={bt.busy}
            stopLoss={chartStop}
            takeProfit={chartTarget}
            onPlaceOrder={actions.placeOrder}
            onClose={closePosition}
          />
        </section>

        <div className="panel overflow-hidden">
          <div className="relative h-[420px] sm:h-[520px] lg:h-[620px]">
            <PriceChart
              key={`${state.sessionId}-${bt.resetNonce}`}
              initialCandles={bt.initialCandles}
              lastCandle={bt.lastCandle}
              markers={markers}
              entryPrice={pos ? Number(pos.entryPrice) : null}
              stopLoss={chartStop ? Number(chartStop) : null}
              takeProfit={chartTarget ? Number(chartTarget) : null}
              positionDirection={pos?.direction ?? null}
              currentPrice={state.currentPrice ? Number(state.currentPrice) : null}
              baseTimeframe={state.config.timeframe}
              pipSize={Number(state.config.pipSize)}
              onStopLossChange={changeStop}
              onTakeProfitChange={changeTarget}
              precision={state.config.pricePrecision}
              theme={theme}
            />
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
        </div>
      </div>

      <div className="mt-3">
        <BottomPanel state={state} onSaveNotes={actions.saveNotes} busy={bt.busy} />
      </div>

      <div className="mt-4 space-y-2">
        {state.anonymous && (
          <p className="rounded-lg border border-brand-400/25 bg-brand-400/10 px-3 py-2 text-sm text-brand-300">
            This is a temporary demonstration.{" "}
            <Link href="/sign-up" className="font-semibold underline">
              Create a free account
            </Link>{" "}
            to save private sessions, notes, history, and results.
          </p>
        )}
        {state.demoData && <DemoDataNotice />}
        <SimulationNotice />
        <MarketDataNotice />
      </div>
    </div>
  );
}
