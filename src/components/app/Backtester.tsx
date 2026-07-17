"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
import { ConfirmModal } from "@/components/ConfirmModal";
import { PageLoader } from "@/components/PageLoader";

type PendingConfirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  action: () => void;
};

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
  const router = useRouter();
  const { theme, toggle } = useAppTheme();
  const bt = useBacktester(resumeSessionId);
  const { state, actions } = bt;
  const [plannedStop, setPlannedStop] = useState<string | null>(null);
  const [plannedTarget, setPlannedTarget] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
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
    return <PageLoader />;
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
    setPendingConfirmation({
      title: "Close position?",
      message: "The position will close at the current simulated price.",
      confirmLabel: "Close position",
      danger: true,
      action: () => {
        setPlannedStop(null);
        setPlannedTarget(null);
        void actions.closePosition();
      },
    });
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
  const chartLastCandles = referencePair ? [] : bt.lastCandles;
  const chartCurrentCandle = referencePair
    ? chartCandles[chartCandles.length - 1] ?? null
    : null;
  const chartPipSize = referencePair
    ? Number(bt.pairChart?.pipSize ?? state.config.pipSize)
    : Number(state.config.pipSize);
  const chartPrecision = referencePair
    ? bt.pairChart?.pricePrecision ?? state.config.pricePrecision
    : state.config.pricePrecision;
  const navigateFromChart = (href: string) => {
    if (!hasMeaningfulActivity) {
      router.push(href);
      return;
    }
    setPendingConfirmation({
      title: "Leave session?",
      message: "Your progress is saved. Any open position will remain open.",
      confirmLabel: "Leave session",
      action: () => router.push(href),
    });
  };
  const newSession = () => {
    if (!hasMeaningfulActivity) {
      actions.newSession();
      return;
    }
    setPendingConfirmation({
      title: "Start a new session?",
      message: "This session will remain saved and can be resumed later.",
      confirmLabel: "New session",
      action: actions.newSession,
    });
  };
  const restart = () => {
    if (!hasMeaningfulActivity) {
      void actions.restart();
      return;
    }
    setPendingConfirmation({
      title: "Restart session?",
      message: "All trades and replay progress in this session will be cleared.",
      confirmLabel: "Restart",
      danger: true,
      action: () => void actions.restart(),
    });
  };
  const endSession = () => {
    setPendingConfirmation({
      title: "Finish session?",
      message: "Any open position will close at the current simulated price.",
      confirmLabel: "Finish session",
      action: () => void actions.endSession(),
    });
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
        onNavigate={navigateFromChart}
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
            lastCandles={chartLastCandles}
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
            stepMinutes={bt.replayStepMinutes}
            onStepMinutes={actions.setReplayStep}
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
          onNavigate={navigateFromChart}
        />
      </div>

      <BottomPanel
        state={state}
        currentTime={bt.lastCandle?.timestamp ?? null}
        initialNotes={bt.notes}
        onSaveNotes={actions.saveNotes}
        busy={bt.busy}
      />
      <ConfirmModal
        open={Boolean(pendingConfirmation)}
        title={pendingConfirmation?.title ?? "Confirm action"}
        message={pendingConfirmation?.message ?? ""}
        confirmLabel={pendingConfirmation?.confirmLabel}
        danger={pendingConfirmation?.danger}
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={() => {
          const action = pendingConfirmation?.action;
          setPendingConfirmation(null);
          action?.();
        }}
      />
    </div>
  );
}
