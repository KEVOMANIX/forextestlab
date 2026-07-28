"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Check,
  Clipboard,
  Gauge,
  Headphones,
  MonitorCog,
  X,
} from "lucide-react";

import type {
  PublicSessionState,
  ReplayStepMinutes,
} from "@/lib/backtest/types";

export interface ReplayDiagnosticsSource {
  sessionId: string;
  status: PublicSessionState["status"];
  speed: number;
  currentTime: number | null;
  visibleIndex: number;
  totalCandles: number;
  stepMinutes: ReplayStepMinutes;
  saveStatus: "saved" | "saving" | "error";
}

interface DiagnosticsSample {
  observedRate: number | null;
  fps: number;
  p95FrameMs: number;
  jankFrames: number;
  longTasks: number;
  longTaskMs: number;
  chartCount: number;
  drawingCount: number;
  indicatorCount: number;
  saveLatencyMs: number | null;
}

const EMPTY_SAMPLE: DiagnosticsSample = {
  observedRate: null,
  fps: 0,
  p95FrameMs: 0,
  jankFrames: 0,
  longTasks: 0,
  longTaskMs: 0,
  chartCount: 0,
  drawingCount: 0,
  indicatorCount: 0,
  saveLatencyMs: null,
};

export function formatReplayRate(secondsPerSecond: number) {
  const minutes = secondsPerSecond / 60;
  if (minutes >= 60) {
    const hours = minutes / 60;
    return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)}h/s`;
  }
  return `${minutes >= 10 ? Math.round(minutes) : minutes.toFixed(1)}m/s`;
}

function storedArrayCount(prefix: string, field?: string) {
  let total = 0;
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const value = JSON.parse(window.localStorage.getItem(key) ?? "null") as
        | unknown[]
        | Record<string, unknown>
        | null;
      const list = field && value && !Array.isArray(value)
        ? value[field]
        : value;
      if (Array.isArray(list)) total += list.length;
    } catch {
      // A malformed local preference should not break diagnostics.
    }
  }
  return total;
}

function tone(value: number, healthy: number, usable: number) {
  if (value >= healthy) return "text-brand-300";
  if (value >= usable) return "text-amber-300";
  return "text-bear";
}

export function ReplayDiagnosticsPanel({
  source,
  onClose,
}: {
  source: ReplayDiagnosticsSource;
  onClose: () => void;
}) {
  const sourceRef = useRef(source);
  const saveStartedRef = useRef<number | null>(null);
  const saveLatencyRef = useRef<number | null>(null);
  const [sample, setSample] = useState(EMPTY_SAMPLE);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    sourceRef.current = source;
    if (source.saveStatus === "saving" && saveStartedRef.current === null) {
      saveStartedRef.current = performance.now();
    } else if (
      source.saveStatus === "saved" &&
      saveStartedRef.current !== null
    ) {
      saveLatencyRef.current = performance.now() - saveStartedRef.current;
      saveStartedRef.current = null;
    } else if (source.saveStatus === "error") {
      saveStartedRef.current = null;
    }
  }, [source]);

  useEffect(() => {
    let animationFrame = 0;
    let previousFrame = performance.now();
    let lastPublished = 0;
    const mountedAt = previousFrame;
    const frames: { at: number; duration: number }[] = [];
    const longTasks: { at: number; duration: number }[] = [];
    const replaySamples: { wall: number; market: number }[] = [];
    const observer =
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes.includes("longtask")
        ? new PerformanceObserver((entries) => {
            const now = performance.now();
            for (const entry of entries.getEntries()) {
              longTasks.push({ at: now, duration: entry.duration });
            }
          })
        : null;
    observer?.observe({ entryTypes: ["longtask"] });

    const measure = (now: number) => {
      const duration = now - previousFrame;
      previousFrame = now;
      frames.push({ at: now, duration });
      while (frames[0] && frames[0].at < now - 10_000) frames.shift();
      while (longTasks[0] && longTasks[0].at < now - 10_000) {
        longTasks.shift();
      }

      if (now - lastPublished >= 500) {
        lastPublished = now;
        const current = sourceRef.current;
        if (current.status === "running" && current.currentTime !== null) {
          replaySamples.push({ wall: now, market: current.currentTime });
          while (
            replaySamples[1] &&
            replaySamples[0]!.wall < now - 10_000
          ) {
            replaySamples.shift();
          }
        } else {
          replaySamples.length = 0;
        }
        const firstReplay = replaySamples[0];
        const lastReplay = replaySamples.at(-1);
        const replayWallSeconds =
          firstReplay && lastReplay
            ? (lastReplay.wall - firstReplay.wall) / 1_000
            : 0;
        const observedRate =
          firstReplay && lastReplay && replayWallSeconds > 0
            ? (lastReplay.market - firstReplay.market) /
              1_000 /
              replayWallSeconds
            : null;
        const recentFrames = frames.filter((frame) => frame.at >= now - 2_000);
        const fpsWindow = Math.min(2_000, Math.max(1, now - mountedAt));
        const durations = recentFrames
          .map((frame) => frame.duration)
          .sort((left, right) => left - right);
        const p95 =
          durations[
            Math.min(
              durations.length - 1,
              Math.floor(durations.length * 0.95),
            )
          ] ?? 0;
        const sessionId = current.sessionId;
        setSample({
          observedRate,
          fps: Math.round((recentFrames.length / fpsWindow) * 1_000),
          p95FrameMs: Math.round(p95 * 10) / 10,
          jankFrames: recentFrames.filter((frame) => frame.duration > 50)
            .length,
          longTasks: longTasks.length,
          longTaskMs: Math.round(
            longTasks.reduce((total, task) => total + task.duration, 0),
          ),
          chartCount: document.querySelectorAll(
            '[role="img"][aria-label="Candlestick price chart"]',
          ).length,
          drawingCount: storedArrayCount(
            `forextestlab:drawings:${sessionId}:`,
          ),
          indicatorCount: storedArrayCount(
            `forextestlab:chart:${sessionId}:`,
            "indicators",
          ),
          saveLatencyMs: saveLatencyRef.current,
        });
      }
      animationFrame = requestAnimationFrame(measure);
    };
    animationFrame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer?.disconnect();
    };
  }, []);

  const requested = source.speed;
  const observedRatio =
    sample.observedRate === null || requested <= 0
      ? null
      : sample.observedRate / requested;
  const deviceMemory = (
    navigator as Navigator & { deviceMemory?: number }
  ).deviceMemory;
  const report = {
    capturedAt: new Date().toISOString(),
    replay: {
      status: source.status,
      requestedRate: requested,
      observedRate: sample.observedRate,
      observedPercent:
        observedRatio === null ? null : Math.round(observedRatio * 100),
      stepMinutes: source.stepMinutes,
      candle: source.visibleIndex + 1,
      totalCandles: source.totalCandles,
    },
    rendering: {
      fps: sample.fps,
      p95FrameMs: sample.p95FrameMs,
      jankFrames: sample.jankFrames,
      longTasks: sample.longTasks,
      longTaskMs: sample.longTaskMs,
    },
    workspace: {
      charts: sample.chartCount,
      drawings: sample.drawingCount,
      indicators: sample.indicatorCount,
    },
    browser: {
      visibility: document.visibilityState,
      logicalProcessors: navigator.hardwareConcurrency ?? null,
      deviceMemoryGb: deviceMemory ?? null,
      saveStatus: source.saveStatus,
      saveLatencyMs: sample.saveLatencyMs,
    },
  };

  return (
    <aside
      className="fixed right-3 top-14 z-[85] w-[350px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border app-border bg-[var(--app-panel)]/96 shadow-2xl backdrop-blur"
      aria-label="Replay diagnostics"
      data-testid="replay-diagnostics"
    >
      <header className="flex items-start gap-3 border-b app-border px-4 py-3">
        <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg bg-brand-400/10 text-brand-300">
          <Gauge size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Replay diagnostics</h2>
          <p className="mt-0.5 text-[10px] app-muted">
            Read-only measurements. Replay behavior is unchanged.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close replay diagnostics"
          className="grid h-7 w-7 place-items-center rounded-md app-muted hover:bg-white/[0.06]"
        >
          <X size={14} />
        </button>
      </header>

      <div className="max-h-[calc(100vh-8rem)] space-y-4 overflow-y-auto p-4 text-xs">
        <section>
          <h3 className="flex items-center gap-2 font-semibold">
            <Activity size={14} className="text-brand-300" /> Replay
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Metric
              label="Requested"
              value={formatReplayRate(requested)}
              testId="diagnostics-requested-rate"
            />
            <Metric
              label="Observed"
              value={
                source.status !== "running"
                  ? "Paused"
                  : sample.observedRate === null
                    ? "Sampling…"
                    : formatReplayRate(sample.observedRate)
              }
              detail={
                observedRatio === null
                  ? undefined
                  : `${Math.round(observedRatio * 100)}% of requested`
              }
              valueClass={
                observedRatio === null
                  ? "app-muted"
                  : tone(observedRatio, 0.9, 0.65)
              }
              testId="diagnostics-observed-rate"
            />
            <Metric label="Step" value={`${source.stepMinutes}m`} />
            <Metric
              label="Progress"
              value={`${source.visibleIndex + 1} / ${source.totalCandles}`}
            />
          </div>
        </section>

        <section>
          <h3 className="flex items-center gap-2 font-semibold">
            <MonitorCog size={14} className="text-brand-300" /> Browser
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Metric
              label="Frame rate"
              value={`${sample.fps} FPS`}
              detail={`p95 ${sample.p95FrameMs}ms`}
              valueClass={tone(sample.fps, 50, 30)}
              testId="diagnostics-fps"
            />
            <Metric
              label="Jank"
              value={`${sample.jankFrames} frames`}
              detail="Over 50ms · last 2s"
            />
            <Metric
              label="Long tasks"
              value={`${sample.longTasks}`}
              detail={`${sample.longTaskMs}ms · last 10s`}
            />
            <Metric
              label="Tab"
              value={document.visibilityState === "visible" ? "Visible" : "Background"}
              valueClass={
                document.visibilityState === "visible"
                  ? "text-brand-300"
                  : "text-amber-300"
              }
            />
            <Metric
              label="Processor"
              value={`${navigator.hardwareConcurrency ?? "—"} logical cores`}
            />
            <Metric
              label="Memory hint"
              value={deviceMemory ? `${deviceMemory} GB` : "Unavailable"}
            />
          </div>
        </section>

        <section>
          <h3 className="font-semibold">Workspace load</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Metric label="Charts" value={String(sample.chartCount)} />
            <Metric label="Drawings" value={String(sample.drawingCount)} />
            <Metric label="Indicators" value={String(sample.indicatorCount)} />
            <Metric
              label="Session save"
              value={source.saveStatus}
              detail={
                sample.saveLatencyMs === null
                  ? undefined
                  : `${Math.round(sample.saveLatencyMs)}ms last save`
              }
              valueClass={
                source.saveStatus === "error"
                  ? "text-bear"
                  : source.saveStatus === "saving"
                    ? "text-amber-300"
                    : "text-brand-300"
              }
            />
          </div>
        </section>

        <p className="rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-[10px] leading-4 text-amber-200">
          Extensions, hardware acceleration and power-saving modes cannot be
          detected directly. Compare this report between Chrome profiles while
          using the same session, layout, STEP and requested speed.
        </p>

        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(JSON.stringify(report, null, 2))
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1_500);
              });
          }}
          className="btn-secondary w-full justify-center px-3 py-2 text-xs"
        >
          {copied ? <Check size={13} /> : <Clipboard size={13} />}
          {copied ? "Copied diagnostics" : "Copy diagnostics report"}
        </button>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("forextestlab:support-context", {
                detail: report,
              }),
            );
            onClose();
          }}
          className="btn-primary w-full justify-center px-3 py-2 text-xs"
        >
          <Headphones size={13} />
          Share diagnostics with support
        </button>
      </div>
    </aside>
  );
}

function Metric({
  label,
  value,
  detail,
  valueClass = "",
  testId,
}: {
  label: string;
  value: string;
  detail?: string;
  valueClass?: string;
  testId?: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.035] px-3 py-2">
      <p className="text-[9px] uppercase tracking-wide app-muted">{label}</p>
      <p
        className={`mt-1 font-mono text-[11px] font-semibold ${valueClass}`}
        data-testid={testId}
      >
        {value}
      </p>
      {detail && <p className="mt-0.5 text-[9px] app-muted">{detail}</p>}
    </div>
  );
}
