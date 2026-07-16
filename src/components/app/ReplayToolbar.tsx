"use client";

import {
  ChevronLeft,
  ChevronRight,
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
  const finished = state.status === "finished";
  const running = state.status === "running";
  const canPrev =
    !running &&
    state.closedTrades.length === 0 &&
    !state.openPosition &&
    state.visibleIndex > state.config.initialVisibleCount - 1;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t app-border p-2">
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
  );
}
