"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChartMarker } from "./PriceChart";
import { BottomPanel } from "./BottomPanel";
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
import { PositionEditorModal } from "./PositionEditorModal";
import { TradeNotifications, type TradeNotification } from "./TradeNotifications";
import { EndOfDataModal } from "./EndOfDataModal";
import { TrialSessionLauncher } from "./TrialSessionLauncher";
import type { PlanEntitlements } from "@/lib/billing/entitlement-types";

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
  entitlements,
  autoStartTrial = false,
}: {
  resumeSessionId?: string | null;
  entitlements: PlanEntitlements;
  autoStartTrial?: boolean;
}) {
  const router = useRouter();
  const { theme, toggle } = useAppTheme();
  const bt = useBacktester(resumeSessionId);
  const { state, actions } = bt;
  const [trialSessionsRemaining, setTrialSessionsRemaining] = useState(
    entitlements.trialSessionsRemaining,
  );
  const effectiveEntitlements = useMemo<PlanEntitlements>(
    () => ({
      ...entitlements,
      trialSessionsRemaining,
      freeSessionUsed:
        entitlements.plan === "free" && trialSessionsRemaining === 0,
    }),
    [entitlements, trialSessionsRemaining],
  );
  const [plannedStop, setPlannedStop] = useState<string | null>(null);
  const [plannedTarget, setPlannedTarget] = useState<string | null>(null);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [editorPositionId, setEditorPositionId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<TradeNotification[]>([]);
  const autoTrialAttemptedRef = useRef(false);
  const notificationStateRef = useRef<{ sessionId: string | null; openIds: Set<string>; closedCount: number }>({ sessionId: null, openIds: new Set(), closedCount: 0 });
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [orderTemplate, setOrderTemplate] = useState<Omit<OrderRequest, "direction">>({
    sizingMode: "fixed-lots",
    lots: "0.10",
  });
  const hasMeaningfulActivity = Boolean(
    state?.openPositions.length || state?.closedTrades.length,
  );
  const launchTrial = useCallback(async () => {
    const started = await actions.startTrialSession();
    if (started && trialSessionsRemaining !== null) {
      setTrialSessionsRemaining((current) =>
        current === null ? null : Math.max(0, current - 1),
      );
    }
  }, [actions, trialSessionsRemaining]);

  useEffect(() => {
    if (
      !autoStartTrial ||
      autoTrialAttemptedRef.current ||
      bt.phase !== "setup" ||
      entitlements.plan !== "free" ||
      (trialSessionsRemaining ?? 0) <= 0
    ) {
      return;
    }
    autoTrialAttemptedRef.current = true;
    void launchTrial();
  }, [
    autoStartTrial,
    bt.phase,
    entitlements.plan,
    launchTrial,
    trialSessionsRemaining,
  ]);

  useEffect(() => {
    if (bt.phase !== "active") return;
    const handler = (event: BeforeUnloadEvent) => {
      if (!state?.openPositions.length && !bt.busy) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [bt.phase, bt.busy, state?.openPositions.length]);

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
  }, [state?.sessionId]);

  useEffect(() => {
    if (state && state.speed > entitlements.maxReplaySpeed) {
      actions.setSpeed(entitlements.maxReplaySpeed);
    }
  }, [state?.speed, entitlements.maxReplaySpeed, actions, state]);

  useEffect(() => {
    if (!state) return;
    const previous = notificationStateRef.current;
    const currentIds = new Set(state.openPositions.map((position) => position.id));
    if (previous.sessionId !== state.sessionId) {
      notificationStateRef.current = { sessionId: state.sessionId, openIds: currentIds, closedCount: state.closedTrades.length };
      return;
    }
    const added = state.openPositions.filter((position) => !previous.openIds.has(position.id));
    const newlyClosed = state.closedTrades.slice(previous.closedCount);
    const nextNotifications: TradeNotification[] = [
      ...added.map((position) => ({
        id: `open-${position.id}-${Date.now()}`,
        title: `${position.direction === "long" ? "Buy" : "Sell"} position opened`,
        detail: `${state.config.symbol}, ${position.lots} lot, open ${position.entryPrice}, SL ${position.stopLoss ?? "—"}, TP ${position.takeProfit ?? "—"}`,
        tone: position.direction as "long" | "short",
      })),
      ...newlyClosed.map((trade) => ({
        id: `close-${trade.id}-${Date.now()}`,
        title: trade.exitReason === "take-profit" ? "Take profit filled" : trade.exitReason === "stop-loss" ? "Stop loss filled" : "Position closed",
        detail: `${state.config.symbol}, ${trade.lots} lot, exit ${trade.exitPrice}, P&L ${trade.pnl}`,
        tone: "closed" as const,
      })),
    ];
    if (added.length > 0) setSelectedPositionId(added.at(-1)?.id ?? null);
    if (nextNotifications.length > 0) {
      setNotifications((current) => [...current, ...nextNotifications].slice(-4));
      for (const notification of nextNotifications) {
        window.setTimeout(() => setNotifications((current) => current.filter((item) => item.id !== notification.id)), 4_500);
      }
    }
    notificationStateRef.current = { sessionId: state.sessionId, openIds: currentIds, closedCount: state.closedTrades.length };
  }, [state]);

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
    for (const position of state.openPositions) {
      result.push({
        time: position.entryTime,
        position:
          position.direction === "long" ? "belowBar" : "aboveBar",
        color:
          position.direction === "long" ? "#22c3a0" : "#f4646c",
        shape:
          position.direction === "long" ? "arrowUp" : "arrowDown",
        text: position.direction === "long" ? "Buy" : "Sell",
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
        <div className="mx-auto mb-4 max-w-5xl">
          <BackLink />
        </div>
        {effectiveEntitlements.plan === "free" ? (
          <TrialSessionLauncher
            remaining={effectiveEntitlements.trialSessionsRemaining ?? 0}
            busy={bt.busy}
            error={bt.error}
            onStart={() => void launchTrial()}
          />
        ) : (
          <SessionSetup
            onStart={actions.startSession}
            busy={bt.busy}
            error={bt.error}
            entitlements={effectiveEntitlements}
          />
        )}
      </div>
    );
  }

  const position = state.openPositions.find((item) => item.id === selectedPositionId) ?? state.openPositions.at(-1) ?? null;
  const chartStop = position?.stopLoss ?? plannedStop;
  const chartTarget = position?.takeProfit ?? plannedTarget;

  const changeStop = (price: string | null) => {
    if (position) void actions.modifyStop(price, position.id);
    else setPlannedStop(price);
  };
  const changeTarget = (price: string | null) => {
    if (position) void actions.modifyTarget(price, position.id);
    else setPlannedTarget(price);
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
      stopLoss: plannedStop ?? undefined,
      takeProfit: plannedTarget ?? undefined,
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
          state.openPositions.length ? `${state.openPositions.length} open positions.` : "No open position."
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
          stopLoss={plannedStop}
          takeProfit={plannedTarget}
          onPlaceOrder={actions.placeOrder}
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
            positions={referencePair ? [] : state.openPositions}
            activePositionId={!referencePair ? position?.id ?? null : null}
            onEditPosition={(positionId) => {
              setSelectedPositionId(positionId);
              setEditorPositionId(positionId);
            }}
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
              state.status !== "finished" &&
              state.currentPrice &&
              !referencePair
            )}
            maxReplaySpeed={entitlements.maxReplaySpeed}
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
      <TradeNotifications notifications={notifications} onDismiss={(id) => setNotifications((current) => current.filter((item) => item.id !== id))} />
      <PositionEditorModal
        position={state.openPositions.find((item) => item.id === editorPositionId) ?? null}
        onDismiss={() => setEditorPositionId(null)}
        onSave={(positionId, stopLoss, takeProfit) => {
          void actions.modifyStop(stopLoss, positionId);
          void actions.modifyTarget(takeProfit, positionId);
        }}
        onClose={(positionId, lots) => void actions.closePosition(positionId, lots)}
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
      <EndOfDataModal
        open={bt.endOfData}
        currentEndTime={state.config.endTime}
        sessionStartTime={state.config.startTime}
        maxSessionDays={entitlements.maxSessionDays}
        isTrial={entitlements.plan === "free"}
        busy={bt.busy}
        error={bt.error}
        onAddData={actions.extendSessionData}
        onFinish={() => {
          void actions.endSession().then(() => {
            router.push(`/app/results/${state.sessionId}`);
          });
        }}
      />
    </div>
  );
}
