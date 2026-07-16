"use client";

import { useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  GripHorizontal,
  LocateFixed,
  Pause,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";

import { REPLAY_SPEEDS, type PublicSessionState, type ReplaySpeed } from "@/lib/backtest/types";

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
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border app-border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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
    !state.openPosition &&
    state.visibleIndex > state.config.initialVisibleCount - 1;

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

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
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

  function startMouseDrag(event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const toolbox = toolboxRef.current;
    const parent = toolbox?.parentElement;
    if (!toolbox || !parent) return;

    const box = toolbox.getBoundingClientRect();
    const bounds = parent.getBoundingClientRect();
    const offsetX = event.clientX - box.left;
    const offsetY = event.clientY - box.top;
    setPosition(clampPosition(box.left - bounds.left, box.top - bounds.top));
    event.preventDefault();

    dragCleanupRef.current?.();
    const move = (moveEvent: MouseEvent) => {
      const currentParent = toolboxRef.current?.parentElement;
      if (!currentParent) return;
      const currentBounds = currentParent.getBoundingClientRect();
      setPosition(
        clampPosition(
          moveEvent.clientX - currentBounds.left - offsetX,
          moveEvent.clientY - currentBounds.top - offsetY,
        ),
      );
    };
    const end = () => {
      cleanup();
      dragCleanupRef.current = null;
    };
    const cleanup = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
    };
    dragCleanupRef.current = cleanup;
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
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
      className="absolute z-20 w-[calc(100%-1.5rem)] max-w-[440px] rounded-xl border app-border bg-[var(--app-panel)]/95 p-2 shadow-2xl shadow-black/30 backdrop-blur"
      style={position ? { left: position.x, top: position.y } : { bottom: 12, left: 12 }}
    >
      <div className="mb-2 flex items-center justify-between border-b app-border pb-1.5">
        <button
          type="button"
          data-testid="replay-toolbox-handle"
          aria-label="Drag replay controls"
          title="Drag toolbox"
          onPointerDown={startDrag}
          onMouseDown={startMouseDrag}
          className="flex touch-none cursor-grab items-center gap-2 rounded-md px-2 py-1 text-xs font-semibold app-muted hover:bg-brand-400/10 hover:text-brand-300 active:cursor-grabbing"
        >
          <GripHorizontal size={16} aria-hidden />
          Replay controls
        </button>
        <button
          type="button"
          aria-label="Reset replay controls position"
          title="Reset toolbox position"
          onClick={() => setPosition(null)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md app-muted hover:bg-brand-400/10 hover:text-brand-300"
        >
          <LocateFixed size={14} aria-hidden />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5" role="group" aria-label="Replay controls">
          <ControlBtn label="Step back one candle" onClick={onPrev} disabled={!canPrev || busy}>
            <ChevronLeft size={16} aria-hidden />
          </ControlBtn>
          {running ? (
            <ControlBtn label="Pause replay" onClick={onPause} primary>
              <Pause size={16} aria-hidden />
            </ControlBtn>
          ) : (
            <ControlBtn label="Play replay" onClick={onPlay} disabled={busy || finished} primary>
              <Play size={16} aria-hidden />
            </ControlBtn>
          )}
          <ControlBtn label="Next candle" onClick={onNext} disabled={busy || finished}>
            <ChevronRight size={16} aria-hidden />
          </ControlBtn>
          <ControlBtn label="Restart session" onClick={onRestart} disabled={busy}>
            <RotateCcw size={16} aria-hidden />
          </ControlBtn>
          <ControlBtn label="End session" onClick={onEnd} disabled={busy || finished}>
            <Square size={16} aria-hidden />
          </ControlBtn>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Replay speed">
          {REPLAY_SPEEDS.map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => onSpeed(sp)}
              aria-pressed={state.speed === sp}
              className={`rounded-md px-2 py-1 font-mono text-xs transition-colors ${
                state.speed === sp
                  ? "bg-brand-400/15 text-brand-300"
                  : "app-muted hover:text-brand-300"
              }`}
            >
              {sp}x
            </button>
          ))}
        </div>

        <div className="ml-auto font-mono text-xs app-muted" aria-live="polite">
          Candle {state.visibleIndex + 1} / {state.totalCandles}
          {finished && <span className="ml-2 text-brand-300">· finished</span>}
        </div>
      </div>
    </div>
  );
}
