"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createSession,
  extendReplay,
  getPairChart,
  getChartHistory,
  getStateWithToken,
  sendAction,
  replayBatchSize,
  replayIntervalMs,
  type CreateSessionBody,
  type PairChartData,
} from "@/lib/backtest/client";
import type {
  EngineContext,
  OrderRequest,
  PublicSessionState,
  ReplaySpeed,
  ReplayStepMinutes,
} from "@/lib/backtest/types";
import {
  closePosition as closeLocalPosition,
  engineStateFromPublic,
  modifyStopLoss as modifyLocalStopLoss,
  modifyTakeProfit as modifyLocalTakeProfit,
  placeOrder as placeLocalOrder,
  publicSessionState,
  revealNext,
} from "@/lib/backtest/replay-engine";
import { TIMEFRAME_MS, type Candle, type Timeframe } from "@/lib/market-data/types";

export type Phase = "setup" | "loading" | "active";

interface BacktesterState {
  phase: Phase;
  sessionId: string | null;
  state: PublicSessionState | null;
  initialCandles: Candle[];
  replayCandles: Candle[];
  contextCandles: Candle[];
  lastCandle: Candle | null;
  lastCandles: Candle[];
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
  replayCandles: [],
  contextCandles: [],
  lastCandle: null,
  lastCandles: [],
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
  const replayExtendPendingRef = useRef(false);
  const replayStepRef = useRef<ReplayStepMinutes>(1);
  const [replayStepMinutes, setReplayStepMinutes] = useState<ReplayStepMinutes>(1);
  const wantsReplayRunningRef = useRef(false);
  const stepRef = useRef<(batchSize?: number) => Promise<void>>(async () => {});
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActionRef = useRef<Parameters<typeof sendAction>[2] | null>(null);
  const localEngineRef = useRef<EngineContext | null>(null);

  const hydrateLocalEngine = useCallback(
    (state: PublicSessionState, candles: Candle[]) => {
      localEngineRef.current = {
        state: engineStateFromPublic(state),
        candles,
      };
    },
    [],
  );

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
      hydrateLocalEngine(res.state, res.replayCandles);
      setS((prev) => ({
        phase: "active",
        sessionId: resumeSessionId,
        state: res.state,
        initialCandles: res.candles,
        replayCandles: res.replayCandles,
        contextCandles: res.contextCandles,
        lastCandle: res.candles[res.candles.length - 1] ?? null,
        lastCandles: [],
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
  }, [hydrateLocalEngine, resumeSessionId]);

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
      hydrateLocalEngine(res.state, res.replayCandles);
      setS((prev) => ({
        phase: "active",
        sessionId: res.sessionId,
        state: res.state,
        initialCandles: res.candles,
        replayCandles: res.replayCandles,
        contextCandles: res.contextCandles,
        lastCandle: res.candles[res.candles.length - 1] ?? null,
        lastCandles: [],
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
    [hydrateLocalEngine, patch],
  );

  const runAction = useCallback(
    async (
      action: Parameters<typeof sendAction>[2],
      opts: {
        captureCandle?: boolean;
        background?: boolean;
        showBusy?: boolean;
        rollbackState?: PublicSessionState;
        preserveLocalState?: boolean;
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
          if (res.state) localEngineRef.current = {
            state: engineStateFromPublic(res.state),
            candles: localEngineRef.current?.candles ?? [],
          };
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
          // A background save can finish after local playback has already
          // advanced further. Never rewind the browser to that older index.
          if (opts.preserveLocalState && localEngineRef.current) {
            nextState = publicSessionState(
              localEngineRef.current,
              prev.state?.anonymous ?? false,
            );
          } else if (
            prev.state &&
            prev.state.visibleIndex > nextState.visibleIndex
          ) {
            nextState = prev.state;
          } else if (localEngineRef.current) {
            localEngineRef.current.state = engineStateFromPublic(nextState);
          }
          // Pause is optimistic so it remains responsive while an already
          // running "next" request finishes ahead of the queued pause command.
          if (
            !wantsReplayRunningRef.current &&
            nextState.status === "running"
          ) {
            nextState = { ...nextState, status: "paused" };
          } else if (
            wantsReplayRunningRef.current &&
            nextState.status !== "finished"
          ) {
            nextState = { ...nextState, status: "running" };
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

  // Playback is browser-local for smooth ticks. Additional bounded candle
  // chunks are fetched only when playback reaches the current memory boundary.
  stepRef.current = useCallback(async (batchSize = 1) => {
    const engine = localEngineRef.current;
    if (!engine) return;
    const stepCount = Math.max(
      1,
      Math.round(
        (replayStepRef.current * TIMEFRAME_MS["1m"]) /
          TIMEFRAME_MS[engine.state.config.timeframe],
      ),
    ) * Math.max(1, batchSize);
    const advancedCandles: Candle[] = [];
    let extensionError: string | null = null;
    let finished = false;

    for (let index = 0; index < stepCount; index += 1) {
      const lastLoaded = engine.candles[engine.candles.length - 1];
      const atLoadedBoundary =
        engine.state.visibleIndex >= engine.state.totalCandles - 1;
      if (
        atLoadedBoundary &&
        lastLoaded &&
        lastLoaded.timestamp < engine.state.config.endTime
      ) {
        if (replayExtendPendingRef.current) break;
        const id = sessionIdRef.current;
        if (!id) break;
        replayExtendPendingRef.current = true;
        const extension = await extendReplay(id, tokenRef.current);
        replayExtendPendingRef.current = false;

        if (!extension.ok) {
          extensionError = extension.error;
          wantsReplayRunningRef.current = false;
          engine.state.status = "paused";
          break;
        }

        const newestTimestamp =
          engine.candles[engine.candles.length - 1]?.timestamp ?? 0;
        const newCandles = extension.candles.filter(
          (candle) => candle.timestamp > newestTimestamp,
        );
        if (newCandles.length > 0) {
          engine.candles.push(...newCandles);
          engine.state.totalCandles = engine.candles.length;
          setS((prev) => ({
            ...prev,
            replayCandles: [...prev.replayCandles, ...newCandles],
          }));
        }
      }

      if (!revealNext(engine)) {
        finished = true;
        wantsReplayRunningRef.current = false;
        break;
      }
      const candle = engine.candles[engine.state.visibleIndex];
      if (candle) advancedCandles.push(candle);
    }

    if (
      wantsReplayRunningRef.current &&
      engine.state.status !== "finished"
    ) {
      engine.state.status = "running";
    }
    const state = publicSessionState(engine, s.state?.anonymous ?? false);
    const candle = engine.candles[state.visibleIndex] ?? null;
    setS((prev) => ({
      ...prev,
      state,
      lastCandle: candle,
      lastCandles: advancedCandles,
      error: extensionError ?? prev.error,
    }));
    if (finished) {
      void runAction(
        { type: "end", targetIndex: engine.state.visibleIndex },
        { background: true, showBusy: false },
      );
    }
  }, [runAction, s.state?.anonymous]);

  const status = s.state?.status;

  const stopLocalScheduler = useCallback(() => {
    if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
    replayTimerRef.current = null;
  }, []);

  const startLocalScheduler = useCallback(() => {
    stopLocalScheduler();
    const schedule = (delayOverride?: number) => {
      const engine = localEngineRef.current;
      if (!engine || engine.state.status !== "running") return;
      const delay = replayIntervalMs(
        engine.state.speed,
        engine.state.config.timeframe,
        Math.max(
          1,
          Math.round(
            (replayStepRef.current * TIMEFRAME_MS["1m"]) /
              TIMEFRAME_MS[engine.state.config.timeframe],
          ),
        ),
      );
      const batchSize = replayBatchSize(
        engine.state.speed,
        engine.state.config.timeframe,
        Math.max(
          1,
          Math.round(
            (replayStepRef.current * TIMEFRAME_MS["1m"]) /
              TIMEFRAME_MS[engine.state.config.timeframe],
          ),
        ),
      );
      replayTimerRef.current = setTimeout(async () => {
        const started = performance.now();
        await stepRef.current(batchSize);
        const current = localEngineRef.current;
        if (!current || current.state.status !== "running") return;
        const nextDelay = replayIntervalMs(
          current.state.speed,
          current.state.config.timeframe,
          Math.max(
            1,
            Math.round(
              (replayStepRef.current * TIMEFRAME_MS["1m"]) /
                TIMEFRAME_MS[current.state.config.timeframe],
            ),
          ),
        );
        schedule(Math.max(0, nextDelay - (performance.now() - started)));
      }, delayOverride ?? delay);
    };
    schedule();
  }, [stopLocalScheduler]);

  useEffect(() => stopLocalScheduler, [stopLocalScheduler]);

  const checkpoint = useCallback(async (statusOverride?: "running" | "paused") => {
    const id = sessionIdRef.current;
    const engine = localEngineRef.current;
    if (!id || !engine) return;
    const targetIndex = engine.state.visibleIndex;
    patch({ saveStatus: "saving" });
    const task = actionQueueRef.current.then(async () => {
      const res = await sendAction(id, tokenRef.current, {
        type: "sync",
        targetIndex,
        status: statusOverride,
      });
      patch(
        res.ok
          ? { saveStatus: "saved", savedAt: Date.now() }
          : { saveStatus: "error", error: res.error },
      );
    });
    actionQueueRef.current = task.catch(() => {
      patch({ saveStatus: "error", error: "Replay progress could not be saved." });
    });
    await actionQueueRef.current;
  }, [patch]);

  // Persist progress in batches. Closing/pausing also checkpoints immediately.
  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => void checkpoint("running"), 3_000);
    return () => window.clearInterval(timer);
  }, [checkpoint, status]);

  const play = useCallback(() => {
    wantsReplayRunningRef.current = true;
    setS((prev) =>
      prev.state
        ? { ...prev, state: { ...prev.state, status: "running" } }
        : prev,
    );
    if (localEngineRef.current) localEngineRef.current.state.status = "running";
    startLocalScheduler();
    return checkpoint("running");
  }, [checkpoint, startLocalScheduler]);
  const pause = useCallback(() => {
    wantsReplayRunningRef.current = false;
    // Stop the local timer immediately. The server pause command is serialized
    // behind any candle request that is already in flight.
    setS((prev) =>
      prev.state
        ? { ...prev, state: { ...prev.state, status: "paused" } }
        : prev,
    );
    if (localEngineRef.current) localEngineRef.current.state.status = "paused";
    stopLocalScheduler();
    return checkpoint("paused");
  }, [checkpoint, stopLocalScheduler]);
  const stepNext = useCallback(
    async () => {
      await stepRef.current();
      await checkpoint("paused");
    },
    [checkpoint],
  );
  const stepPrev = useCallback(async () => {
    const engine = localEngineRef.current;
    if (!engine) return;
    const steps = Math.max(
      1,
      Math.round(
        (replayStepRef.current * TIMEFRAME_MS["1m"]) /
          TIMEFRAME_MS[engine.state.config.timeframe],
      ),
    );
    await runAction({ type: "prev", steps });
    const current = localEngineRef.current;
    if (!current) return;
    const visible = current.candles.slice(0, current.state.visibleIndex + 1);
    setS((prev) => ({
      ...prev,
      initialCandles: visible,
      lastCandle: visible[visible.length - 1] ?? null,
      lastCandles: [],
      resetNonce: prev.resetNonce + 1,
    }));
  }, [runAction]);
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
        replayCandles: data.replayCandles,
        contextCandles: data.contextCandles,
        lastCandle: data.candles[data.candles.length - 1] ?? null,
        lastCandles: [],
        resetNonce: prev.resetNonce + 1,
        notes: data.notes,
        activeSymbol: data.state.config.symbol,
        pairChart: null,
        saveStatus: "saved",
        savedAt: Date.now(),
      }));
      hydrateLocalEngine(data.state, data.replayCandles);
    }
  }, [hydrateLocalEngine, runAction, s.sessionId]);
  const endSession = useCallback(() => {
    wantsReplayRunningRef.current = false;
    setS((prev) =>
      prev.state?.status === "running"
        ? { ...prev, state: { ...prev.state, status: "paused" } }
        : prev,
    );
    return runAction({
      type: "end",
      targetIndex: localEngineRef.current?.state.visibleIndex,
    });
  }, [runAction]);
  const setSpeed = useCallback(
    (value: ReplaySpeed) => {
      setS((prev) =>
        prev.state
          ? { ...prev, state: { ...prev.state, speed: value } }
          : prev,
      );
      if (localEngineRef.current) localEngineRef.current.state.speed = value;
      if (localEngineRef.current?.state.status === "running") {
        startLocalScheduler();
      }
      return runAction(
        { type: "set-speed", speed: value },
        { showBusy: false },
      );
    },
    [runAction, startLocalScheduler],
  );
  const setReplayStep = useCallback(
    (value: ReplayStepMinutes) => {
      replayStepRef.current = value;
      setReplayStepMinutes(value);
      if (localEngineRef.current?.state.status === "running") {
        startLocalScheduler();
      }
    },
    [startLocalScheduler],
  );
  const placeOrder = useCallback(
    (order: OrderRequest) => {
      const rollbackState = s.state;
      const engine = localEngineRef.current;
      if (engine) {
        const result = placeLocalOrder(engine, order);
        if (result.ok) {
          const state = publicSessionState(engine, rollbackState?.anonymous ?? false);
          setS((prev) => ({ ...prev, state }));
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
        targetIndex: localEngineRef.current?.state.visibleIndex,
      }, { rollbackState: rollbackState ?? undefined, showBusy: false, preserveLocalState: true });
    },
    [runAction, s.state],
  );
  const closePosition = useCallback(
    (positionId?: string, lots?: string) => {
      const rollbackState = s.state;
      const engine = localEngineRef.current;
      if (engine) {
        const result = closeLocalPosition(engine, positionId, lots);
        if (result.ok) {
          const state = publicSessionState(engine, rollbackState?.anonymous ?? false);
          setS((prev) => ({ ...prev, state }));
        }
      }
      return runAction({
        type: "close",
        positionId,
        lots,
        targetIndex: localEngineRef.current?.state.visibleIndex,
      }, { rollbackState: rollbackState ?? undefined, showBusy: false, preserveLocalState: true });
    },
    [runAction, s.state],
  );
  const modifyStop = useCallback(
    (price: string | null, positionId?: string) => {
      const rollbackState = s.state;
      const engine = localEngineRef.current;
      if (engine && modifyLocalStopLoss(engine, price, positionId).ok) {
        const state = publicSessionState(engine, rollbackState?.anonymous ?? false);
        setS((prev) => ({ ...prev, state }));
      }
      return runAction({
        type: "modify-stop",
        positionId,
        price,
        targetIndex: localEngineRef.current?.state.visibleIndex,
      }, { rollbackState: rollbackState ?? undefined, showBusy: false, preserveLocalState: true });
    },
    [runAction, s.state],
  );
  const modifyTarget = useCallback(
    (price: string | null, positionId?: string) => {
      const rollbackState = s.state;
      const engine = localEngineRef.current;
      if (engine && modifyLocalTakeProfit(engine, price, positionId).ok) {
        const state = publicSessionState(engine, rollbackState?.anonymous ?? false);
        setS((prev) => ({ ...prev, state }));
      }
      return runAction({
        type: "modify-target",
        positionId,
        price,
        targetIndex: localEngineRef.current?.state.visibleIndex,
      }, { rollbackState: rollbackState ?? undefined, showBusy: false, preserveLocalState: true });
    },
    [runAction, s.state],
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
  const loadHistory = useCallback(
    async (symbol: string, timeframe: Timeframe, before: number) => {
      const id = sessionIdRef.current;
      if (!id) return { candles: [], hasMore: false };
      const result = await getChartHistory(
        id,
        tokenRef.current,
        symbol,
        timeframe,
        before,
      );
      if (!result.ok) {
        patch({ error: result.error });
        return { candles: [], hasMore: false };
      }
      return { candles: result.candles, hasMore: result.hasMore };
    },
    [patch],
  );
  const newSession = useCallback(() => {
    tokenRef.current = null;
    sessionIdRef.current = null;
    wantsReplayRunningRef.current = false;
    interactiveBusyRef.current = false;
    autoStepPendingRef.current = false;
    replayExtendPendingRef.current = false;
    replayStepRef.current = 1;
    setReplayStepMinutes(1);
    stopLocalScheduler();
    localEngineRef.current = null;
    actionQueueRef.current = Promise.resolve();
    window.history.replaceState(null, "", "/app/backtest");
    setS(initial);
  }, [stopLocalScheduler]);

  return {
    ...s,
    replayStepMinutes,
    actions: {
      startSession,
      play,
      pause,
      stepNext,
      stepPrev,
      restart,
      endSession,
      setSpeed,
      setReplayStep,
      placeOrder,
      closePosition,
      modifyStop,
      modifyTarget,
      saveNotes,
      switchPair,
      retrySave,
      loadHistory,
      newSession,
    },
  };
}
