"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import type { ChartMarker } from "./PriceChart";
import { BottomPanel } from "./BottomPanel";
import { MarketDataNotice, SimulationNotice } from "./LegalNotices";
import { OrderTicket } from "./OrderTicket";
import { ReplayToolbar } from "./ReplayToolbar";
import { SessionSetup } from "./SessionSetup";
import {
  TerminalLeftRail,
  TerminalRightRail,
  TerminalTopBar,
} from "./TerminalChrome";
import { useAppTheme } from "./ThemeContext";
import { useBacktester } from "./useBacktester";
import { BackLink } from "./BackLink";
import { TradingOnboarding } from "./TradingOnboarding";
import type { OrderRequest } from "@/lib/backtest/types";

const PriceChart = dynamic(() => import("./PriceChart"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm app-muted">
      Loading chart…
    </div>
  ),
});

export function Backtester({
  resumeSessionId = null,
}: {
  resumeSessionId?: string | null;
}) {
  const { theme, toggle } = useAppTheme();
  const bt = useBacktester(resumeSessionId);
  const { state, actions } = bt;
  const [plannedStop, setPlannedStop] = useState<string | null>(null);
  const [plannedTarget, setPlannedTarget] = useState<string | null>(null);
  const [dockOpen, setDockOpen] = useState(true);
  const [orderTemplate, setOrderTemplate] = useState<Omit<OrderRequest, "direction">>({
    sizingMode: "fixed-lots",
    lots: "0.10",
  });
  const hasMeaningfulActivity = Boolean(
    state?.openPosition || state?.closedTrades.length,
  );

  useEffect(() => {
    if (bt.phase !== "active") return;
    const handler = (event: BeforeUnloadEvent) => {
      if (!state?.openPosition && !bt.busy) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [bt.phase, bt.busy, state?.openPosition]);

  useEffect(() => {
    if (bt.phase !== "active") return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === " ") {
        event.preventDefault();
        if (state?.status === "running") actions.pause();
        else actions.play();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        actions.stepNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
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
    const result: ChartMarker[] = [];
    for (const trade of state.closedTrades) {
      result.push({
        time: trade.entryTime,
        position: trade.direction === "long" ? "belowBar" : "aboveBar",
        color: trade.direction === "long" ? "#22c3a0" : "#f4646c",
        shape: trade.direction === "long" ? "arrowUp" : "arrowDown",
        text: trade.direction === "long" ? "Buy" : "Sell",
      });
      result.push({
        time: trade.exitTime,
        position: trade.direction === "long" ? "aboveBar" : "belowBar",
        color: "#93a1b8",
        shape: "circle",
        text: `Exit ${trade.pnl}`,
      });
    }
    if (state.openPosition) {
      result.push({
        time: state.openPosition.entryTime,
        position:
          state.openPosition.direction === "long" ? "belowBar" : "aboveBar",
        color:
          state.openPosition.direction === "long" ? "#22c3a0" : "#f4646c",
        shape:
          state.openPosition.direction === "long" ? "arrowUp" : "arrowDown",
        text: state.openPosition.direction === "long" ? "Buy" : "Sell",
      });
    }
    return result;
  }, [state]);

  if (bt.phase === "loading") {
    return (
      <div className="grid min-h-[70vh] place-items-center px-4">
        <div className="panel max-w-sm p-8 text-center">
          <p className="font-semibold">Restoring your session…</p>
          <p className="mt-2 text-sm app-muted">
            Loading revealed candles, trades, and your last replay position.
          </p>
        </div>
      </div>
    );
  }

  if (bt.phase === "setup" || !state) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-8">
        <div className="mx-auto mb-4 max-w-2xl">
          <BackLink />
        </div>
        <SessionSetup
          onStart={actions.startSession}
          busy={bt.busy}
          error={bt.error}
        />
        <div className="mx-auto mt-6 max-w-xl space-y-3">
          <SimulationNotice />
          <MarketDataNotice />
        </div>
      </div>
    );
  }

  const position = state.openPosition;
  const chartStop = position?.stopLoss ?? plannedStop;
  const chartTarget = position?.takeProfit ?? plannedTarget;

  const changeStop = (price: string | null) => {
    if (position) void actions.modifyStop(price);
    else setPlannedStop(price);
  };
  const changeTarget = (price: string | null) => {
    if (position) void actions.modifyTarget(price);
    else setPlannedTarget(price);
  };
  const closePosition = () => {
    if (!window.confirm("Close this position at the current simulated price?")) {
      return;
    }
    setPlannedStop(null);
    setPlannedTarget(null);
    void actions.closePosition();
  };
  const protectionPrice = (kind: "stop" | "target") => {
    if (!state.currentPrice) return null;
    const current = Number(state.currentPrice);
    const pip = Number(state.config.pipSize);
    const direction = position?.direction ?? "long";
    const distance = pip * (kind === "stop" ? 20 : 40);
    const price =
      direction === "long"
        ? current + (kind === "stop" ? -distance : distance)
        : current + (kind === "stop" ? distance : -distance);
    return price.toFixed(state.config.pricePrecision);
  };
  const toggleStop = () =>
    changeStop(chartStop ? null : protectionPrice("stop"));
  const toggleTarget = () =>
    changeTarget(chartTarget ? null : protectionPrice("target"));
  const clearProtection = () => {
    changeStop(null);
    changeTarget(null);
  };
  const activeSymbol = bt.activeSymbol ?? state.config.symbol;
  const referencePair =
    activeSymbol === state.config.symbol ? null : activeSymbol;
  const quickOrder = (direction: "long" | "short") => {
    actions.placeOrder({
      ...orderTemplate,
      direction,
      stopLoss: chartStop ?? undefined,
      takeProfit: chartTarget ?? undefined,
    });
  };
  const chartCandles = referencePair
    ? bt.pairChart?.candles ?? []
    : bt.initialCandles;
  const chartContextCandles = referencePair
    ? bt.pairChart?.contextCandles ?? []
    : bt.contextCandles;
  const chartLastCandle = referencePair ? null : bt.lastCandle;
  const chartCurrentCandle = referencePair
    ? chartCandles[chartCandles.length - 1] ?? null
    : null;
  const chartPipSize = referencePair
    ? Number(bt.pairChart?.pipSize ?? state.config.pipSize)
    : Number(state.config.pipSize);
  const chartPrecision = referencePair
    ? bt.pairChart?.pricePrecision ?? state.config.pricePrecision
    : state.config.pricePrecision;
  const confirmNavigation = () =>
    !hasMeaningfulActivity ||
    window.confirm(
      "Leave this chart? Your session is saved, but any open position will remain open.",
    );
  const newSession = () => {
    if (
      hasMeaningfulActivity &&
      !window.confirm(
        "Start a new session? Your current session will stay saved and can be resumed.",
      )
    ) {
      return;
    }
    actions.newSession();
  };
  const restart = () => {
    if (
      hasMeaningfulActivity &&
      !window.confirm(
        "Restart this session? All simulated trades and progress in it will be cleared.",
      )
    ) {
      return;
    }
    void actions.restart();
  };
  const endSession = () => {
    if (
      !window.confirm(
        "Finish this session now? Open positions will close at the current simulated price.",
      )
    ) {
      return;
    }
    void actions.endSession();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[var(--app-bg)]">
      <p className="sr-only" aria-live="polite">
        {`Candle ${state.visibleIndex + 1} of ${state.totalCandles}. Balance ${state.balance}. ${
          position ? `Open ${position.direction} position.` : "No open position."
        }`}
      </p>
      <TradingOnboarding />

      <TerminalTopBar
        state={state}
        theme={theme}
        onToggleTheme={toggle}
        onNewSession={newSession}
        activeSymbol={activeSymbol}
        onSwitchPair={actions.switchPair}
        saveStatus={bt.saveStatus}
        onNavigate={confirmNavigation}
        onRetrySave={actions.retrySave}
      >
        <OrderTicket
          state={state}
          busy={bt.busy}
          stopLoss={chartStop}
          takeProfit={chartTarget}
          onPlaceOrder={actions.placeOrder}
          onClose={closePosition}
          onTemplateChange={setOrderTemplate}
          referencePair={referencePair}
        />
      </TerminalTopBar>

      {bt.error && (
        <p
          role="alert"
          className="absolute right-3 top-12 z-40 max-w-md rounded-lg border border-bear/30 bg-[var(--app-panel)] px-3 py-2 text-sm text-bear shadow-xl"
        >
          {bt.error}
        </p>
      )}
      {bt.notice?.startsWith("Session resumed") && (
        <p className="absolute right-3 top-12 z-30 max-w-md rounded-lg border border-brand-400/25 bg-[var(--app-panel)] px-3 py-2 text-xs text-brand-300 shadow-xl">
          {bt.notice}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <TerminalLeftRail
          hasStop={Boolean(chartStop)}
          hasTarget={Boolean(chartTarget)}
          onToggleStop={toggleStop}
          onToggleTarget={toggleTarget}
          onClearProtection={clearProtection}
        />

        <div className="relative min-w-0 flex-1 overflow-hidden">
          <PriceChart
            key={`${state.sessionId}-${activeSymbol}-${bt.resetNonce}`}
            initialCandles={chartCandles}
            contextCandles={chartContextCandles}
            lastCandle={chartLastCandle}
            markers={referencePair ? [] : markers}
            entryPrice={!referencePair && position ? Number(position.entryPrice) : null}
            stopLoss={!referencePair && chartStop ? Number(chartStop) : null}
            takeProfit={!referencePair && chartTarget ? Number(chartTarget) : null}
            positionDirection={!referencePair ? position?.direction ?? null : null}
            currentPrice={
              referencePair
                ? chartCurrentCandle
                  ? Number(chartCurrentCandle.close)
                  : null
                : state.currentPrice
                  ? Number(state.currentPrice)
                  : null
            }
            baseTimeframe={state.config.timeframe}
            pipSize={chartPipSize}
            onStopLossChange={referencePair ? () => {} : changeStop}
            onTakeProfitChange={referencePair ? () => {} : changeTarget}
            onLoadHistory={(timeframe, before) =>
              actions.loadHistory(activeSymbol, timeframe, before)
            }
            precision={chartPrecision}
            theme={theme}
            loading={bt.pairLoading}
            storageKey={`${state.sessionId}:${activeSymbol}`}
          />
          <ReplayToolbar
            state={state}
            busy={bt.busy}
            onPlay={actions.play}
            onPause={actions.pause}
            onNext={actions.stepNext}
            onPrev={actions.stepPrev}
            onRestart={restart}
            onEnd={endSession}
            onSpeed={actions.setSpeed}
            onBuy={() => quickOrder("long")}
            onSell={() => quickOrder("short")}
            canTrade={Boolean(
              !bt.busy &&
              !position &&
              state.status !== "finished" &&
              state.currentPrice &&
              !referencePair
            )}
          />
        </div>

        <TerminalRightRail
          state={state}
          onNewSession={newSession}
          onNavigate={confirmNavigation}
        />
      </div>

      <div className="flex h-8 shrink-0 items-center gap-3 overflow-x-auto border-t app-border bg-[var(--app-panel)] px-2 text-[11px]">
        {state.anonymous && (
          <span className="shrink-0 text-[10px] font-semibold text-brand-300 sm:text-[11px]">
            Temporary demonstration
            <span> · </span>
            <Link
              href="/sign-up"
              className="font-semibold underline"
            >
              Create a free account
            </Link>
          </span>
        )}
        <button
          type="button"
          onClick={() => setDockOpen((open) => !open)}
          className="ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded bg-blue-600 px-2 font-semibold text-white hover:bg-blue-500"
          aria-expanded={dockOpen}
        >
          <BarChart3 size={12} aria-hidden />
          Analytics
          {dockOpen ? (
            <ChevronDown size={12} aria-hidden />
          ) : (
            <ChevronUp size={12} aria-hidden />
          )}
        </button>
      </div>

      {dockOpen && (
        <div className="h-44 shrink-0 md:h-48">
          <BottomPanel
            state={state}
            initialNotes={bt.notes}
            onSaveNotes={actions.saveNotes}
            busy={bt.busy}
          />
        </div>
      )}
    </div>
  );
}
