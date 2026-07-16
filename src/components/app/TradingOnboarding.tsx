"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

const STEPS = [
  {
    title: "Place a simulated trade",
    text: "Buy and Sell stay at the top. Choose the execution pair before opening a position.",
  },
  {
    title: "Control market replay",
    text: "Use the floating replay toolbox to play, pause, step candle-by-candle, change speed, or drag it elsewhere.",
  },
  {
    title: "Change chart context",
    text: "Use chart timeframes for context, and the pair selector in the top bar for synchronized reference charts.",
  },
  {
    title: "Set protection visually",
    text: "A temporary stop-loss and take-profit appear after entry. Drag the SL and TP lines directly on the chart.",
  },
  {
    title: "Review and record",
    text: "Open the bottom analytics dock for trades, statistics, and notes. Your session progress saves automatically.",
  },
];

export function TradingOnboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setOpen(window.localStorage.getItem("forextestlab:onboarding") !== "done");
  }, []);

  function close() {
    window.localStorage.setItem("forextestlab:onboarding", "done");
    setOpen(false);
  }

  if (!open) return null;
  const current = STEPS[step]!;

  return (
    <aside className="fixed bottom-52 right-3 z-[90] w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border border-brand-400/30 bg-[var(--app-panel)] p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-300">
            Quick tour · {step + 1}/{STEPS.length}
          </p>
          <h2 className="mt-2 font-semibold">{current.title}</h2>
        </div>
        <button type="button" onClick={close} aria-label="Close trading tour" className="app-muted hover:text-brand-300">
          <X size={17} aria-hidden />
        </button>
      </div>
      <p className="mt-3 text-sm leading-relaxed app-muted">{current.text}</p>
      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          disabled={step === 0}
          className="btn-secondary px-3 py-2 text-xs disabled:opacity-30"
        >
          <ArrowLeft size={14} aria-hidden /> Previous
        </button>
        {step === STEPS.length - 1 ? (
          <button type="button" onClick={close} className="btn-primary px-3 py-2 text-xs">
            Start testing
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((value) => value + 1)}
            className="btn-primary px-3 py-2 text-xs"
          >
            Next <ArrowRight size={14} aria-hidden />
          </button>
        )}
      </div>
    </aside>
  );
}
