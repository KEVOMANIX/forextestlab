"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createSession,
  getPairChart,
  getStateWithToken,
  sendAction,
  replayIntervalMs,
  type CreateSessionBody,
  type PairChartData,
} from "@/lib/backtest/client";
import type { OrderRequest, PublicSessionState, ReplaySpeed } from "@/lib/backtest/types";
import { previewPosition } from "@/lib/backtest/replay-engine";
import type { Candle } from "@/lib/market-data/types";

export type Phase = "setup" | "loading" | "active";

interface BacktesterState {
  phase: Phase;
  sessionId: string | null;
  state: PublicSessionState | null;
  initialCandles: Candle[];
  contextCandles: Candle[];
  lastCandle: Candle | null;
  busy: boolean;
  error: string | null;
  notice: string | null;
  notes: string;
  activeSymbol: string | null;
  pairChart: PairChartData | null;
  pairLoading: boolean;
  saveStatus: "saved" | "saving" | "error";
  savedAt: number | null;
  /** Bumped on start/restart so the chart remounts with fresh data. */
  resetNonce: number;
}

const initial: BacktesterState = {
  phase: "setup",
  sessionId: null,
  state: null,
  initialCandles: [],
  contextCandles: [],
  lastCandle: null,
  busy: false,
  error: null,
  notice: null,
  notes: "",
  activeSymbol: null,
  pairChart: null,
  pairLoading: false,
  saveStatus: "saved",
  savedAt: null,
  resetNonce: 0,
};

export function useBacktester(resumeSessionId: string | null = null) {
  const [s, setS] = useState<BacktesterState>(() => ({
    ...initial,
    phase: resumeSessionId ? "loading" : "setup",
    busy: Boolean(resumeSessionId),
  }));
  const tokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const interactiveBusyRef = useRef(false);
  const actionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const autoStepPendingRef = useRef(false);
  const wantsReplayRunningRef = useRef(false);
  const stepRef = useRef<() => Promise<void>>(async () => {});
  const lastActionRef = useRef<Parameters<typeof sendAction>[2] | null>(null);

  const patch = useCallback((p: Partial<BacktesterState>) => {
    setS((prev) => ({ ...prev, ...p }));
  }, []);

  useEffect(() => {
    if (!resumeSessionId) return;
    let cancelled = false;

    const restore = async () => {
      const storedToken = window.sessionStorage.getItem(
        `forextestlab:session:${resumeSessionId}`,
      );
      tokenRef.current = storedToken;
      sessionIdRef.current = resumeSessionId;
      wantsReplayRunningRef.current = false;

      let res = await getStateWithToken(resumeSessionId, storedToken);
      if (!res.ok) {
        if (!cancelled) {
          setS({
            ...initial,
            phase: "setup",
            error: res.error,
          });
        }
        return;
      }

      // A browser tab closing cannot run a server replay timer, but its last
      // persisted status may still be "running". Resume safely in paused mode.
      if (res.state.status === "running") {
        const paused = await sendAction(resumeSessionId, storedToken, {
          type: "pause",
        });
        if (paused.ok) {
          res = { ...res, state: paused.state };
        }
      }

      if (cancelled) return;
      setS((prev) => ({
        phase: "active",
        sessionId: resumeSessionId,
        state: res.state,
        initialCandles: res.candles,
        contextCandles: res.contextCandles,
        lastCandle: res.candles[res.candles.length - 1] ?? null,
        busy: false,
        error: null,
        notice: `Session resumed: ${res.state.config.name || res.state.config.symbol}.`,
        notes: res.notes,
        activeSymbol: res.state.config.symbol,
        pairChart: null,
        pairLoading: false,
        saveStatus: "saved",
        savedAt: Date.now(),
        resetNonce: prev.resetNonce + 1,
      }));
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [resumeSessionId]);

  const startSession = useCallback(
    async (body: CreateSessionBody) => {
      if (interactiveBusyRef.current) return;
      interactiveBusyRef.current = true;
      patch({ busy: true, error: null, notice: null });
      const res = await createSession(body);
      interactiveBusyRef.current = false;
      if (!res.ok) {
        patch({ busy: false, error: res.error });
        return;
      }
      tokenRef.current = res.token;
      sessionIdRef.current = res.sessionId;
      window.sessionStorage.setItem(
        `forextestlab:session:${res.sessionId}`,
        res.token,
      );
      window.history.replaceState(
        null,
        "",
        `/app/backtest?session=${encodeURIComponent(res.sessionId)}`,
      );
      wantsReplayRunningRef.current = false;
      setS((prev) => ({
        phase: "active",
        sessionId: res.sessionId,
        state: res.state,
        initialCandles: res.candles,
        contextCandles: res.contextCandles,
        lastCandle: res.candles[res.candles.length - 1] ?? null,
        busy: false,
        error: null,
        notice: res.state.demoData
          ? "This session uses generated demonstration data and does not represent an actual market feed."
          : null,
        notes: "",
        activeSymbol: res.state.config.symbol,
        pairChart: null,
        pairLoading: false,
        saveStatus: "saved",
        savedAt: Date.now(),
        resetNonce: prev.resetNonce + 1,
      }));
    },
    [patch],
  );

  const runAction = useCallback(
    async (
      action: Parameters<typeof sendAction>[2],
      opts: {
        captureCandle?: boolean;
        background?: boolean;
        showBusy?: boolean;
        rollbackState?: PublicSessionState;
      } = {},
    ) => {
      const background = opts.background === true;
      const showBusy = opts.showBusy ?? !background;

      // Only one automatic step may wait or run at once. User commands are
      // queued behind it, so a slow candle request never makes controls flicker.
      if (
        background &&
        (autoStepPendingRef.current || interactiveBusyRef.current)
      ) return;
      if (showBusy && interactiveBusyRef.current) return;
      lastActionRef.current = action;

      if (background) autoStepPendingRef.current = true;
      if (showBusy) {
        interactiveBusyRef.current = true;
        patch({ busy: true, error: null, saveStatus: "saving" });
      } else {
        patch({ saveStatus: "saving" });
      }

      const task = actionQueueRef.current.then(async () => {
        const id = sessionIdRef.current;
        const token = tokenRef.current;
        if (!id) return;

        const res = await sendAction(id, token, action);
        if (!res.ok) {
          setS((prev) => ({
            ...prev,
            error: res.error,
            state: res.state ?? prev.state,
            saveStatus: "error",
          }));
          return;
        }

        const activeSymbol = s.activeSymbol;
        let refreshedPair: PairChartData | null = null;
        if (
          activeSymbol &&
          activeSymbol !== res.state.config.symbol &&
          action.type === "next"
        ) {
          const pair = await getPairChart(id, token, activeSymbol);
          if (pair.ok) refreshedPair = pair;
        }

        setS((prev) => {
          let nextState = res.state;
          // Pause is optimistic so it remains responsive while an already
          // running "next" request finishes ahead of the queued pause command.
          if (
            !wantsReplayRunningRef.current &&
            nextState.status === "running"
          ) {
            nextState = { ...nextState, status: "paused" };
          }
          return {
            ...prev,
            error: null,
            state: nextState,
            lastCandle:
              opts.captureCandle && res.newCandle
                ? res.newCandle
                : prev.lastCandle,
            pairChart: refreshedPair ?? prev.pairChart,
            saveStatus: "saved",
            savedAt: Date.now(),
          };
        });
      });

      actionQueueRef.current = task
        .catch(() => {
          patch({
            error: "The replay request failed. Please try again.",
            saveStatus: "error",
            ...(opts.rollbackState ? { state: opts.rollbackState } : {}),
          });
        })
        .finally(() => {
          if (background) autoStepPendingRef.current = false;
          if (showBusy) {
            interactiveBusyRef.current = false;
            patch({ busy: false });
          }
        });

      await actionQueueRef.current;
    },
    [patch, s.activeSymbol],
  );

  // Keep a stable reference to the latest "next" stepper for the interval loop.
  stepRef.current = useCallback(async () => {
    await runAction(
      { type: "next" },
      { captureCandle: true, background: true, showBusy: false },
    );
  }, [runAction]);

  const status = s.state?.status;
  const speed = s.state?.speed;

  // Auto-advance while running. A completion-aware loop preserves the target
  // cadence better than setInterval: network latency no longer adds a second
  // full interval or allows requests to pile up.
  useEffect(() => {
    const timeframe = s.state?.config.timeframe;
    if (status !== "running" || !speed || !timeframe) return;
    const interval = replayIntervalMs(speed as ReplaySpeed, timeframe);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delay: number) => {
      timer = setTimeout(async () => {
        const started = performance.now();
        await stepRef.current();
        if (cancelled) return;
        schedule(Math.max(0, interval - (performance.now() - started)));
      }, delay);
    };
    schedule(interval);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [status, speed, s.state?.config.timeframe]);

  const play = useCallback(() => {
    wantsReplayRunningRef.current = true;
    setS((prev) =>
      prev.state
        ? { ...prev, state: { ...prev.state, status: "running" } }
        : prev,
    );
    return runAction({ type: "start" }, { showBusy: false });
  }, [runAction]);
  const pause = useCallback(() => {
    wantsReplayRunningRef.current = false;
    // Stop the local timer immediately. The server pause command is serialized
    // behind any candle request that is already in flight.
    setS((prev) =>
      prev.state
        ? { ...prev, state: { ...prev.state, status: "paused" } }
        : prev,
    );
    return runAction({ type: "pause" }, { showBusy: false });
  }, [runAction]);
  const stepNext = useCallback(
    () => runAction({ type: "next" }, { captureCandle: true }),
    [runAction],
  );
  const stepPrev = useCallback(() => runAction({ type: "prev" }), [runAction]);
  const restart = useCallback(async () => {
    wantsReplayRunningRef.current = false;
    setS((prev) =>
      prev.state?.status === "running"
        ? { ...prev, state: { ...prev.state, status: "paused" } }
        : prev,
    );
    await runAction({ type: "restart" });
    // After a restart the chart must reload from scratch — refetch visible set.
    const id = s.sessionId;
    if (!id) return;
    const data = await getStateWithToken(id, tokenRef.current);
    if (data.ok) {
      setS((prev) => ({
        ...prev,
        state: data.state,
        initialCandles: data.candles,
        contextCandles: data.contextCandles,
        lastCandle: data.candles[data.candles.length - 1] ?? null,
        resetNonce: prev.resetNonce + 1,
        notes: data.notes,
        activeSymbol: data.state.config.symbol,
        pairChart: null,
        saveStatus: "saved",
        savedAt: Date.now(),
      }));
    }
  }, [runAction, s.sessionId]);
  const endSession = useCallback(() => {
    wantsReplayRunningRef.current = false;
    setS((prev) =>
      prev.state?.status === "running"
        ? { ...prev, state: { ...prev.state, status: "paused" } }
        : prev,
    );
    return runAction({ type: "end" });
  }, [runAction]);
  const setSpeed = useCallback(
    (value: ReplaySpeed) => {
      setS((prev) =>
        prev.state
          ? { ...prev, state: { ...prev.state, speed: value } }
          : prev,
      );
      return runAction(
        { type: "set-speed", speed: value },
        { showBusy: false },
      );
    },
    [runAction],
  );
  const placeOrder = useCallback(
    (order: OrderRequest) => {
      const rollbackState = s.state;
      const candle = s.lastCandle;
      if (rollbackState && candle && !rollbackState.openPosition) {
        const preview = previewPosition(rollbackState, candle, order);
        if (preview.ok && preview.position) {
          setS((prev) =>
            prev.state
              ? {
                  ...prev,
                  state: {
                    ...prev.state,
                    openPosition: preview.position ?? null,
                    lockedBeforeIndex: prev.state.visibleIndex,
                  },
                }
              : prev,
          );
        }
      }
      return runAction({
        type: "place-order",
        direction: order.direction,
        sizingMode: order.sizingMode,
        lots: order.lots,
        riskPercent: order.riskPercent,
        stopLoss: order.stopLoss ?? undefined,
        takeProfit: order.takeProfit ?? undefined,
      }, { rollbackState: rollbackState ?? undefined });
    },
    [runAction, s.lastCandle, s.state],
  );
  const closePosition = useCallback(
    () => runAction({ type: "close" }),
    [runAction],
  );
  const modifyStop = useCallback(
    (price: string | null) => runAction({ type: "modify-stop", price }),
    [runAction],
  );
  const modifyTarget = useCallback(
    (price: string | null) => runAction({ type: "modify-target", price }),
    [runAction],
  );
  const saveNotes = useCallback(
    async (notes: string) => {
      await runAction({ type: "notes", notes });
      setS((prev) => ({ ...prev, notes }));
    },
    [runAction],
  );
  const switchPair = useCallback(
    async (symbol: string) => {
      const id = sessionIdRef.current;
      const state = s.state;
      if (!id || !state) return;
      if (symbol === state.config.symbol) {
        patch({
          activeSymbol: symbol,
          pairChart: null,
          pairLoading: false,
          error: null,
        });
        return;
      }
      patch({ pairLoading: true, error: null });
      const pair = await getPairChart(id, tokenRef.current, symbol);
      if (!pair.ok) {
        patch({ pairLoading: false, error: pair.error });
        return;
      }
      patch({ activeSymbol: symbol, pairChart: pair, pairLoading: false });
    },
    [patch, s.state],
  );
  const retrySave = useCallback(() => {
    const action = lastActionRef.current;
    if (!action) return Promise.resolve();
    return runAction(action);
  }, [runAction]);
  const newSession = useCallback(() => {
    tokenRef.current = null;
    sessionIdRef.current = null;
    wantsReplayRunningRef.current = false;
    interactiveBusyRef.current = false;
    autoStepPendingRef.current = false;
    actionQueueRef.current = Promise.resolve();
    window.history.replaceState(null, "", "/app/backtest");
    setS(initial);
  }, []);

  return {
    ...s,
    actions: {
      startSession,
      play,
      pause,
      stepNext,
      stepPrev,
      restart,
      endSession,
      setSpeed,
      placeOrder,
      closePosition,
      modifyStop,
      modifyTarget,
      saveNotes,
      switchPair,
      retrySave,
      newSession,
    },
  };
}
