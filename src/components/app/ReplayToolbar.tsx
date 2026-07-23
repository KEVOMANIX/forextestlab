"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  GripHorizontal,
  LocateFixed,
  Pause,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";

import {
  REPLAY_SPEEDS,
  REPLAY_STEP_MINUTES,
  type PublicSessionState,
  type ReplaySpeed,
  type ReplayStepMinutes,
} from "@/lib/backtest/types";
import { TIMEFRAME_MS } from "@/lib/market-data/types";
import { replayBatchSize, replayIntervalMs } from "@/lib/backtest/client";

interface ReplayToolbarProps {
  state: PublicSessionState;
  busy: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onRestart: () => void;
  onEnd: () => void;
  onSpeed: (s: ReplaySpeed) => void;
  stepMinutes: ReplayStepMinutes;
  onStepMinutes: (step: ReplayStepMinutes) => void;
  onBuy: () => void;
  onSell: () => void;
  canTrade: boolean;
  maxReplaySpeed: number;
}

function ControlBtn({
  label,
  onClick,
  disabled,
  children,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border app-border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? "bg-brand-500 text-surface-950 hover:bg-brand-400"
          : "hover:border-brand-400/40"
      }`}
    >
      {children}
    </button>
  );
}

export function ReplayToolbar({
  state,
  busy,
  onPlay,
  onPause,
  onNext,
  onPrev,
  onRestart,
  onEnd,
  onSpeed,
  stepMinutes,
  onStepMinutes,
  onBuy,
  onSell,
  canTrade,
  maxReplaySpeed,
}: ReplayToolbarProps) {
  const toolboxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const finished = state.status === "finished";
  const running = state.status === "running";
  const canPrev =
    !running &&
    state.closedTrades.length === 0 &&
    state.openPositions.length === 0 &&
    state.visibleIndex > state.config.initialVisibleCount - 1;
  const availableSpeeds = REPLAY_SPEEDS.filter((speed) => speed <= maxReplaySpeed);
  const speedIndex = Math.max(0, availableSpeeds.indexOf(state.speed));
  const stepCount = Math.max(
    1,
    Math.round(
      (stepMinutes * TIMEFRAME_MS["1m"]) /
        TIMEFRAME_MS[state.config.timeframe],
    ),
  );
  const cadenceMs = replayIntervalMs(
    state.speed,
    state.config.timeframe,
    stepCount,
  );
  const batchSize = replayBatchSize(
    state.speed,
    state.config.timeframe,
    stepCount,
  );
  const cadenceLabel = cadenceMs >= 1000 && batchSize === 1
    ? `1 step / ${(cadenceMs / 1000).toFixed(cadenceMs % 1000 === 0 ? 0 : 1)}s`
    : `${((1000 / cadenceMs) * batchSize).toFixed(1)} steps/s`;

  function clampPosition(x: number, y: number) {
    const toolbox = toolboxRef.current;
    const parent = toolbox?.parentElement;
    if (!toolbox || !parent) return { x, y };
    const padding = 10;
    return {
      x: Math.min(
        Math.max(padding, x),
        Math.max(padding, parent.clientWidth - toolbox.offsetWidth - padding),
      ),
      y: Math.min(
        Math.max(padding, y),
        Math.max(padding, parent.clientHeight - toolbox.offsetHeight - padding),
      ),
    };
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a")) return;
    const toolbox = toolboxRef.current;
    const parent = toolbox?.parentElement;
    if (!toolbox || !parent) return;

    const box = toolbox.getBoundingClientRect();
    const bounds = parent.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top,
    };
    setPosition(clampPosition(box.left - bounds.left, box.top - bounds.top));

    dragCleanupRef.current?.();
    const move = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      const currentToolbox = toolboxRef.current;
      const currentParent = currentToolbox?.parentElement;
      if (!drag || drag.pointerId !== moveEvent.pointerId || !currentParent) return;
      const currentBounds = currentParent.getBoundingClientRect();
      setPosition(
        clampPosition(
          moveEvent.clientX - currentBounds.left - drag.offsetX,
          moveEvent.clientY - currentBounds.top - drag.offsetY,
        ),
      );
    };
    const end = (endEvent: PointerEvent) => {
      if (dragRef.current?.pointerId !== endEvent.pointerId) return;
      dragRef.current = null;
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  useEffect(() => {
    const keepInBounds = () => {
      setPosition((current) =>
        current ? clampPosition(current.x, current.y) : current,
      );
    };
    window.addEventListener("resize", keepInBounds);
    return () => {
      window.removeEventListener("resize", keepInBounds);
      dragCleanupRef.current?.();
    };
  }, []);

  return (
    <div
      ref={toolboxRef}
      data-testid="replay-toolbox"
      onPointerDown={startDrag}
      className="absolute z-20 w-[calc(100%-1.5rem)] max-w-[390px] touch-none cursor-move rounded-lg border app-border bg-[var(--app-panel)]/94 p-1 shadow-2xl shadow-black/30 backdrop-blur"
      style={
        position
          ? { left: position.x, top: position.y }
          : {
              left: "50%",
              top: "55%",
              transform: "translate(-50%, -50%)",
            }
      }
    >
      <div className="flex items-center gap-1.5">
        <span
          data-testid="replay-toolbox-handle"
          aria-hidden
          className="inline-flex h-7 w-5 shrink-0 items-center justify-center app-muted"
        >
          <GripHorizontal size={15} />
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="Replay controls">
          <ControlBtn label="Step back one candle" onClick={onPrev} disabled={!canPrev || busy}>
            <ChevronLeft size={15} aria-hidden />
          </ControlBtn>
          {running ? (
            <ControlBtn label="Pause replay" onClick={onPause} primary>
              <Pause size={15} aria-hidden />
            </ControlBtn>
          ) : (
            <ControlBtn label="Play replay" onClick={onPlay} disabled={busy || finished} primary>
              <Play size={15} aria-hidden />
            </ControlBtn>
          )}
          <ControlBtn label="Next candle" onClick={onNext} disabled={busy || finished}>
            <ChevronRight size={15} aria-hidden />
          </ControlBtn>
          <ControlBtn label="Restart session" onClick={onRestart} disabled={busy}>
            <RotateCcw size={14} aria-hidden />
          </ControlBtn>
          <ControlBtn label="End session" onClick={onEnd} disabled={busy || finished}>
            <Square size={14} aria-hidden />
          </ControlBtn>
        </div>
        <button
          type="button"
          aria-label="Quick Sell"
          onClick={onSell}
          disabled={!canTrade}
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-bear px-2 text-[10px] font-bold text-white hover:opacity-90 disabled:opacity-35"
        >
          <ArrowDownRight size={12} aria-hidden /> Sell
        </button>
        <button
          type="button"
          aria-label="Quick Buy"
          onClick={onBuy}
          disabled={!canTrade}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-brand-500 px-2 text-[10px] font-bold text-surface-950 hover:bg-brand-400 disabled:opacity-35"
        >
          <ArrowUpRight size={12} aria-hidden /> Buy
        </button>
        <button
          type="button"
          aria-label="Reset replay controls position"
          title="Reset toolbox position"
          onClick={() => setPosition(null)}
          className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md app-muted hover:bg-brand-400/10 hover:text-brand-300"
        >
          <LocateFixed size={14} aria-hidden />
        </button>
      </div>

      <div className="mt-1 border-t app-border px-1 pt-1">
        <div className="flex items-center gap-2">
          <label htmlFor="replay-step" className="flex shrink-0 items-center gap-1 text-[9px] font-semibold uppercase tracking-wide app-muted">
            Step
            <select
              id="replay-step"
              aria-label="Replay step"
              value={stepMinutes}
              onChange={(event) =>
                onStepMinutes(Number(event.target.value) as ReplayStepMinutes)
              }
              className="h-6 rounded border app-border bg-[var(--app-panel-2)] px-1 font-mono text-[10px] font-semibold text-[var(--app-text)] outline-none"
            >
              {REPLAY_STEP_MINUTES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`}
                </option>
              ))}
            </select>
          </label>
          <span className="h-4 w-px shrink-0 bg-[var(--app-border)]" aria-hidden />
          <label htmlFor="replay-speed" className="shrink-0 font-mono text-[10px] font-semibold text-brand-300">
            {state.speed}x
          </label>
          <input
            id="replay-speed"
            type="range"
            min={0}
            max={availableSpeeds.length - 1}
            step={1}
            value={speedIndex}
            onChange={(event) => {
              const selected = availableSpeeds[Number(event.target.value)];
              if (selected !== undefined) onSpeed(selected);
            }}
            aria-label="Replay speed"
            aria-valuetext={`${state.speed} times real market time, ${cadenceLabel}`}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-emerald-400"
          />
          <span className="shrink-0 font-mono text-[9px] app-muted">{cadenceLabel}</span>
        </div>

        <div className="mt-0.5 flex items-center justify-between font-mono text-[9px] app-muted">
          <span>{availableSpeeds[0]}x</span>
          {finished && <span className="text-brand-300">Finished</span>}
          <span>{availableSpeeds[availableSpeeds.length - 1]}x</span>
        </div>
      </div>
    </div>
  );
}
