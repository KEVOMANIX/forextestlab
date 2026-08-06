"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  GripHorizontal,
  LocateFixed,
  Pause,
  Play,
  RotateCcw,
  Square,
  StepBack,
} from "lucide-react";

import {
  REPLAY_SPEEDS,
  type PublicSessionState,
  type ReplaySpeed,
} from "@/lib/backtest/types";
import type { Timeframe } from "@/lib/market-data/types";
import { useCompactViewport } from "@/lib/ui/use-media-query";
import { replayRewindFloor } from "@/lib/backtest/replay-engine";
import { LotSizePopover, useSizeSummary } from "./LotSizePopover";

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
  onBuy: () => void;
  onSell: () => void;
  canTrade: boolean;
  maxReplaySpeed: number;
  /** Size the quick Buy/Sell buttons will send, shared with the order ticket. */
  lots: string;
  onLotsChange: (lots: string) => void;
  /** The focused chart's own timeframe, so this toolbar's picker stays in step with it. */
  timeframe: Timeframe;
  availableTimeframes: Timeframe[];
  onTimeframeChange: (timeframe: Timeframe) => void;
}

function ControlBtn({
  label,
  onClick,
  disabled,
  children,
  primary = false,
  previous = false,
  title = label,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  primary?: boolean;
  previous?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      className={`inline-flex h-7 items-center justify-center rounded-md border transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100 ${
        primary
          ? "w-7 border-brand-400/30 bg-brand-500 text-surface-950 hover:bg-brand-400"
          : previous
            ? "w-8 border-white/15 bg-white/[0.06] text-[var(--app-text)] shadow-inner hover:border-brand-400/50 hover:bg-brand-400/10 hover:text-brand-300"
            : "w-7 app-border hover:border-brand-400/40"
      }`}
    >
      {children}
    </button>
  );
}

function speedLabel(speed: ReplaySpeed): string {
  // Speed values are seconds of market time per wall-clock second. Convert to
  // minutes per second so the label matches the actual replay progression.
  const minutesPerSecond = speed / 60;
  if (minutesPerSecond >= 24 * 60) {
    const days = minutesPerSecond / (24 * 60);
    return `${days >= 10 ? Math.round(days) : days.toFixed(1)}d/s`;
  }
  if (minutesPerSecond >= 60) {
    const hours = minutesPerSecond / 60;
    return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)}h/s`;
  }
  return `${minutesPerSecond >= 10 ? Math.round(minutesPerSecond) : minutesPerSecond.toFixed(1)}m/s`;
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
  onBuy,
  onSell,
  canTrade,
  maxReplaySpeed,
  lots,
  onLotsChange,
  timeframe,
  availableTimeframes,
  onTimeframeChange,
}: ReplayToolbarProps) {
  const compact = useCompactViewport();
  const sizeSummary = useSizeSummary(state, lots);
  const toolboxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [timeframeMenuOpen, setTimeframeMenuOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const finished = state.status === "finished";
  const running = state.status === "running";
  const rewindFloor = replayRewindFloor(state);
  const prevDisabledReason = state.visibleIndex <= rewindFloor
    ? "You are at the first replay candle"
    : null;
  const canPrev = prevDisabledReason === null;
  /**
   * The session's spread, and the bid/ask it puts around the replay's current
   * price. The engine charges half the spread on each side, so these are the
   * two prices a market order would actually get.
   */
  const spreadPips = Number(state.config.spreadPips) || 0;
  const spreadLabel = spreadPips.toFixed(1);
  const pipSize = Number(state.config.pipSize) || 0;
  const mid = state.currentPrice == null ? null : Number(state.currentPrice);
  const precision = state.config.pricePrecision;
  const bidAsk =
    mid == null || !Number.isFinite(mid)
      ? null
      : {
          bid: (mid - (spreadPips * pipSize) / 2).toFixed(precision),
          ask: (mid + (spreadPips * pipSize) / 2).toFixed(precision),
        };
  const availableSpeeds = REPLAY_SPEEDS.filter((speed) => speed <= maxReplaySpeed);
  const speedIndex = Math.max(0, availableSpeeds.indexOf(state.speed));
  const cadenceLabel = speedLabel(state.speed);

  const cycleSpeed = () => {
    if (availableSpeeds.length < 2) return;
    const next = availableSpeeds[(speedIndex + 1) % availableSpeeds.length];
    if (next !== undefined) onSpeed(next);
  };

  useEffect(() => {
    // On a phone the toolbox is docked to the bottom edge and a stored desktop
    // position would drop it over the middle of the chart.
    if (compact) {
      setPosition(null);
      return;
    }
    try {
      const saved = window.localStorage.getItem("forextestlab:replay-position");
      if (saved) {
        const parsed = JSON.parse(saved) as { x: number; y: number };
        requestAnimationFrame(() => setPosition(clampPosition(parsed.x, parsed.y)));
      }
    } catch {
      // Keep the centred default.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);
  useEffect(() => {
    if (compact) return;
    if (position) window.localStorage.setItem("forextestlab:replay-position", JSON.stringify(position));
    else window.localStorage.removeItem("forextestlab:replay-position");
  }, [compact, position]);

  /**
   * Clamped against the browser window, not this element's parent — the
   * toolbox is fixed to the viewport, so it can be parked over the rail, the
   * toolbar, or a side panel instead of being clipped at the chart area's own
   * `overflow: hidden` edge.
   */
  function clampPosition(x: number, y: number) {
    const toolbox = toolboxRef.current;
    if (!toolbox) return { x, y };
    const padding = 10;
    return {
      x: Math.min(
        Math.max(padding, x),
        Math.max(padding, window.innerWidth - toolbox.offsetWidth - padding),
      ),
      y: Math.min(
        Math.max(padding, y),
        Math.max(padding, window.innerHeight - toolbox.offsetHeight - padding),
      ),
    };
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a")) return;
    const toolbox = toolboxRef.current;
    if (!toolbox) return;

    const box = toolbox.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top,
    };
    setPosition(clampPosition(box.left, box.top));

    dragCleanupRef.current?.();
    const move = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== moveEvent.pointerId) return;
      setPosition(
        clampPosition(
          moveEvent.clientX - drag.offsetX,
          moveEvent.clientY - drag.offsetY,
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

  useEffect(() => {
    if (!menuOpen && !timeframeMenuOpen && !speedMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!toolboxRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setTimeframeMenuOpen(false);
        setSpeedMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen, timeframeMenuOpen, speedMenuOpen]);

  return (
    <div
      ref={toolboxRef}
      data-testid="replay-toolbox"
      onPointerDown={compact ? undefined : startDrag}
      // No backdrop blur: blurring the chart canvas underneath smears candles
      // around the toolbox. The panel colour is opaque enough on its own.
      // Above every piece of chart chrome (rails, legends, order lines all sit
      // at z-30/z-40) so a grid layout cannot slice the toolbox in half with the
      // neighbouring cell's drawing rail. Still below menus and dialogs.
      className={`fixed z-[45] rounded-lg border app-border bg-[var(--app-panel-solid)] p-1.5 shadow-2xl shadow-black/40 ${
        compact
          ? "w-[calc(100%-1.5rem)] max-w-[360px]"
          : "w-fit max-w-[calc(100%-1.5rem)] touch-none cursor-move"
      }`}
      style={
        compact
          ? { left: "50%", bottom: "0.5rem", transform: "translateX(-50%)" }
          : position
            ? { left: position.x, top: position.y }
            : // Rests near the top of the plot rather than across its middle,
              // where it used to sit over the candles and the price scale. Clear
              // of the legend on the left and of the favourites bar above it.
              { left: "50%", top: "3.5rem", transform: "translateX(-50%)" }
      }
    >
      <div className="flex items-center gap-1.5">
        {/* The docked mobile toolbox cannot be dragged, so it shows no handle. */}
        {!compact && (
          <span
            data-testid="replay-toolbox-handle"
            aria-hidden
            className="inline-flex h-7 w-5 shrink-0 items-center justify-center app-muted"
          >
            <GripHorizontal size={15} />
          </span>
        )}
        <div className="flex items-center gap-1" role="group" aria-label="Replay controls">
          <ControlBtn
            label="Previous candle"
            title={busy ? "Updating replay…" : prevDisabledReason ?? "Go back one candle"}
            onClick={onPrev}
            disabled={!canPrev || busy}
            previous
          >
            <StepBack size={17} strokeWidth={2.35} aria-hidden />
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
        </div>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--app-border)]" aria-hidden />
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setTimeframeMenuOpen((open) => !open)}
            aria-label="Chart timeframe"
            aria-haspopup="menu"
            aria-expanded={timeframeMenuOpen}
            title="Chart timeframe"
            className={`inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md border px-2 font-mono text-[11px] font-semibold transition-colors ${
              timeframeMenuOpen
                ? "border-brand-400/40 bg-brand-400/15 text-brand-300"
                : "app-border text-[var(--app-text)] hover:border-brand-400/40"
            }`}
          >
            {timeframe}
            <ChevronDown size={12} aria-hidden className={timeframeMenuOpen ? "rotate-180" : ""} />
          </button>
          {timeframeMenuOpen && (
            <div role="menu" aria-label="Chart timeframe" className="absolute left-0 top-9 z-[70] max-h-72 w-24 overflow-y-auto rounded-lg border app-border bg-[var(--app-panel-solid)] p-1 shadow-2xl">
              {availableTimeframes.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option === timeframe}
                  onClick={() => { onTimeframeChange(option); setTimeframeMenuOpen(false); }}
                  className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs font-mono ${
                    option === timeframe ? "bg-brand-400/15 text-brand-300" : "hover:bg-[var(--app-panel-2)]"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--app-border)]" aria-hidden />
        <div className="relative flex shrink-0 items-center">
          <button
            type="button"
            onClick={cycleSpeed}
            disabled={availableSpeeds.length < 2}
            aria-label="Replay speed"
            title={`Replay speed: ${cadenceLabel}. Click for next speed.`}
            className="inline-flex h-7 min-w-[50px] shrink-0 items-center justify-center rounded-l-md border border-r-0 border-brand-400/25 bg-brand-400/10 px-2 font-mono text-[11px] font-semibold text-brand-300 transition-colors hover:bg-brand-400/15 disabled:opacity-50"
          >
            {cadenceLabel}
          </button>
          <button
            type="button"
            onClick={() => setSpeedMenuOpen((open) => !open)}
            disabled={availableSpeeds.length < 2}
            aria-label="Choose replay speed"
            aria-haspopup="menu"
            aria-expanded={speedMenuOpen}
            title="Choose a specific replay speed"
            className={`inline-flex h-7 shrink-0 items-center justify-center rounded-r-md border border-brand-400/25 bg-brand-400/10 px-1 transition-colors hover:bg-brand-400/15 disabled:opacity-50 ${
              speedMenuOpen ? "bg-brand-400/20" : ""
            }`}
          >
            <ChevronDown size={12} aria-hidden className={`text-brand-300 ${speedMenuOpen ? "rotate-180" : ""}`} />
          </button>
          {speedMenuOpen && (
            <div role="menu" aria-label="Replay speed" className="absolute left-0 top-9 z-[70] w-24 rounded-lg border app-border bg-[var(--app-panel-solid)] p-1 shadow-2xl">
              {availableSpeeds.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  role="menuitemradio"
                  aria-checked={speed === state.speed}
                  onClick={() => { onSpeed(speed); setSpeedMenuOpen(false); }}
                  className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs font-mono ${
                    speed === state.speed ? "bg-brand-400/15 text-brand-300" : "hover:bg-[var(--app-panel-2)]"
                  }`}
                >
                  {speedLabel(speed)}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--app-border)]" aria-hidden />
        {/* `group` + `focus-within` reveals the size these two buttons will
            send — reaching for Buy or Sell is exactly when a trader wants to
            check it, and hover alone would hide it from the keyboard. The panel
            hangs off the right so it cannot run past the toolbox, and upwards on
            a phone where the toolbox is docked to the bottom edge. */}
        <div className="group relative flex shrink-0 items-center">
          <button
            type="button"
            aria-label="Quick Sell"
            title={`${spreadLabel} pips${bidAsk ? ` · ${bidAsk.bid}` : ""}`}
            onClick={onSell}
            disabled={!canTrade}
            className="inline-flex h-7 min-w-[48px] shrink-0 items-center justify-center gap-1 rounded-l-md rounded-r-sm bg-bear py-0 pl-1 pr-4 text-[11px] font-bold text-surface-950 hover:opacity-90 disabled:opacity-35 sm:pl-2"
          >
            <ArrowDownRight size={13} aria-hidden />
            <span className="hidden sm:inline">Sell</span>
          </button>
          <span
            data-testid="quick-trade-spread"
            aria-label={`${spreadLabel} pips`}
            title={`${spreadLabel} pips`}
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 inline-flex h-5 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border border-white/20 bg-[#0b1220] px-1 font-mono text-[10px] font-bold leading-none text-white shadow-md"
          >
            {spreadLabel}
          </span>
          <button
            type="button"
            aria-label="Quick Buy"
            title={`${spreadLabel} pips${bidAsk ? ` · ${bidAsk.ask}` : ""}`}
            onClick={onBuy}
            disabled={!canTrade}
            className="inline-flex h-7 min-w-[48px] shrink-0 items-center justify-center gap-1 rounded-l-sm rounded-r-md bg-brand-500 py-0 pl-4 pr-1 text-[11px] font-bold text-surface-950 hover:bg-brand-400 disabled:opacity-35 sm:pr-2"
          >
            <ArrowUpRight size={13} aria-hidden />
            <span className="hidden sm:inline">Buy</span>
          </button>
          <LotSizePopover
            lots={lots}
            onLots={onLotsChange}
            summary={sizeSummary}
            accountCurrency={state.config.accountCurrency}
            equity={state.equity}
            align="right"
            placement={compact ? "above" : "below"}
          />
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="More replay actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="More actions"
            onClick={() => setMenuOpen((open) => !open)}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${menuOpen ? "bg-brand-400/15 text-brand-300" : "app-muted hover:bg-brand-400/10 hover:text-brand-300"}`}
          >
            <Ellipsis size={16} aria-hidden />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-9 z-[70] w-44 rounded-lg border app-border bg-[var(--app-panel-solid)] p-1 shadow-2xl">
              <button type="button" role="menuitem" disabled={busy} onClick={() => { setMenuOpen(false); onRestart(); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[var(--app-panel-2)] disabled:opacity-40">
                <RotateCcw size={15} aria-hidden /> Restart session
              </button>
              <button type="button" role="menuitem" disabled={busy || finished} onClick={() => { setMenuOpen(false); onEnd(); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[var(--app-panel-2)] disabled:opacity-40">
                <Square size={15} aria-hidden /> End session
              </button>
              <button type="button" role="menuitem" onClick={() => { setPosition(null); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[var(--app-panel-2)]">
                <LocateFixed size={15} aria-hidden /> Reset position
              </button>
            </div>
          )}
        </div>
        <span className="sr-only" role="status" aria-live="polite">{finished ? "Replay finished" : `Replay speed ${cadenceLabel}`}</span>
      </div>

    </div>
  );
}
