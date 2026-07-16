"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  SPEED_INTERVAL_MS,
  createSession,
  getStateWithToken,
  sendAction,
  type CreateSessionBody,
} from "@/lib/backtest/client";
import type { OrderRequest, PublicSessionState, ReplaySpeed } from "@/lib/backtest/types";
import type { Candle } from "@/lib/market-data/types";

export type Phase = "setup" | "active";

interface BacktesterState {
  phase: Phase;
  sessionId: string | null;
  state: PublicSessionState | null;
  initialCandles: Candle[];
  lastCandle: Candle | null;
  busy: boolean;
  error: string | null;
  notice: string | null;
  /** Bumped on start/restart so the chart remounts with fresh data. */
  resetNonce: number;
}

const initial: BacktesterState = {
  phase: "setup",
  sessionId: null,
  state: null,
  initialCandles: [],
  lastCandle: null,
  busy: false,
  error: null,
  notice: null,
  resetNonce: 0,
};

export function useBacktester() {
  const [s, setS] = useState<BacktesterState>(initial);
  const tokenRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const stepRef = useRef<() => Promise<void>>(async () => {});

  const patch = useCallback((p: Partial<BacktesterState>) => {
    setS((prev) => ({ ...prev, ...p }));
  }, []);

  const startSession = useCallback(
    async (body: CreateSessionBody) => {
      if (busyRef.current) return;
      busyRef.current = true;
      patch({ busy: true, error: null, notice: null });
      const res = await createSession(body);
      busyRef.current = false;
      if (!res.ok) {
        patch({ busy: false, error: res.error });
        return;
      }
      tokenRef.current = res.token;
      setS((prev) => ({
        phase: "active",
        sessionId: res.sessionId,
        state: res.state,
        initialCandles: res.candles,
        lastCandle: res.candles[res.candles.length - 1] ?? null,
        busy: false,
        error: null,
        notice: res.state.demoData
          ? "This session uses generated demonstration data and does not represent an actual market feed."
          : null,
        resetNonce: prev.resetNonce + 1,
      }));
    },
    [patch],
  );

  const runAction = useCallback(
    async (
      action: Parameters<typeof sendAction>[2],
      opts: { captureCandle?: boolean } = {},
    ) => {
      const id = s.sessionId;
      const token = tokenRef.current;
      if (!id || !token || busyRef.current) return;
      busyRef.current = true;
      patch({ busy: true, error: null });
      const res = await sendAction(id, token, action);
      busyRef.current = false;
      if (!res.ok) {
        patch({ busy: false, error: res.error, state: res.state ?? s.state });
        return;
      }
      patch({
        busy: false,
        state: res.state,
        lastCandle:
          opts.captureCandle && res.newCandle ? res.newCandle : s.lastCandle,
      });
    },
    [patch, s.sessionId, s.lastCandle, s.state],
  );

  // Keep a stable reference to the latest "next" stepper for the interval loop.
  stepRef.current = useCallback(async () => {
    await runAction({ type: "next" }, { captureCandle: true });
  }, [runAction]);

  const status = s.state?.status;
  const speed = s.state?.speed;

  // Auto-advance while running.
  useEffect(() => {
    if (status !== "running" || !speed) return;
    const interval = SPEED_INTERVAL_MS[speed as ReplaySpeed] ?? 1000;
    const timer = setInterval(() => {
      void stepRef.current();
    }, interval);
    return () => clearInterval(timer);
  }, [status, speed]);

  const play = useCallback(() => runAction({ type: "start" }), [runAction]);
  const pause = useCallback(() => runAction({ type: "pause" }), [runAction]);
  const stepNext = useCallback(
    () => runAction({ type: "next" }, { captureCandle: true }),
    [runAction],
  );
  const stepPrev = useCallback(() => runAction({ type: "prev" }), [runAction]);
  const restart = useCallback(async () => {
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
        lastCandle: data.candles[data.candles.length - 1] ?? null,
        resetNonce: prev.resetNonce + 1,
      }));
    }
  }, [runAction, s.sessionId]);
  const endSession = useCallback(() => runAction({ type: "end" }), [runAction]);
  const setSpeed = useCallback(
    (value: ReplaySpeed) => runAction({ type: "set-speed", speed: value }),
    [runAction],
  );
  const placeOrder = useCallback(
    (order: OrderRequest) =>
      runAction({
        type: "place-order",
        direction: order.direction,
        sizingMode: order.sizingMode,
        lots: order.lots,
        riskPercent: order.riskPercent,
        stopLoss: order.stopLoss ?? undefined,
        takeProfit: order.takeProfit ?? undefined,
      }),
    [runAction],
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
    (notes: string) => runAction({ type: "notes", notes }),
    [runAction],
  );
  const newSession = useCallback(() => {
    tokenRef.current = null;
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
      newSession,
    },
  };
}
