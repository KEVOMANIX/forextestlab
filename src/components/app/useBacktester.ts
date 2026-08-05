"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  addSessionPair,
  createSession,
  createTrialSession,
  extendReplay,
  extendSessionRange,
  getPairChart,
  getChartHistory,
  getStateWithToken,
  sendAction,
  nextReplayBatch,
  type CreateSessionBody,
  type CreatedSession,
  type PairChartData,
} from "@/lib/backtest/client";
import type {
  EngineContext,
  OrderRequest,
  PublicSessionState,
  ReplaySpeed,
  ReplayStepMinutes,
  TradeJournalUpdate,
} from "@/lib/backtest/types";
import {
  closeAllPositions as closeAllLocalPositions,
  closePosition as closeLocalPosition,
  engineStateFromPublic,
  modifyStopLoss as modifyLocalStopLoss,
  modifyTakeProfit as modifyLocalTakeProfit,
  modifyTrailingStop as modifyLocalTrailingStop,
  modifyPendingOrder as modifyLocalPendingOrder,
  cancelPendingOrder as cancelLocalPendingOrder,
  placeOrder as placeLocalOrder,
  publicSessionState,
  revealNext,
  stepBackTo as stepBackLocalTo,
} from "@/lib/backtest/replay-engine";
import type { GoToTarget } from "@/lib/backtest/goto";
import { TIMEFRAME_MS, type Candle, type Timeframe } from "@/lib/market-data/types";
import { candleBucketStart } from "@/lib/market-data/aggregation";
import { updateTradeJournal as updateLocalTradeJournal } from "@/lib/backtest/trade-journal";
import { recordReplayMetric } from "@/lib/performance/replay-metrics";
import { publishReplayVisual } from "@/lib/backtest/replay-visual-bus";
import {
  replayBufferTargetCandles,
  retryReplayChunk,
  updateReplayFetchLatency,
} from "@/lib/backtest/replay-buffer";

export type Phase = "setup" | "loading" | "active";

/**
 * How a jump ended.
 *
 * "limit" covers both guards below and a failed chunk fetch: in every case the
 * replay stopped somewhere valid and jumping again continues from there, which
 * is what the caller needs to tell the trader.
 */
export interface JumpOutcome {
  reason: "target" | "end-of-data" | "limit" | "behind" | "unavailable";
  candles: number;
}

/**
 * A jump reveals candles one at a time, so its cost is bounded twice: by candles
 * (a month of 1-minute data is roughly 30,000) and by chunk fetches, which are
 * network round-trips and rate limited server-side.
 */
const JUMP_MAX_CANDLES = 250_000;
/** Below the server's own extend rate limit, so one jump cannot spend it all. */
const JUMP_MAX_EXTENSIONS = 24;
/** Candles revealed between yields to the browser during a jump. */
const JUMP_YIELD_EVERY = 2_000;

/** Whether the candle just revealed satisfies the jump's target. */
function jumpReached(
  target: GoToTarget,
  candle: Candle,
  engine: EngineContext,
  closedAtStart: number,
): boolean {
  if (target.kind === "time") return candle.timestamp >= target.timestamp;
  if (target.kind === "position-close") {
    return engine.state.closedTrades.length > closedAtStart;
  }
  // A price is "reached" when the candle traded through it, which includes a
  // gap that opened straight past the level.
  const high = Number(candle.high);
  const low = Number(candle.low);
  return (
    Number.isFinite(high) &&
    Number.isFinite(low) &&
    low <= target.price &&
    target.price <= high
  );
}

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
  /**
   * Full session series for every symbol shown in a chart cell other than the
   * session symbol, fetched once and revealed against the replay clock by the
   * cell itself. Refetching a truncated snapshot per candle could never keep up
   * with local playback.
   */
  pairs: Record<string, PairChartData>;
  /** Symbols with a fetch in flight. */
  pairLoadingSymbols: string[];
  saveStatus: "saved" | "saving" | "error";
  savedAt: number | null;
  endOfData: boolean;
  /** Bumped on start/restart so the chart remounts with fresh data. */
  resetNonce: number;
  /**
   * True only while a `jumpTo` is in flight, unlike `busy` which also covers
   * every other async action. Kept separate so the chart can show a jump
   * spinner without lighting up for a step or a restart.
   */
  jumping: boolean;
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
  pairs: {},
  pairLoadingSymbols: [],
  saveStatus: "saved",
  savedAt: null,
  endOfData: false,
  resetNonce: 0,
  jumping: false,
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
  const checkpointPendingRef = useRef<Promise<void> | null>(null);
  const checkpointLatestRef = useRef<{
    targetIndex: number;
    statusOverride?: "running" | "paused";
  } | null>(null);
  const autoStepPendingRef = useRef(false);
  const replayExtendPromiseRef = useRef<ReturnType<typeof extendReplay> | null>(
    null,
  );
  const replayFetchLatencyRef = useRef(4_500);
  const replayStepRef = useRef<ReplayStepMinutes>(1);
  const [replayStepMinutes, setReplayStepMinutes] = useState<ReplayStepMinutes>(1);
  const wantsReplayRunningRef = useRef(false);
  const stepRef = useRef<(batchSize?: number) => Promise<void>>(async () => {});
  const replayFrameRef = useRef<number | null>(null);
  const replayLastFrameRef = useRef<number | null>(null);
  const replayAccumulatorRef = useRef(0);
  const replayFrameBusyRef = useRef(false);
  /**
   * Bumped by any action that takes exclusive control of the engine's cursor —
   * jump, restart, step back — none of which check whether an autoplay step is
   * already mid-flight before they start moving `visibleIndex` themselves.
   *
   * `stepRef`'s loop can be paused mid-iteration awaiting the same shared
   * extension request `jumpTo` is also awaiting; both continuations then
   * resume on the same microtask flush and independently advance the same
   * mutable `engine.candles`/`visibleIndex`, each publishing its own
   * `currentTime` to the same bus with no ordering between them. That is what
   * produced "data must be asc ordered by time" — two advances landing on the
   * chart in whichever order the interleave happened to resolve.
   *
   * A step captures the generation it started with and checks it before every
   * iteration and again before publishing its result, so a step superseded
   * mid-flight goes inert instead of racing the operation that superseded it.
   */
  const engineGenerationRef = useRef(0);
  const lastUiPublishRef = useRef(0);
  const lastActionRef = useRef<Parameters<typeof sendAction>[2] | null>(null);
  const localEngineRef = useRef<EngineContext | null>(null);
  /** Symbols with a pair fetch in flight, so duplicate cells share one request. */
  const pairRequestsRef = useRef<Set<string>>(new Set());

  const hydrateLocalEngine = useCallback(
    (state: PublicSessionState, candles: Candle[]) => {
      const engine = {
        state: engineStateFromPublic(state),
        candles,
      };
      localEngineRef.current = engine;
      return publicSessionState(engine, state.anonymous);
    },
    [],
  );

  const startReplayExtension = useCallback(() => {
    const engine = localEngineRef.current;
    const id = sessionIdRef.current;
    if (!engine || !id) return null;
    if (replayExtendPromiseRef.current) {
      return replayExtendPromiseRef.current;
    }

    const startedAt = performance.now();
    // Chunk persistence and checkpoints update the same session row. Keeping
    // them on one client-side mutation queue avoids competing for the single
    // Prisma connection configured for each serverless function.
    const request = actionQueueRef.current
      .then(() =>
        retryReplayChunk(() => extendReplay(id, tokenRef.current, engine.candles.length)),
      )
      .then((extension) => {
        if (
          !extension.ok ||
          localEngineRef.current !== engine ||
          sessionIdRef.current !== id
        ) {
          return extension;
        }

        replayFetchLatencyRef.current = updateReplayFetchLatency(
          replayFetchLatencyRef.current,
          performance.now() - startedAt,
        );
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
        return { ...extension, candles: newCandles };
      });
    actionQueueRef.current = request.then(
      () => undefined,
      () => undefined,
    );
    replayExtendPromiseRef.current = request;
    void request.finally(() => {
      if (replayExtendPromiseRef.current === request) {
        replayExtendPromiseRef.current = null;
      }
    });
    return request;
  }, []);

  const patch = useCallback((p: Partial<BacktesterState>) => {
    setS((prev) => ({ ...prev, ...p }));
  }, []);

  const activateCreatedSession = useCallback(
    (res: CreatedSession) => {
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
      const normalizedState = hydrateLocalEngine(
        res.state,
        res.replayCandles,
      );
      setS((prev) => ({
        phase: "active",
        sessionId: res.sessionId,
        state: normalizedState,
        initialCandles: res.candles,
        replayCandles: res.replayCandles,
        contextCandles: res.contextCandles,
        lastCandle: res.candles[res.candles.length - 1] ?? null,
        lastCandles: [],
        busy: false,
        error: null,
        notice: normalizedState.demoData
          ? "This session uses generated demonstration data and does not represent an actual market feed."
          : null,
        notes: "",
        activeSymbol: normalizedState.config.symbol,
        pairs: {},
        pairLoadingSymbols: [],
        endOfData: false,
        saveStatus: "saved",
        savedAt: Date.now(),
        resetNonce: prev.resetNonce + 1,
        jumping: false,
      }));
    },
    [hydrateLocalEngine],
  );

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
      const normalizedState = hydrateLocalEngine(
        res.state,
        res.replayCandles,
      );
      setS((prev) => ({
        phase: "active",
        sessionId: resumeSessionId,
        state: normalizedState,
        initialCandles: res.candles,
        replayCandles: res.replayCandles,
        contextCandles: res.contextCandles,
        lastCandle: res.candles[res.candles.length - 1] ?? null,
        lastCandles: [],
        busy: false,
        error: null,
        notice: `Session resumed: ${normalizedState.config.name || normalizedState.config.symbol}.`,
        notes: res.notes,
        activeSymbol: normalizedState.config.symbol,
        pairs: {},
        pairLoadingSymbols: [],
        saveStatus: "saved",
        savedAt: Date.now(),
        endOfData: false,
        resetNonce: prev.resetNonce + 1,
        jumping: false,
      }));
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [hydrateLocalEngine, resumeSessionId]);

  const startSession = useCallback(
    async (body: CreateSessionBody) => {
      if (interactiveBusyRef.current) return false;
      interactiveBusyRef.current = true;
      patch({ busy: true, error: null, notice: null });
      const res = await createSession(body);
      interactiveBusyRef.current = false;
      if (!res.ok) {
        patch({ busy: false, error: res.error });
        return false;
      }
      activateCreatedSession(res);
      return true;
    },
    [activateCreatedSession, patch],
  );
  const startTrialSession = useCallback(async () => {
    if (interactiveBusyRef.current) return false;
    interactiveBusyRef.current = true;
    patch({ busy: true, error: null, notice: null });
    const res = await createTrialSession();
    interactiveBusyRef.current = false;
    if (!res.ok) {
      patch({ busy: false, error: res.error });
      return false;
    }
    activateCreatedSession(res);
    return true;
  }, [activateCreatedSession, patch]);

  const runAction = useCallback(
    async (
      action: Parameters<typeof sendAction>[2],
      opts: {
        captureCandle?: boolean;
        background?: boolean;
        showBusy?: boolean;
        rollbackState?: PublicSessionState;
        preserveLocalState?: boolean;
        /** Explicit rewind actions may accept a lower server candle index. */
        allowRewind?: boolean;
      } = {},
    ) => {
      let succeeded = true;
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
        if (!id) {
          succeeded = false;
          return;
        }

        const res = await sendAction(id, token, action);
        if (!res.ok) {
          succeeded = false;
          if (res.state && !opts.preserveLocalState) localEngineRef.current = {
            state: engineStateFromPublic(res.state),
            candles: localEngineRef.current?.candles ?? [],
          };
          setS((prev) => ({
            ...prev,
            error: res.error,
            state: opts.preserveLocalState ? prev.state : res.state ?? prev.state,
            saveStatus: "error",
          }));
          return;
        }

        // Non-session symbols used to be re-fetched here on every persisted
        // "next" — a round-trip per candle that local playback always outran.
        // Their full series is now loaded once and revealed on the replay clock.
        const responseEngineState = engineStateFromPublic(res.state);
        const normalizedResponseState = publicSessionState(
          {
            state: responseEngineState,
            candles: localEngineRef.current?.candles ?? [],
          },
          res.state.anonymous,
        );
        setS((prev) => {
          let nextState = normalizedResponseState;
          // A background save can finish after local playback has already
          // advanced further. Never rewind the browser to that older index.
          if (opts.preserveLocalState && localEngineRef.current) {
            nextState = publicSessionState(
              localEngineRef.current,
              prev.state?.anonymous ?? false,
            );
          } else if (
            !opts.allowRewind &&
            prev.state &&
            prev.state.visibleIndex > nextState.visibleIndex
          ) {
            nextState = prev.state;
          } else if (localEngineRef.current) {
            localEngineRef.current.state = responseEngineState;
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
            saveStatus: "saved",
            savedAt: Date.now(),
          };
        });
      });

      actionQueueRef.current = task
        .catch(() => {
          succeeded = false;
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
      return succeeded;
    },
    [patch],
  );

  // Playback is browser-local for smooth ticks. Keep an adaptive reservoir in
  // front of the replay cursor so normal R2/server latency never reaches the
  // playback boundary.
  stepRef.current = useCallback(async (batchSize = 1) => {
    const engineStartedAt = performance.now();
    const engine = localEngineRef.current;
    if (!engine) return;
    // Captured once, at the position this step was granted the cursor from. If
    // a jump/restart/step-back bumps this before the loop below finishes, this
    // step has been superseded and must not touch the engine again.
    const generation = engineGenerationRef.current;
    const stepCount = Math.max(
      1,
      Math.round(
        (replayStepRef.current * TIMEFRAME_MS["1m"]) /
          TIMEFRAME_MS[engine.state.config.timeframe],
      ),
    ) * Math.max(1, batchSize);
    const advancedCandles: Candle[] = [];
    let finished = false;
    let superseded = false;

    for (let index = 0; index < stepCount; index += 1) {
      // A jump or similar action may have taken the cursor over mid-loop —
      // most likely while the `await request` a few lines down was pending,
      // since that is the one point per iteration this step yields control.
      // Stop touching the engine immediately; the operation that superseded
      // this step owns the cursor now, and applying more of this step's own
      // stepCount on top of wherever it left the engine would just be this
      // same race by another name.
      if (engineGenerationRef.current !== generation) {
        superseded = true;
        break;
      }
      const lastLoaded = engine.candles[engine.candles.length - 1];
      const loadedRemaining =
        engine.state.totalCandles - 1 - engine.state.visibleIndex;
      const bufferTarget = replayBufferTargetCandles(
        engine.state.speed,
        engine.state.config.timeframe,
        replayFetchLatencyRef.current,
      );
      if (
        loadedRemaining <= bufferTarget &&
        lastLoaded &&
        lastLoaded.timestamp < engine.state.config.endTime &&
        replayExtendPromiseRef.current === null
      ) {
        startReplayExtension();
      }
      const atLoadedBoundary =
        engine.state.visibleIndex >= engine.state.totalCandles - 1;
      if (
        atLoadedBoundary &&
        lastLoaded &&
        lastLoaded.timestamp >= engine.state.config.endTime
      ) {
        finished = true;
        wantsReplayRunningRef.current = false;
        engine.state.status = "paused";
        break;
      }
      if (
        atLoadedBoundary &&
        lastLoaded &&
        lastLoaded.timestamp < engine.state.config.endTime
      ) {
        const id = sessionIdRef.current;
        if (!id) break;
        const request =
          replayExtendPromiseRef.current ?? startReplayExtension();
        if (!request) break;
        const extension = await request;

        if (!extension.ok) {
          // A transient network/R2 failure must not turn into a terminal replay
          // error. Leave playback running and retain the unprocessed market-time
          // debt; the next frame starts another background attempt.
          const unprocessedCandles = stepCount - index;
          replayAccumulatorRef.current +=
            (unprocessedCandles *
              TIMEFRAME_MS[engine.state.config.timeframe]) /
            engine.state.speed;
          break;
        }

        if (extension.candles.length === 0 && !extension.hasMore) {
          finished = true;
          wantsReplayRunningRef.current = false;
          engine.state.status = "paused";
          break;
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

    // Whatever superseded this step already owns the cursor, has already
    // published its own position, and is the only one of the two that should
    // be resuming playback status. Publishing this step's now-stale position
    // on top of that is exactly the race that produced the ordering crash.
    if (superseded) return;

    if (
      wantsReplayRunningRef.current &&
      engine.state.status !== "finished"
    ) {
      engine.state.status = "running";
    }
    recordReplayMetric(
      "replay-engine",
      performance.now() - engineStartedAt,
      advancedCandles.length,
    );
    const currentCandle = engine.candles[engine.state.visibleIndex] ?? null;
    if (currentCandle) {
      publishReplayVisual({
        sessionId: engine.state.sessionId,
        currentTime: currentCandle.timestamp,
        visibleIndex: engine.state.visibleIndex,
        currentPrice: Number(currentCandle.close),
      });
    }
    const now = performance.now();
    const shouldPublishUi =
      finished ||
      now - lastUiPublishRef.current >= 100;
    if (shouldPublishUi) {
      lastUiPublishRef.current = now;
      const publicationStartedAt = performance.now();
      const state = publicSessionState(engine, s.state?.anonymous ?? false);
      recordReplayMetric(
        "state-publication",
        performance.now() - publicationStartedAt,
        1,
      );
      const candle = engine.candles[state.visibleIndex] ?? null;
      setS((prev) => ({
        ...prev,
        state,
        lastCandle: candle,
        lastCandles: advancedCandles,
      }));
    }
    if (finished) {
      if (replayFrameRef.current != null) cancelAnimationFrame(replayFrameRef.current);
      replayFrameRef.current = null;
      setS((prev) => ({ ...prev, endOfData: true }));
      void runAction(
        {
          type: "sync",
          targetIndex: engine.state.visibleIndex,
          status: "paused",
        },
        { background: true, showBusy: false, preserveLocalState: true },
      );
    }
  }, [runAction, s.state?.anonymous, startReplayExtension]);

  const status = s.state?.status;

  const stopLocalScheduler = useCallback(() => {
    if (replayFrameRef.current != null) cancelAnimationFrame(replayFrameRef.current);
    replayFrameRef.current = null;
    replayLastFrameRef.current = null;
    replayAccumulatorRef.current = 0;
    replayFrameBusyRef.current = false;
  }, []);

  const startLocalScheduler = useCallback(() => {
    stopLocalScheduler();
    const schedule = () => {
      const engine = localEngineRef.current;
      if (!engine || engine.state.status !== "running") return;
      replayFrameRef.current = requestAnimationFrame(async (now) => {
        const current = localEngineRef.current;
        if (!current || current.state.status !== "running") return;
        const previous = replayLastFrameRef.current ?? now;
        replayLastFrameRef.current = now;
        replayAccumulatorRef.current += Math.min(100, Math.max(0, now - previous));
        const stepCount = Math.max(
          1,
          Math.round(
            (replayStepRef.current * TIMEFRAME_MS["1m"]) /
              TIMEFRAME_MS[current.state.config.timeframe],
          ),
        );
        // Preserve elapsed market time even when React cannot paint every
        // underlying minute separately. The selected STEP controls each visible
        // jump; the speed controls how many market minutes are owed per second.
        const batch = nextReplayBatch(
          replayAccumulatorRef.current,
          current.state.speed,
          current.state.config.timeframe,
          stepCount,
        );
        if (batch.batchSize > 0 && !replayFrameBusyRef.current) {
          replayAccumulatorRef.current = batch.remainingMs;
          replayFrameBusyRef.current = true;
          await stepRef.current(batch.batchSize);
          replayFrameBusyRef.current = false;
        }
        if (localEngineRef.current?.state.status === "running") schedule();
      });
    };
    replayLastFrameRef.current = null;
    schedule();
  }, [stopLocalScheduler]);

  useEffect(() => stopLocalScheduler, [stopLocalScheduler]);

  const checkpoint = useCallback(async (statusOverride?: "running" | "paused") => {
    const id = sessionIdRef.current;
    const engine = localEngineRef.current;
    if (!id || !engine) return;
    checkpointLatestRef.current = {
      targetIndex: engine.state.visibleIndex,
      statusOverride,
    };
    patch({ saveStatus: "saving" });

    // A slow database must not build an unbounded queue of stale 3-second
    // checkpoints. One request runs at a time and any calls received while it
    // is pending collapse into the newest index/status.
    if (!checkpointPendingRef.current) {
      const drain = async () => {
        let lastSaveSucceeded = true;
        while (checkpointLatestRef.current) {
          const requested = checkpointLatestRef.current;
          checkpointLatestRef.current = null;
          const saveStartedAt = performance.now();
          const task = actionQueueRef.current.then(() =>
            sendAction(id, tokenRef.current, {
              type: "sync",
              targetIndex: requested.targetIndex,
              status: requested.statusOverride,
            }),
          );
          actionQueueRef.current = task.then(
            () => undefined,
            () => undefined,
          );
          try {
            const res = await task;
            lastSaveSucceeded = res.ok;
            recordReplayMetric(
              "session-save",
              performance.now() - saveStartedAt,
            );
            if (res.ok) {
              patch({ saveStatus: "saved", savedAt: Date.now() });
            }
          } catch {
            lastSaveSucceeded = false;
          }
        }
        if (!lastSaveSucceeded) {
          // Saving is non-blocking: keep the chart and replay usable. The next
          // interval or explicit retry will attempt the newest local index.
          patch({ saveStatus: "error" });
        }
      };
      const pending = drain().finally(() => {
        if (checkpointPendingRef.current === pending) {
          checkpointPendingRef.current = null;
        }
      });
      checkpointPendingRef.current = pending;
    }
    await checkpointPendingRef.current;
  }, [patch]);

  // Persist progress in batches. Closing/pausing also checkpoints immediately.
  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => void checkpoint("running"), 3_000);
    return () => window.clearInterval(timer);
  }, [checkpoint, status]);

  const play = useCallback(() => {
    if (s.endOfData) return Promise.resolve();
    wantsReplayRunningRef.current = true;
    setS((prev) =>
      prev.state
        ? { ...prev, state: { ...prev.state, status: "running" } }
        : prev,
    );
    if (localEngineRef.current) localEngineRef.current.state.status = "running";
    startLocalScheduler();
    return checkpoint("running");
  }, [checkpoint, s.endOfData, startLocalScheduler]);
  const pause = useCallback(() => {
    wantsReplayRunningRef.current = false;
    // Stop the local timer immediately. The server pause command is serialized
    // behind any candle request that is already in flight.
    const engine = localEngineRef.current;
    if (engine) engine.state.status = "paused";
    setS((prev) => {
      if (!prev.state) return prev;
      return {
        ...prev,
        state: engine
          ? publicSessionState(engine, prev.state.anonymous)
          : { ...prev.state, status: "paused" },
      };
    });
    stopLocalScheduler();
    return checkpoint("paused");
  }, [checkpoint, stopLocalScheduler]);
  const stepNext = useCallback(
    async () => {
      if (s.endOfData) return;
      await stepRef.current();
      await checkpoint("paused");
    },
    [checkpoint, s.endOfData],
  );
  const stepPrev = useCallback((displayTimeframe?: Timeframe) => {
    const engine = localEngineRef.current;
    if (!engine) return;
    // Rewinding is an explicit pause-and-review action. Stop local playback
    // first so it cannot race forward while the previous candle is selected —
    // and supersede any step already mid-flight, for the same reason `jumpTo`
    // does: it may resume moments later and publish a position this rewind has
    // already moved past.
    wantsReplayRunningRef.current = false;
    stopLocalScheduler();
    engine.state.status = "paused";
    engineGenerationRef.current += 1;
    const timeframe = displayTimeframe ?? engine.state.config.timeframe;
    const currentCandle = engine.candles[engine.state.visibleIndex];
    if (!currentCandle) return;

    // Find the candle immediately before the current displayed bucket, then
    // walk to that bucket's first base candle. Weekend/session gaps therefore
    // jump to the real previous bar rather than an empty clock interval.
    const currentBucket = candleBucketStart(currentCandle.timestamp, timeframe);
    let targetIndex = engine.state.visibleIndex - 1;
    while (
      targetIndex >= 0 &&
      candleBucketStart(engine.candles[targetIndex]!.timestamp, timeframe) >=
        currentBucket
    ) {
      targetIndex -= 1;
    }
    if (targetIndex < 0) return;
    const previousBucket = candleBucketStart(
      engine.candles[targetIndex]!.timestamp,
      timeframe,
    );
    while (
      targetIndex > 0 &&
      candleBucketStart(
        engine.candles[targetIndex - 1]!.timestamp,
        timeframe,
      ) === previousBucket
    ) {
      targetIndex -= 1;
    }

    const rollbackState = s.state ?? undefined;
    if (!stepBackLocalTo(engine, targetIndex)) return;
    const candle = engine.candles[engine.state.visibleIndex] ?? null;
    if (candle) {
      // Every chart cell removes its future candle against the shared clock.
      // The chart instances stay mounted, retaining zoom, pan, drawings, and
      // indicator state while their existing series is updated in place.
      publishReplayVisual({
        sessionId: engine.state.sessionId,
        currentTime: candle.timestamp,
        visibleIndex: engine.state.visibleIndex,
        currentPrice: Number(candle.close),
      });
    }
    setS((prev) => ({
      ...prev,
      state: publicSessionState(engine, prev.state?.anonymous ?? false),
      lastCandle: candle,
      lastCandles: [],
    }));
    // The interaction is complete locally. Persist the exact target in the
    // background so network latency never blocks or animates the chart.
    void runAction(
      { type: "prev", targetIndex },
      {
        allowRewind: true,
        preserveLocalState: true,
        rollbackState,
        showBusy: false,
      },
    );
  }, [runAction, s.state, stopLocalScheduler]);
  /**
   * Rewind to the nearest revealed candle at or before `timestamp` — the
   * backward counterpart to `jumpTo`, used when a "Go to" destination turns
   * out to be behind the replay instead of ahead of it.
   *
   * Everything in range is already loaded (revealing only ever appends), so
   * this is a direct index jump through `stepBackTo` — the same primitive
   * `stepPrev` uses for a single candle — rather than a step-by-step replay
   * like the forward jump. There is nothing to fill or trigger on the way
   * back, only positions and orders to unwind past their entry, which
   * `stepBackTo` already does.
   */
  const jumpBackTo = useCallback(
    (timestamp: number): JumpOutcome => {
      const engine = localEngineRef.current;
      if (!engine) return { reason: "unavailable", candles: 0 };
      const startIndex = engine.state.visibleIndex;
      const candles = engine.candles;
      if (!candles[0] || candles[0].timestamp > timestamp) {
        // Before the earliest candle the replay has ever loaded — there is
        // nothing to rewind to, not even off-screen.
        return { reason: "behind", candles: 0 };
      }
      // Last index at or before `timestamp`, among candles already revealed.
      let lo = 0;
      let hi = startIndex;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (candles[mid]!.timestamp <= timestamp) lo = mid;
        else hi = mid - 1;
      }
      const targetIndex = lo;
      if (targetIndex >= startIndex) return { reason: "behind", candles: 0 };

      wantsReplayRunningRef.current = false;
      stopLocalScheduler();
      engine.state.status = "paused";
      engineGenerationRef.current += 1;

      const rollbackState = s.state ?? undefined;
      if (!stepBackLocalTo(engine, targetIndex)) {
        return { reason: "unavailable", candles: 0 };
      }
      const candle = engine.candles[engine.state.visibleIndex] ?? null;
      if (candle) {
        publishReplayVisual({
          sessionId: engine.state.sessionId,
          currentTime: candle.timestamp,
          visibleIndex: engine.state.visibleIndex,
          currentPrice: Number(candle.close),
        });
      }
      setS((prev) => ({
        ...prev,
        state: publicSessionState(engine, prev.state?.anonymous ?? false),
        lastCandle: candle,
        lastCandles: [],
      }));
      // Same background persistence `stepPrev` uses: the local rewind is
      // already complete, so the server sync must not block or animate it.
      void runAction(
        { type: "prev", targetIndex },
        {
          allowRewind: true,
          preserveLocalState: true,
          rollbackState,
          showBusy: false,
        },
      );
      return { reason: "target", candles: startIndex - targetIndex };
    },
    [runAction, s.state, stopLocalScheduler],
  );
  /**
   * Advance the replay until a target is met.
   *
   * The engine is driven directly rather than through `stepRef` because a jump
   * has to stop on an exact candle: `stepRef` reveals a whole batch before it
   * returns and would routinely overshoot the bar the trader asked for. Every
   * candle in between is still revealed one at a time, so stops, targets and
   * pending orders fill exactly as they would have during playback — a jump is a
   * fast-forward, never a teleport.
   *
   * Only the final state is published. Publishing each candle would put tens of
   * thousands of React renders in front of a jump that should take a moment.
   */
  const jumpTo = useCallback(
    async (target: GoToTarget): Promise<JumpOutcome> => {
      const engine = localEngineRef.current;
      if (!engine) return { reason: "unavailable", candles: 0 };
      const startCandle = engine.candles[engine.state.visibleIndex];
      if (
        target.kind === "time" &&
        startCandle &&
        target.timestamp <= startCandle.timestamp
      ) {
        return jumpBackTo(target.timestamp);
      }

      // A jump is an explicit pause-and-arrive action, like a rewind. Stop local
      // playback first so the scheduler cannot race past the target — and bump
      // the generation so a step already mid-flight (most likely paused on the
      // same shared extension request this loop is about to await too) goes
      // inert instead of continuing to advance the same engine underneath it.
      wantsReplayRunningRef.current = false;
      stopLocalScheduler();
      engine.state.status = "paused";
      engineGenerationRef.current += 1;
      patch({ busy: true, jumping: true, error: null });

      const generation = engineGenerationRef.current;
      const startIndex = engine.state.visibleIndex;
      const closedAtStart = engine.state.closedTrades.length;
      let extensions = 0;
      let reason: JumpOutcome["reason"] = "limit";

      try {
        while (engine.state.visibleIndex - startIndex < JUMP_MAX_CANDLES) {
          // A later action — another jump, a rewind, a restart — has taken the
          // cursor. Stop rather than layering this jump's advance on top of it.
          if (engineGenerationRef.current !== generation) break;
          const lastLoaded = engine.candles[engine.candles.length - 1];
          if (engine.state.visibleIndex >= engine.state.totalCandles - 1) {
            // Out of loaded candles: fetch the next chunk, then re-test the
            // boundary rather than assuming the fetch produced one.
            if (!lastLoaded || lastLoaded.timestamp >= engine.state.config.endTime) {
              reason = "end-of-data";
              break;
            }
            if (!sessionIdRef.current || extensions >= JUMP_MAX_EXTENSIONS) break;
            extensions += 1;
            const request =
              replayExtendPromiseRef.current ?? startReplayExtension();
            if (!request) break;
            const extension = await request;
            if (!extension.ok) break;
            if (extension.candles.length === 0 && !extension.hasMore) {
              reason = "end-of-data";
              break;
            }
            continue;
          }

          if (!revealNext(engine)) {
            reason = "end-of-data";
            break;
          }
          const candle = engine.candles[engine.state.visibleIndex];
          if (candle && jumpReached(target, candle, engine, closedAtStart)) {
            reason = "target";
            break;
          }
          if (
            candle &&
            (engine.state.visibleIndex - startIndex) % JUMP_YIELD_EVERY === 0
          ) {
            // Yield so a long jump cannot lock the tab, and let the chart paint
            // the intermediate candle so the jump visibly progresses.
            publishReplayVisual({
              sessionId: engine.state.sessionId,
              currentTime: candle.timestamp,
              visibleIndex: engine.state.visibleIndex,
              currentPrice: Number(candle.close),
            });
            await new Promise((resolve) => window.setTimeout(resolve, 0));
          }
        }
      } finally {
        const candle = engine.candles[engine.state.visibleIndex] ?? null;
        if (candle) {
          publishReplayVisual({
            sessionId: engine.state.sessionId,
            currentTime: candle.timestamp,
            visibleIndex: engine.state.visibleIndex,
            currentPrice: Number(candle.close),
          });
        }
        setS((prev) => ({
          ...prev,
          state: publicSessionState(engine, prev.state?.anonymous ?? false),
          lastCandle: candle,
          lastCandles: [],
          busy: false,
          jumping: false,
          endOfData: reason === "end-of-data" ? true : prev.endOfData,
        }));
        void checkpoint("paused");
      }

      return { reason, candles: engine.state.visibleIndex - startIndex };
    },
    [checkpoint, jumpBackTo, patch, startReplayExtension, stopLocalScheduler],
  );
  const restart = useCallback(async () => {
    wantsReplayRunningRef.current = false;
    // A step already mid-flight closed over the pre-restart `engine` object.
    // `localEngineRef.current` is about to be replaced wholesale below, but that
    // stale closure keeps mutating and publishing from the object it captured,
    // under the same session id — so it must be told it no longer owns the
    // cursor before the swap, the same as any other action that takes it.
    engineGenerationRef.current += 1;
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
      const normalizedState = hydrateLocalEngine(
        data.state,
        data.replayCandles,
      );
      setS((prev) => ({
        ...prev,
        state: normalizedState,
        initialCandles: data.candles,
        replayCandles: data.replayCandles,
        contextCandles: data.contextCandles,
        lastCandle: data.candles[data.candles.length - 1] ?? null,
        lastCandles: [],
        resetNonce: prev.resetNonce + 1,
        notes: data.notes,
        activeSymbol: normalizedState.config.symbol,
        // Restart rewinds the clock, so every cached pair series must be
        // re-revealed from the session's opening candle.
        pairs: {},
        saveStatus: "saved",
        savedAt: Date.now(),
      }));
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
  const extendSessionData = useCallback(
    async (endTime: number) => {
      const id = sessionIdRef.current;
      const engine = localEngineRef.current;
      if (!id || !engine || interactiveBusyRef.current) return false;

      interactiveBusyRef.current = true;
      patch({ busy: true, error: null });
      const result = await extendSessionRange(id, tokenRef.current, endTime, engine.candles.length);
      interactiveBusyRef.current = false;

      if (!result.ok) {
        patch({ busy: false, error: result.error });
        return false;
      }

      const newestTimestamp = engine.candles.at(-1)?.timestamp ?? 0;
      const newCandles = result.candles.filter(
        (candle) => candle.timestamp > newestTimestamp,
      );
      if (newCandles.length === 0) {
        patch({
          busy: false,
          error: "No additional market data is available for the selected period.",
        });
        return false;
      }

      engine.candles.push(...newCandles);
      engine.state.totalCandles = engine.candles.length;
      engine.state.config.endTime = endTime;
      engine.state.status = "paused";
      const nextState = publicSessionState(
        engine,
        s.state?.anonymous ?? false,
      );
      setS((prev) => ({
        ...prev,
        state: nextState,
        replayCandles: [...prev.replayCandles, ...newCandles],
        busy: false,
        error: null,
        notice: "Additional market data is ready. Continue when you are ready.",
        endOfData: false,
        saveStatus: "saved",
        savedAt: Date.now(),
      }));
      return true;
    },
    [patch, s.state?.anonymous],
  );
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
      const sharedOrder = {
        ...order,
        clientOrderId: order.clientOrderId ?? crypto.randomUUID(),
      };
      const rollbackState = s.state;
      const engine = localEngineRef.current;
      if (engine) {
        const result = placeLocalOrder(engine, sharedOrder);
        if (result.ok) {
          const state = publicSessionState(engine, rollbackState?.anonymous ?? false);
          setS((prev) => ({ ...prev, state }));
        }
      }
      return runAction({
        type: "place-order",
        clientOrderId: sharedOrder.clientOrderId,
        direction: sharedOrder.direction,
        orderType: sharedOrder.orderType,
        entryPrice: sharedOrder.entryPrice,
        expiresAt: sharedOrder.expiresAt,
        sizingMode: sharedOrder.sizingMode,
        lots: sharedOrder.lots,
        riskPercent: sharedOrder.riskPercent,
        stopLoss: sharedOrder.stopLoss ?? undefined,
        takeProfit: sharedOrder.takeProfit ?? undefined,
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
  const closeAllPositions = useCallback(() => {
    const rollbackState = s.state;
    const engine = localEngineRef.current;
    if (engine) {
      const result = closeAllLocalPositions(engine);
      if (result.ok) {
        const state = publicSessionState(engine, rollbackState?.anonymous ?? false);
        setS((prev) => ({ ...prev, state }));
      }
    }
    return runAction({
      type: "close-all",
      targetIndex: localEngineRef.current?.state.visibleIndex,
    }, { rollbackState: rollbackState ?? undefined, showBusy: false, preserveLocalState: true });
  }, [runAction, s.state]);
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
  const modifyPending = useCallback(
    (orderId: string, price: string) => {
      const rollbackState = s.state;
      const engine = localEngineRef.current;
      if (engine && modifyLocalPendingOrder(engine, orderId, price).ok) {
        setS((prev) => ({
          ...prev,
          state: publicSessionState(engine, rollbackState?.anonymous ?? false),
        }));
      }
      return runAction(
        {
          type: "modify-pending",
          orderId,
          price,
          targetIndex: localEngineRef.current?.state.visibleIndex,
        },
        { rollbackState: rollbackState ?? undefined, showBusy: false, preserveLocalState: true },
      );
    },
    [runAction, s.state],
  );
  const cancelPending = useCallback(
    (orderId: string) => {
      const rollbackState = s.state;
      const engine = localEngineRef.current;
      if (engine && cancelLocalPendingOrder(engine, orderId).ok) {
        setS((prev) => ({
          ...prev,
          state: publicSessionState(engine, rollbackState?.anonymous ?? false),
        }));
      }
      return runAction(
        {
          type: "cancel-pending",
          orderId,
          targetIndex: localEngineRef.current?.state.visibleIndex,
        },
        { rollbackState: rollbackState ?? undefined, showBusy: false, preserveLocalState: true },
      );
    },
    [runAction, s.state],
  );
  const modifyTrailing = useCallback(
    (pips: string | null, positionId?: string) => {
      const rollbackState = s.state;
      const engine = localEngineRef.current;
      if (engine && modifyLocalTrailingStop(engine, pips, positionId).ok) {
        const state = publicSessionState(engine, rollbackState?.anonymous ?? false);
        setS((prev) => ({ ...prev, state }));
      }
      return runAction({
        type: "modify-trailing",
        positionId,
        pips,
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
  const saveTradeJournal = useCallback(
    async (journalId: string, journal: TradeJournalUpdate) => {
      const engine = localEngineRef.current;
      if (engine) {
        updateLocalTradeJournal(engine, journalId, journal);
        setS((prev) => ({
          ...prev,
          state: publicSessionState(engine, prev.state?.anonymous ?? false),
        }));
      }
      const saved = await runAction(
        { type: "update-journal", journalId, journal },
        { showBusy: false, preserveLocalState: true },
      );
      if (!saved) throw new Error("Trade journal could not be saved.");
    },
    [runAction],
  );
  const addBookmark = useCallback(async (note = "") => {
    const engine = localEngineRef.current;
    const candle = engine?.candles[engine.state.visibleIndex];
    if (!engine || !candle) return;
    const bookmarkId = crypto.randomUUID();
    engine.state.bookmarks.push({
      id: bookmarkId,
      index: engine.state.visibleIndex,
      time: candle.timestamp,
      note,
      createdAt: Date.now(),
    });
    setS((prev) => ({
      ...prev,
      state: publicSessionState(engine, prev.state?.anonymous ?? false),
    }));
    await runAction(
      { type: "add-bookmark", bookmarkId, note, targetIndex: engine.state.visibleIndex },
      { showBusy: false, preserveLocalState: true },
    );
  }, [runAction]);
  const updateBookmark = useCallback(async (bookmarkId: string, note: string) => {
    const engine = localEngineRef.current;
    const bookmark = engine?.state.bookmarks.find((item) => item.id === bookmarkId);
    if (bookmark) bookmark.note = note;
    if (engine) {
      setS((prev) => ({ ...prev, state: publicSessionState(engine, prev.state?.anonymous ?? false) }));
    }
    await runAction(
      { type: "update-bookmark", bookmarkId, note },
      { showBusy: false, preserveLocalState: true },
    );
  }, [runAction]);
  const deleteBookmark = useCallback(async (bookmarkId: string) => {
    const engine = localEngineRef.current;
    if (engine) {
      engine.state.bookmarks = engine.state.bookmarks.filter((item) => item.id !== bookmarkId);
      setS((prev) => ({ ...prev, state: publicSessionState(engine, prev.state?.anonymous ?? false) }));
    }
    await runAction(
      { type: "delete-bookmark", bookmarkId },
      { showBusy: false, preserveLocalState: true },
    );
  }, [runAction]);
  /**
   * Load a non-session symbol's full series once, so a chart cell showing it can
   * advance on the local replay clock. Concurrent callers (several cells asking
   * for the same pair on the same frame) share the one in-flight request.
   */
  const ensurePair = useCallback(
    async (symbol: string) => {
      const id = sessionIdRef.current;
      if (!id || !symbol) return;
      if (symbol === s.state?.config.symbol) return;
      if (s.pairs[symbol] || pairRequestsRef.current.has(symbol)) return;
      pairRequestsRef.current.add(symbol);
      setS((prev) => ({
        ...prev,
        error: null,
        pairLoadingSymbols: prev.pairLoadingSymbols.includes(symbol)
          ? prev.pairLoadingSymbols
          : [...prev.pairLoadingSymbols, symbol],
      }));
      const pair = await getPairChart(id, tokenRef.current, symbol, true);
      pairRequestsRef.current.delete(symbol);
      setS((prev) => ({
        ...prev,
        error: pair.ok ? prev.error : pair.error,
        pairs: pair.ok ? { ...prev.pairs, [symbol]: pair } : prev.pairs,
        pairLoadingSymbols: prev.pairLoadingSymbols.filter((item) => item !== symbol),
      }));
    },
    [s.pairs, s.state?.config.symbol],
  );

  const switchPair = useCallback(
    async (symbol: string) => {
      patch({ activeSymbol: symbol, error: null });
      await ensurePair(symbol);
    },
    [ensurePair, patch],
  );

  /**
   * Add a symbol to the session's chartable set, then focus it. The traded
   * instrument is unchanged; the new symbol charts as a reference.
   */
  const addPair = useCallback(
    async (symbol: string): Promise<boolean> => {
      const id = sessionIdRef.current;
      const engine = localEngineRef.current;
      if (!id || !engine) return false;
      const config = engine.state.config;
      const existing = config.symbols?.length ? config.symbols : [config.symbol];
      if (existing.includes(symbol)) {
        patch({ activeSymbol: symbol, error: null });
        void ensurePair(symbol);
        return true;
      }

      patch({ busy: true, error: null });
      const result = await addSessionPair(id, tokenRef.current, symbol);
      if (!result.ok) {
        patch({ busy: false, error: result.error });
        return false;
      }

      config.symbols = result.symbols;
      setS((prev) => ({
        ...prev,
        busy: false,
        error: null,
        activeSymbol: symbol,
        state: publicSessionState(engine, prev.state?.anonymous ?? false),
      }));
      // Resolve as soon as the session owns the symbol. Its series is a few
      // thousand candles, and holding the picker open behind a spinner while it
      // downloads hides the chart that is already switching to it.
      void ensurePair(symbol);
      return true;
    },
    [ensurePair, patch],
  );
  const retrySave = useCallback(() => {
    const status = localEngineRef.current?.state.status;
    return checkpoint(status === "running" ? "running" : "paused");
  }, [checkpoint]);
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
        // Older history failing to page in leaves the visible candles untouched
        // and self-heals the next time the view nears the loaded edge — not
        // worth interrupting the trader with the global error banner over.
        console.warn("Chart history page failed to load:", result.error);
        return { candles: [], hasMore: false };
      }
      return { candles: result.candles, hasMore: result.hasMore };
    },
    [],
  );
  const newSession = useCallback(() => {
    tokenRef.current = null;
    sessionIdRef.current = null;
    wantsReplayRunningRef.current = false;
    interactiveBusyRef.current = false;
    autoStepPendingRef.current = false;
    replayExtendPromiseRef.current = null;
    replayFetchLatencyRef.current = 4_500;
    replayStepRef.current = 1;
    setReplayStepMinutes(1);
    stopLocalScheduler();
    localEngineRef.current = null;
    actionQueueRef.current = Promise.resolve();
    checkpointPendingRef.current = null;
    checkpointLatestRef.current = null;
    window.history.replaceState(null, "", "/app/backtest");
    setS(initial);
  }, [stopLocalScheduler]);

  return {
    ...s,
    replayStepMinutes,
    actions: {
      startSession,
      startTrialSession,
      play,
      pause,
      stepNext,
      stepPrev,
      jumpTo,
      restart,
      endSession,
      extendSessionData,
      setSpeed,
      setReplayStep,
      placeOrder,
      modifyPending,
      cancelPending,
      closePosition,
      closeAllPositions,
      modifyStop,
      modifyTarget,
      modifyTrailing,
      saveNotes,
      saveTradeJournal,
      addBookmark,
      updateBookmark,
      deleteBookmark,
      switchPair,
      addPair,
      ensurePair,
      retrySave,
      loadHistory,
      newSession,
    },
  };
}
