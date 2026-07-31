"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ChartMarker } from "./PriceChart";
import { BottomPanel, type BottomPanelTab } from "./BottomPanel";
import { TradeReviewCard } from "./TradeReviewCard";
import { PropFirmHud } from "./PropFirmHud";
import { PropFirmVerdict } from "./PropFirmVerdict";
import {
  buildJournalPrompts,
  dismissJournalPrompt,
  mergeJournalPrompts,
  EMPTY_JOURNAL_QUEUE,
  type JournalQueue,
} from "./journal-queue";
import { OrderTicket } from "./OrderTicket";
import { ReplayToolbar } from "./ReplayToolbar";
import { SessionSetup } from "./SessionSetup";
import {
  TerminalRightRail,
  TerminalTopBar,
} from "./TerminalChrome";
import { useAppTheme } from "./ThemeContext";
import { useBacktester } from "./useBacktester";
import { useChartWorkspace } from "./useChartWorkspace";
import { BackLink } from "./BackLink";
import { TradingOnboarding } from "./TradingOnboarding";
import type { OrderRequest, OrderType } from "@/lib/backtest/types";
import {
  defaultTradePlan,
  type TradePlan,
} from "@/lib/backtest/trade-plan";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PageLoader } from "@/components/PageLoader";
import { PositionEditorModal } from "./PositionEditorModal";
import { TradeNotifications, type TradeNotification } from "./TradeNotifications";
import { EndOfDataModal } from "./EndOfDataModal";
import { TrialSessionLauncher } from "./TrialSessionLauncher";
import type { PlanEntitlements } from "@/lib/billing/entitlement-types";
import { WorkspaceManager } from "./WorkspaceManager";
import { BacktestExperiencePanel } from "./BacktestExperiencePanel";
import { propFirmGuardMessage, tradingGuardMessage } from "@/lib/backtest/trade-guards";
import type { ReplayDiagnosticsSource } from "./ReplayDiagnosticsPanel";
import { recordReplayMetric } from "@/lib/performance/replay-metrics";
import { useCompactViewport } from "@/lib/ui/use-media-query";
import { modalIsOpen } from "@/lib/ui/use-modal-behavior";
import { SymbolPickerModal } from "./SymbolPickerModal";
import { TimeZonePicker } from "./TimeZonePicker";
import { symbolQuoteAt } from "@/lib/backtest/symbol-quote";
import { getSymbolDefinition } from "@/lib/market-data/symbols";

/** Toasts float over the chart, so the stack is capped at a readable few. */
const MAX_NOTIFICATIONS = 4;
/**
 * Journal prompts are paged, not stacked, so the cap only guards against a
 * runaway queue — a long unattended run should not hold every trade in memory
 * waiting to be written up.
 */
const MAX_JOURNAL_PROMPTS = 12;

type PendingConfirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  action: () => void;
};

const ChartGrid = dynamic(() => import("./ChartGrid"), {
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
  const renderStartedAt = performance.now();
  const router = useRouter();
  const compact = useCompactViewport();
  const { theme, toggle } = useAppTheme();
  const bt = useBacktester(resumeSessionId);
  const { state, actions } = bt;
  const workspaceSymbols = useMemo(
    () => state?.config.symbols?.length ? state.config.symbols : state ? [state.config.symbol] : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state?.config.symbol, state?.config.symbols?.join(",")],
  );
  // Chart preferences are shared by every chart in the session's workspace.
  const workspace = useChartWorkspace(String(bt.sessionId ?? "new"), Boolean(state && !state.anonymous), workspaceSymbols);
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
  const [tradePlan, setTradePlan] = useState<TradePlan | null>(null);
  const [orderTicketActivation, setOrderTicketActivation] = useState<{
    id: number;
    direction: "long" | "short";
    /** Set when the chart asked for a resting order at a specific price. */
    orderType?: OrderType;
  } | null>(null);
  const orderTicketActivationIdRef = useRef(0);
  const [chartHeaderSlot, setChartHeaderSlot] = useState<HTMLDivElement | null>(null);
  const [chartLayoutSlot, setChartLayoutSlot] = useState<HTMLDivElement | null>(null);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [editorPositionId, setEditorPositionId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<TradeNotification[]>([]);
  const notificationTimersRef = useRef<Set<number>>(new Set());
  const cancellationTimersRef = useRef<Map<string, number>>(new Map());
  const autoTrialAttemptedRef = useRef(false);
  const notificationStateRef = useRef<{
    sessionId: string | null;
    openIds: Set<string>;
    closedCount: number;
    pendingStatuses: Map<string, string>;
  }>({ sessionId: null, openIds: new Set(), closedCount: 0, pendingStatuses: new Map() });
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  /**
   * Trades queued for journalling, and where the card is in that queue.
   *
   * A queue rather than one card at a time: at 20 m/s several positions can
   * close within a few hundred milliseconds, and stacking cards — or pausing
   * once per trade — would bury the first behind the last. Replay pauses once
   * and the card pages through what closed.
   */
  const [journalQueue, setJournalQueue] = useState<JournalQueue>(EMPTY_JOURNAL_QUEUE);
  /** "Not this session": a fast run should not have to fight the prompt. */
  const journalPromptsMutedRef = useRef(false);
  const journalSettingsRef = useRef({
    pauseOnTradeClose: workspace.settings.pauseOnTradeClose,
    promptEntryReason: workspace.settings.promptEntryReason,
  });
  journalSettingsRef.current = {
    pauseOnTradeClose: workspace.settings.pauseOnTradeClose,
    promptEntryReason: workspace.settings.promptEntryReason,
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const [revealPanelTab, setRevealPanelTab] = useState<{
    tab: BottomPanelTab;
    nonce: number;
  } | null>(null);
  const revealNonceRef = useRef(0);
  const [verdictOpen, setVerdictOpen] = useState(false);
  /**
   * The verdict is announced once, when the run reaches it. Afterwards it is
   * reachable from the HUD, so a trader reviewing the breach can reopen it
   * without it reappearing over every candle.
   */
  const announcedVerdictRef = useRef<string | null>(null);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  useLayoutEffect(() => {
    recordReplayMetric("react-commit", performance.now() - renderStartedAt);
  });
  const [orderTemplate, setOrderTemplate] = useState<Omit<OrderRequest, "direction">>({
    sizingMode: "fixed-lots",
    lots: "0.10",
  });
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("forextestlab:order-defaults");
      if (saved) setOrderTemplate(JSON.parse(saved) as Omit<OrderRequest, "direction">);
    } catch {
      // Invalid local defaults fall back to the safe fixed-lot template.
    }
  }, [workspace.revision]);
  useEffect(() => {
    window.localStorage.setItem("forextestlab:order-defaults", JSON.stringify(orderTemplate));
  }, [orderTemplate]);
  const propFirmRules = state?.config.propFirm ?? null;
  const propFirmStatus = state?.propFirm?.status ?? null;
  useEffect(() => {
    if (!propFirmStatus || propFirmStatus === "active") return;
    const key = `${state?.sessionId ?? ""}:${propFirmStatus}`;
    if (announcedVerdictRef.current === key) return;
    announcedVerdictRef.current = key;
    setVerdictOpen(true);
  }, [propFirmStatus, state?.sessionId]);

  const hasMeaningfulActivity = Boolean(
    state?.openPositions.length || state?.closedTrades.length || state?.pendingOrders.length,
  );
  const launchTrial = useCallback(async () => {
    const started = await actions.startTrialSession();
    if (started && trialSessionsRemaining !== null) {
      setTrialSessionsRemaining((current) =>
        current === null ? null : Math.max(0, current - 1),
      );
    }
  }, [actions, trialSessionsRemaining]);

  /** Toasts expire on a timer, so every timer is tracked and cancelled on unmount. */
  const expireNotification = useCallback((id: string, timeout: number) => {
    if (timeout <= 0) return;
    const timer = window.setTimeout(() => {
      notificationTimersRef.current.delete(timer);
      setNotifications((current) => current.filter((item) => item.id !== id));
    }, timeout);
    notificationTimersRef.current.add(timer);
  }, []);

  const notify = useCallback((notification: TradeNotification, timeout = 5_000) => {
    setNotifications((current) =>
      [...current.filter((item) => item.id !== notification.id), notification].slice(
        -MAX_NOTIFICATIONS,
      ),
    );
    expireNotification(notification.id, timeout);
  }, [expireNotification]);

  /**
   * One-click trading is one click: a quote button or a buy/sell shortcut sends
   * the order straight through. The safeguards below (risk, daily loss,
   * drawdown, trade count) are what stand between a stray click and a bad
   * position — not a prompt.
   */
  const submitOrder = useCallback((order: OrderRequest) => {
    if (!state) return;
    // The challenge is the harder contract, so it is asked first: its message
    // names the rule that would actually end the run.
    const breach = propFirmGuardMessage(state, order);
    if (breach) {
      notify({
        id: `prop-guard-${Date.now()}`,
        title: "Order blocked by the challenge rules",
        detail: breach,
        tone: "warning",
      });
      return;
    }
    const guard = tradingGuardMessage(state, order, {
      maxRiskPerTradePercent: workspace.settings.maxRiskPerTradePercent,
      dailyLossLimitPercent: workspace.settings.dailyLossLimitPercent,
      maxDrawdownLimitPercent: workspace.settings.maxDrawdownLimitPercent,
      sessionTradeLimit: workspace.settings.sessionTradeLimit,
      sessionGoalAmount: workspace.settings.sessionGoalAmount,
    });
    if (guard) {
      notify({
        id: `guard-${Date.now()}`,
        title: "Order blocked by your safeguard",
        detail: guard,
        tone: "warning",
      });
      return;
    }
    actions.placeOrder(order);
  }, [actions, notify, state, workspace.settings]);

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
      if (target?.isContentEditable) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Buy and sell are single, unmodified keys. A dialog on screen means the
      // trader is answering a question, not trading, so nothing behind it may
      // act on a keystroke — least of all a market order.
      if (modalIsOpen()) return;
      const matches = (shortcut: string) =>
        event.key.toLowerCase() === shortcut.toLowerCase();
      if (matches(workspace.settings.shortcuts.toggleReplay)) {
        event.preventDefault();
        if (state?.status === "running") actions.pause();
        else actions.play();
      } else if (matches(workspace.settings.shortcuts.stepForward)) {
        event.preventDefault();
        actions.stepNext();
      } else if (matches(workspace.settings.shortcuts.stepBack)) {
        event.preventDefault();
        actions.stepPrev();
      } else if (matches(workspace.settings.shortcuts.buy)) {
        event.preventDefault();
        submitOrder({ ...orderTemplate, direction: "long" });
      } else if (matches(workspace.settings.shortcuts.sell)) {
        event.preventDefault();
        submitOrder({ ...orderTemplate, direction: "short" });
      } else if (matches(workspace.settings.shortcuts.bookmark)) {
        event.preventDefault();
        void actions.addBookmark();
      } else if (matches(workspace.settings.shortcuts.distractionFree)) {
        event.preventDefault();
        workspace.updateSettings({ distractionFree: !workspace.settings.distractionFree });
      } else if (matches(workspace.settings.shortcuts.reference)) {
        event.preventDefault();
        window.dispatchEvent(new Event("forextestlab:open-experience"));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bt.phase, state?.status, actions, orderTemplate, submitOrder, workspace]);

  useEffect(() => {
    setTradePlan(null);
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
    const pendingStatuses = new Map(
      state.pendingOrders.map((order) => [order.id, order.status]),
    );
    if (previous.sessionId !== state.sessionId) {
      notificationStateRef.current = { sessionId: state.sessionId, openIds: currentIds, closedCount: state.closedTrades.length, pendingStatuses };
      // A different session carries different trades, and "not this session"
      // was scoped to the one being left.
      setJournalQueue(EMPTY_JOURNAL_QUEUE);
      journalPromptsMutedRef.current = false;
      return;
    }
    const added = state.openPositions.filter((position) => !previous.openIds.has(position.id));
    const newlyClosed = state.closedTrades.slice(previous.closedCount);
    const journalling = !journalPromptsMutedRef.current;
    const { prompts: queued, reviewed: pauseWorthy } = buildJournalPrompts({
      opened: added,
      closed: newlyClosed,
      promptEntryReason:
        journalling && journalSettingsRef.current.promptEntryReason,
      pauseOnTradeClose:
        journalling && journalSettingsRef.current.pauseOnTradeClose,
    });
    // A trade getting a review card does not also get a toast: the card names
    // the exit reason and the P&L, and a toast repeating it just covers the
    // chart the trader was asked to look at.
    const reviewed = new Set(pauseWorthy.map((trade) => trade.id));
    const nextNotifications: TradeNotification[] = [
      ...added.map((position) => ({
        id: `open-${position.id}-${Date.now()}`,
        title: `${position.direction === "long" ? "Buy" : "Sell"} position opened`,
        detail: `${state.config.symbol}, ${position.lots} lot, open ${position.entryPrice}, SL ${position.stopLoss ?? "—"}, TP ${position.takeProfit ?? "—"}`,
        tone: position.direction as "long" | "short",
      })),
      ...newlyClosed.filter((trade) => !reviewed.has(trade.id)).map((trade) => ({
        id: `close-${trade.id}-${Date.now()}`,
        title: trade.intrabarAmbiguous ? "Ambiguous candle resolved" : trade.exitReason === "take-profit" ? "Take profit filled" : trade.exitReason === "stop-loss" ? "Stop loss filled" : "Position closed",
        detail: trade.intrabarAmbiguous
          ? `SL and TP were touched in one candle. The ${state.config.executionPolicy} policy selected ${trade.exitReason}.`
          : `${state.config.symbol}, ${trade.lots} lot, exit ${trade.exitPrice}, P&L ${trade.pnl}`,
        tone: (trade.intrabarAmbiguous ? "warning" : "closed") as TradeNotification["tone"],
      })),
      ...state.pendingOrders
        .filter((order) => {
          const oldStatus = previous.pendingStatuses.get(order.id);
          return oldStatus === "pending" &&
            (order.status === "activated" || order.status === "expired");
        })
        .map((order) => ({
          id: `pending-${order.id}-${order.status}-${Date.now()}`,
          title:
            order.status === "activated"
              ? `${order.direction === "long" ? "Buy" : "Sell"} ${order.orderType} activated`
              : "Pending order expired",
          detail:
            order.status === "activated"
              ? `${state.config.symbol}, ${order.lots} lot filled at ${order.fillPrice}`
              : `${state.config.symbol} ${order.direction === "long" ? "buy" : "sell"} ${order.orderType} at ${order.entryPrice}`,
          tone: (order.status === "activated"
            ? order.direction
            : "closed") as TradeNotification["tone"],
        })),
    ];
    if (pauseWorthy.length > 0 && state.status === "running") {
      void actionsRef.current.pause();
    }
    if (queued.length > 0) {
      setJournalQueue((current) =>
        mergeJournalPrompts(current, queued, {
          focusLast: pauseWorthy.length > 0,
          limit: MAX_JOURNAL_PROMPTS,
        }),
      );
    }

    if (added.length > 0) setSelectedPositionId(added.at(-1)?.id ?? null);
    if (nextNotifications.length > 0) {
      setNotifications((current) =>
        [...current, ...nextNotifications].slice(-MAX_NOTIFICATIONS),
      );
      for (const notification of nextNotifications) {
        expireNotification(notification.id, 4_500);
      }
    }
    notificationStateRef.current = { sessionId: state.sessionId, openIds: currentIds, closedCount: state.closedTrades.length, pendingStatuses };
  }, [state, expireNotification]);

  useEffect(() => () => {
    for (const timer of cancellationTimersRef.current.values()) window.clearTimeout(timer);
    cancellationTimersRef.current.clear();
    for (const timer of notificationTimersRef.current) window.clearTimeout(timer);
    notificationTimersRef.current.clear();
  }, []);

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

  /**
   * A symbol's quote at the replay clock. The traded symbol reads from the
   * session series; reference pairs from their own loaded series, which is null
   * until a chart (or the picker) has asked for it.
   */
  const symbolQuote = useCallback(
    (symbol: string) => {
      if (!state) return null;
      const series =
        symbol === state.config.symbol
          ? bt.replayCandles
          : bt.pairs[symbol]?.candles;
      if (!series?.length) return null;
      return symbolQuoteAt(
        series,
        state.currentTime ?? bt.lastCandle?.timestamp ?? null,
      );
    },
    [state, bt.replayCandles, bt.pairs, bt.lastCandle],
  );

  const symbolPrecision = useCallback(
    (symbol: string) => {
      if (state && symbol === state.config.symbol) return state.config.pricePrecision;
      return (
        bt.pairs[symbol]?.pricePrecision ??
        getSymbolDefinition(symbol)?.pricePrecision ??
        5
      );
    },
    [state, bt.pairs],
  );

  const sessionSymbolKey = workspaceSymbols.join(",");
  // Opening the picker loads any session pair no chart has asked for yet, so its
  // row shows a real quote instead of a dash.
  useEffect(() => {
    if (!symbolPickerOpen) return;
    for (const symbol of sessionSymbolKey.split(",")) {
      if (symbol) void actions.ensurePair(symbol);
    }
  }, [symbolPickerOpen, sessionSymbolKey, actions]);

  const requestCancelPending = useCallback((orderId: string) => {
    if (cancellationTimersRef.current.has(orderId)) return;
    const notificationId = `cancel-${orderId}`;
    const undo = () => {
      const timer = cancellationTimersRef.current.get(orderId);
      if (timer != null) window.clearTimeout(timer);
      cancellationTimersRef.current.delete(orderId);
      setNotifications((current) => current.filter((item) => item.id !== notificationId));
    };
    const timer = window.setTimeout(() => {
      cancellationTimersRef.current.delete(orderId);
      setNotifications((current) => current.filter((item) => item.id !== notificationId));
      void actions.cancelPending(orderId);
    }, 6_000);
    cancellationTimersRef.current.set(orderId, timer);
    notify({
      id: notificationId,
      title: "Pending order cancellation queued",
      detail: "The order will be cancelled in 6 seconds.",
      tone: "warning",
      actionLabel: "Undo cancellation",
      onAction: undo,
    }, 0);
  }, [actions, notify]);

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
  const replayDiagnostics: ReplayDiagnosticsSource = {
    sessionId: String(state.sessionId),
    status: state.status,
    speed: state.speed,
    currentTime: state.currentTime,
    visibleIndex: state.visibleIndex,
    totalCandles: state.totalCandles,
    stepMinutes: bt.replayStepMinutes,
    saveStatus: bt.saveStatus,
  };
  const chartStop = position?.stopLoss ?? null;
  const chartTarget = position?.takeProfit ?? null;

  const changeStop = (price: string | null) => {
    if (position) void actions.modifyStop(price, position.id);
  };
  const changeTarget = (price: string | null) => {
    if (position) void actions.modifyTarget(price, position.id);
  };
  const choosePlanDirection = (direction: "long" | "short") => {
    if (tradePlan?.direction === direction) return;
    setTradePlan(defaultTradePlan(state, direction));
  };
  const changeTradePlan = (
    level: keyof Omit<TradePlan, "direction">,
    value: string,
  ) => {
    setTradePlan((current) =>
      current ? { ...current, [level]: value } : current,
    );
  };
  const activeSymbol = bt.activeSymbol ?? state.config.symbol;
  const referencePair =
    activeSymbol === state.config.symbol ? null : activeSymbol;
  const activateOrderTicket = (
    direction: "long" | "short",
    orderType?: OrderType,
  ) => {
    orderTicketActivationIdRef.current += 1;
    setOrderTicketActivation({
      id: orderTicketActivationIdRef.current,
      direction,
      orderType,
    });
  };
  /**
   * "Buy/Sell at 1.08661" from a chart's right-click menu: the plan opens on the
   * price that was clicked rather than the market price, and the ticket comes
   * forward so the size and protection can be set before anything is sent.
   */
  const planAtPrice = (
    direction: "long" | "short",
    entryPrice: string,
    orderType: OrderType,
  ) => {
    const base = defaultTradePlan(state, direction);
    if (!base) return;
    // The plan carries the clicked price; the activation carries the order type
    // the chart worked out from which side of the market that price fell on.
    setTradePlan({ ...base, entryPrice });
    activateOrderTicket(direction, orderType);
  };
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
  const forkSession = async () => {
    if (!state || state.anonymous) return;
    // Local playback is intentionally ahead of server checkpoints. Pause first
    // so the fork is created from the exact candle visible to the trader.
    await actions.pause();
    const response = await fetch(`/api/backtest/sessions/${state.sessionId}/branch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${state.config.name || state.config.symbol} · alternative` }),
    });
    const result = await response.json() as { ok?: boolean; sessionId?: string; error?: string };
    if (response.ok && result.sessionId) {
      router.push(`/app/backtest?session=${encodeURIComponent(result.sessionId)}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[var(--app-bg)]">
      <p className="sr-only" aria-live="polite">
        {`Candle ${state.visibleIndex + 1} of ${state.totalCandles}. Balance ${state.balance}. ${
          state.openPositions.length ? `${state.openPositions.length} open positions.` : "No open position."
        }`}
      </p>
      <TradingOnboarding />

      {!workspace.settings.distractionFree && <TerminalTopBar
        state={state}
        theme={theme}
        onToggleTheme={toggle}
        onNewSession={newSession}
        saveStatus={bt.saveStatus}
        onNavigate={navigateFromChart}
        onRetrySave={actions.retrySave}
        endControls={
          <div className="flex shrink-0 items-center gap-1">
            <BacktestExperiencePanel settings={workspace.settings} onChange={workspace.updateSettings} diagnostics={replayDiagnostics} />
            {/* Workspace templates are a wide-screen convenience. Below `lg` the
                header's width goes to the controls needed while trading. */}
            <div className="hidden lg:block">
              <WorkspaceManager workspace={workspace} signedIn={!state.anonymous} />
            </div>
            <div ref={setChartLayoutSlot} className="flex shrink-0 items-center" />
          </div>
        }
      >
        {!compact && (
          <div ref={setChartHeaderSlot} className="flex min-w-0 flex-1 items-center gap-1" />
        )}
      </TerminalTopBar>}

      {workspace.settings.distractionFree && (
        <div className="absolute right-3 top-3 z-50 flex items-center gap-2">
          <BacktestExperiencePanel settings={workspace.settings} onChange={workspace.updateSettings} diagnostics={replayDiagnostics} />
          <button type="button" onClick={() => workspace.updateSettings({ distractionFree: false })} className="rounded-lg border app-border bg-[var(--app-panel)]/90 px-3 py-2 text-xs font-semibold shadow-xl backdrop-blur">
            Exit focus mode
          </button>
        </div>
      )}

      {/* Centred, and above the panels that also claim the top-right corner
          (focus-mode controls, replay diagnostics) so an error is never buried. */}
      {bt.error && (
        <p
          role="alert"
          className="absolute left-1/2 top-14 z-[95] w-[min(28rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-lg border border-bear/30 bg-[var(--app-panel-solid)] px-3 py-2 text-center text-sm text-bear shadow-2xl"
        >
          {bt.error}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {propFirmRules && state.propFirm && !workspace.settings.distractionFree && (
            <PropFirmHud
              rules={propFirmRules}
              runtime={state.propFirm}
              startingBalance={state.config.startingBalance}
              equity={state.equity}
              peakEquity={state.maxEquity}
              accountCurrency={state.config.accountCurrency}
              onShowVerdict={() => setVerdictOpen(true)}
            />
          )}
          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <ChartGrid
            key={`${state.sessionId}-${bt.resetNonce}-${workspace.revision}`}
            state={state}
            sessionSeries={bt.replayCandles}
            sessionContextCandles={bt.contextCandles}
            pairs={bt.pairs}
            pairLoadingSymbols={bt.pairLoadingSymbols}
            onNeedSymbol={actions.ensurePair}
            markers={markers}
            positions={state.openPositions}
            pendingOrders={state.pendingOrders}
            onModifyPendingOrder={(orderId, price) =>
              void actions.modifyPending(orderId, price)
            }
            onCancelPendingOrder={(orderId) =>
              requestCancelPending(orderId)
            }
            activePositionId={position?.id ?? null}
            onEditPosition={(positionId) => {
              setSelectedPositionId(positionId);
              setEditorPositionId(positionId);
            }}
            stopLoss={chartStop ? Number(chartStop) : null}
            takeProfit={chartTarget ? Number(chartTarget) : null}
            positionDirection={position?.direction ?? null}
            tradePlan={tradePlan}
            onPlanAtPrice={planAtPrice}
            onTradePlanChange={changeTradePlan}
            onStopLossChange={changeStop}
            onTakeProfitChange={changeTarget}
            onLoadHistory={actions.loadHistory}
            theme={theme}
            storageKey={String(state.sessionId)}
            focusedSymbol={activeSymbol}
            onFocusedSymbolChange={actions.switchPair}
            workspace={workspace}
            onOpenSymbolPicker={() => setSymbolPickerOpen(true)}
            headerSlot={chartHeaderSlot}
            layoutSlot={chartLayoutSlot}
            orderTicket={
              <OrderTicket
                state={state}
                busy={bt.busy}
                tradePlan={tradePlan}
                onDirectionChange={choosePlanDirection}
                onPlanChange={changeTradePlan}
                onClearPlan={() => setTradePlan(null)}
                onPlaceOrder={submitOrder}
                onTemplateChange={setOrderTemplate}
                oneClickTrading={workspace.settings.oneClickTrading}
                referencePair={referencePair}
                activationRequest={orderTicketActivation}
                onActivationHandled={(id) =>
                  setOrderTicketActivation((current) =>
                    current?.id === id ? null : current
                  )
                }
              />
            }
            axisCorner={
              <TimeZonePicker
                zone={workspace.settings.timeZone}
                theme={theme}
                onChange={(timeZone) => workspace.updateSettings({ timeZone })}
              />
            }
          />
          <ReplayToolbar
            key={`replay-toolbar-${workspace.revision}`}
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
            onBuy={() => activateOrderTicket("long")}
            onSell={() => activateOrderTicket("short")}
            canTrade={Boolean(
              state.status !== "finished" &&
              state.currentPrice &&
              !referencePair
            )}
            maxReplaySpeed={entitlements.maxReplaySpeed}
          />

          {journalQueue.prompts.length > 0 && (
            <TradeReviewCard
              prompts={journalQueue.prompts}
              index={journalQueue.index}
              symbol={state.config.symbol}
              accountCurrency={state.config.accountCurrency}
              anonymous={state.anonymous}
              onIndexChange={(index) =>
                setJournalQueue((current) => ({ ...current, index }))
              }
              onSave={actions.saveTradeJournal}
              onOpenJournal={() => {
                revealNonceRef.current += 1;
                setRevealPanelTab({ tab: "notes", nonce: revealNonceRef.current });
              }}
              onDismiss={() => setJournalQueue(dismissJournalPrompt)}
              onMute={() => {
                journalPromptsMutedRef.current = true;
                setJournalQueue(EMPTY_JOURNAL_QUEUE);
              }}
            />
          )}
          </div>
        </div>

        {!workspace.settings.distractionFree && <TerminalRightRail
          state={state}
          onNewSession={newSession}
          onNavigate={navigateFromChart}
        />}
      </div>

      {propFirmRules && state.propFirm && verdictOpen && (
        <PropFirmVerdict
          rules={propFirmRules}
          runtime={state.propFirm}
          startingBalance={state.config.startingBalance}
          equity={state.equity}
          peakEquity={state.maxEquity}
          accountCurrency={state.config.accountCurrency}
          onClose={() => setVerdictOpen(false)}
        />
      )}

      {!workspace.settings.distractionFree && <BottomPanel
        state={state}
        currentTime={state.currentTime ?? bt.lastCandle?.timestamp ?? null}
        timeZone={workspace.settings.timeZone}
        initialNotes={bt.notes}
        onSaveNotes={actions.saveNotes}
        busy={bt.busy}
        onCancelPending={requestCancelPending}
        onSaveTradeJournal={actions.saveTradeJournal}
        revealTab={revealPanelTab}
        onAddBookmark={() => void actions.addBookmark()}
        onUpdateBookmark={(id, note) => void actions.updateBookmark(id, note)}
        onDeleteBookmark={(id) => void actions.deleteBookmark(id)}
        onForkSession={() => void forkSession()}
      />}
      <TradeNotifications notifications={notifications} onDismiss={(id) => setNotifications((current) => current.filter((item) => item.id !== id))} />
      <PositionEditorModal
        state={state}
        position={state.openPositions.find((item) => item.id === editorPositionId) ?? null}
        onDismiss={() => setEditorPositionId(null)}
        onSave={(positionId, stopLoss, takeProfit) => {
          void actions.modifyStop(stopLoss, positionId);
          void actions.modifyTarget(takeProfit, positionId);
        }}
        onBreakEven={(positionId) => {
          const managed = state.openPositions.find((item) => item.id === positionId);
          if (managed) void actions.modifyStop(managed.entryPrice, positionId);
        }}
        onTrailingStop={(positionId, pips) =>
          void actions.modifyTrailing(pips, positionId)
        }
        onClose={(positionId, lots) => void actions.closePosition(positionId, lots)}
      />
      <SymbolPickerModal
        open={symbolPickerOpen}
        onClose={() => setSymbolPickerOpen(false)}
        sessionSymbols={workspaceSymbols}
        tradedSymbol={state.config.symbol}
        activeSymbol={activeSymbol}
        quoteFor={symbolQuote}
        precisionFor={symbolPrecision}
        loadingSymbols={bt.pairLoadingSymbols}
        // Mirrors the server: the pair cap applies to signed-in plans, while an
        // anonymous demonstration session is limited by expiry instead.
        canAddSymbols={state.anonymous || entitlements.maxPairsPerSession === null}
        busy={bt.busy}
        error={bt.error}
        onSelect={actions.switchPair}
        onAdd={(symbol) => {
          void actions.addPair(symbol).then((added) => {
            if (added) setSymbolPickerOpen(false);
          });
        }}
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
