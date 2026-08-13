"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, ArrowRight, MapPin, X } from "lucide-react";

import { trackProductEvent } from "@/components/ProductAnalytics";

const TOUR_KEY = "forextestlab:backtester-tour-v2";
const START_EVENT = "forextestlab:start-tour";

interface TourStep {
  selector: string;
  title: string;
  text: string;
}

const ALL_STEPS: TourStep[] = [
  {
    selector: '[data-tour="session-menu"]',
    title: "Your backtest session",
    text: "This menu opens the dashboard, saved sessions, analytics, or a fresh backtest. Your current session saves automatically.",
  },
  {
    selector: '[data-tour="chart-controls"]',
    title: "Chart context",
    text: "These are the focused chart’s symbol, timeframe, chart type, indicators, screenshot, and layout controls.",
  },
  {
    selector: '[data-tour="new-order"]',
    title: "Place an order",
    text: "New order opens the ticket for market, limit, or stop orders. Set size, stop-loss, and take-profit before submitting.",
  },
  {
    selector: '[data-tour="chart-workspace"]',
    title: "The chart workspace",
    text: "Read candles here, zoom or pan, and drag order, stop-loss, and take-profit lines directly on the price chart.",
  },
  {
    selector: '[data-tour="replay-controls"]',
    title: "Replay the market",
    text: "Step backward or forward, play and pause, choose replay speed, and use quick Buy or Sell. Drag this toolbox anywhere on desktop.",
  },
  {
    selector: '[data-tour="session-panel"]',
    title: "Positions, trades, and journal",
    text: "Open these tabs to manage positions and pending orders, review completed trades, write journal notes, add bookmarks, and launch analytics.",
  },
  {
    selector: '[data-tour="workspace-rail"]',
    title: "Workspace shortcuts",
    text: "The right rail opens history, analytics, the economic calendar, and chart settings. Use the question-mark button here whenever you want this tour again.",
  },
];

function visibleElement(selector: string): HTMLElement | null {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? element : null;
}

export function TradingOnboarding() {
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const start = useCallback(() => {
    const available = ALL_STEPS.filter((item) => visibleElement(item.selector));
    if (!available.length) return;
    setSteps(available);
    setStep(0);
    if (window.localStorage.getItem("forextestlab:onboarding-started") !== "yes") {
      window.localStorage.setItem("forextestlab:onboarding-started", "yes");
      trackProductEvent("onboarding_started");
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (window.localStorage.getItem(TOUR_KEY) !== "done") start();
    });
    window.addEventListener(START_EVENT, start);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(START_EVENT, start);
    };
  }, [start]);

  const close = useCallback((completed = false) => {
    window.localStorage.setItem(TOUR_KEY, "done");
    // Retire the old unanchored tour as well, so it cannot reappear if an older
    // deployment is briefly served from a browser cache.
    window.localStorage.setItem("forextestlab:onboarding", "done");
    if (completed) trackProductEvent("onboarding_completed");
    setSteps([]);
    setTargetRect(null);
  }, []);

  const current = steps[step];
  useLayoutEffect(() => {
    if (!current) return;
    const target = visibleElement(current.selector);
    if (!target) return;
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    const measure = () => setTargetRect(target.getBoundingClientRect());
    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [current]);

  useEffect(() => {
    if (!current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") setStep((value) => Math.min(steps.length - 1, value + 1));
      if (event.key === "ArrowLeft") setStep((value) => Math.max(0, value - 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, current, steps.length]);

  if (!current || !targetRect) return null;

  const cardWidth = Math.min(360, window.innerWidth - 24);
  const estimatedCardHeight = 225;
  const gap = 14;
  const left = Math.max(12, Math.min(window.innerWidth - cardWidth - 12, targetRect.left + targetRect.width / 2 - cardWidth / 2));
  const fitsBelow = targetRect.bottom + gap + estimatedCardHeight < window.innerHeight;
  const top = Math.max(12, Math.min(
    window.innerHeight - estimatedCardHeight - 12,
    fitsBelow ? targetRect.bottom + gap : targetRect.top - estimatedCardHeight - gap,
  ));

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed z-[140] rounded-lg border-2 border-brand-300 shadow-[0_0_0_9999px_rgba(2,6,12,0.72),0_0_28px_rgba(34,195,160,0.42)] transition-all duration-200"
        style={{
          left: Math.max(4, targetRect.left - 5),
          top: Math.max(4, targetRect.top - 5),
          width: Math.min(window.innerWidth - 8, targetRect.width + 10),
          height: Math.min(window.innerHeight - 8, targetRect.height + 10),
        }}
      />
      <aside
        role="dialog"
        aria-label={`Backtester tour: ${current.title}`}
        className="fixed z-[150] rounded-2xl border border-brand-400/40 bg-[var(--app-panel-solid)] p-5 shadow-2xl"
        style={{ left, top, width: cardWidth }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-300">
              <MapPin size={12} aria-hidden /> Backtester tour · {step + 1}/{steps.length}
            </p>
            <h2 className="mt-2 font-semibold">{current.title}</h2>
          </div>
          <button type="button" onClick={() => close()} aria-label="Close backtester tour" className="app-muted hover:text-brand-300">
            <X size={17} aria-hidden />
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed app-muted">{current.text}</p>
        <div className="mt-5 flex items-center justify-between">
          <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0} className="btn-secondary px-3 py-2 text-xs disabled:opacity-30">
            <ArrowLeft size={14} aria-hidden /> Previous
          </button>
          {step === steps.length - 1 ? (
            <button type="button" onClick={() => close(true)} className="btn-primary px-3 py-2 text-xs">Start testing</button>
          ) : (
            <button type="button" onClick={() => setStep((value) => value + 1)} className="btn-primary px-3 py-2 text-xs">
              Next <ArrowRight size={14} aria-hidden />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
