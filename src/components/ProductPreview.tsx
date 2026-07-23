"use client";

import Image from "next/image";
import { BarChart3, Gauge, Play, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { Section } from "@/components/Section";

const VIEWS = [
  {
    id: "replay",
    label: "Replay",
    eyebrow: "Make decisions candle by candle",
    title: "A focused trading workspace",
    description:
      "Move through historical price action, place positions instantly, adjust chart context, and control replay without losing your place.",
    detail: "1m–1D chart context · draggable replay controls · multi-position execution",
    src: "/product/market-replay.webp",
    alt: "ForexTestLab market replay terminal",
    icon: Play,
  },
  {
    id: "dashboard",
    label: "Dashboard",
    eyebrow: "Return to the work that matters",
    title: "Every session stays organised",
    description:
      "Resume active tests, switch between strategies, and see progress and account performance from one clean dashboard.",
    detail: "Saved sessions · replay progress · session-level performance",
    src: "/product/session-dashboard.webp",
    alt: "ForexTestLab session dashboard",
    icon: Gauge,
  },
  {
    id: "analytics",
    label: "Analytics",
    eyebrow: "Turn execution into evidence",
    title: "Review more than net profit",
    description:
      "Study equity, drawdown, expectancy, timing, day-of-week performance, trading sessions, and the sequence behind your results.",
    detail: "Equity and drawdown · timing analysis · trade distributions",
    src: "/product/session-analytics.webp",
    alt: "ForexTestLab session analytics",
    icon: BarChart3,
  },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

export function ProductPreview() {
  const [activeId, setActiveId] = useState<ViewId>("dashboard");
  const active = VIEWS.find((view) => view.id === activeId) ?? VIEWS[0];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveId((current) => {
        const index = VIEWS.findIndex((view) => view.id === current);
        return VIEWS[(index + 1) % VIEWS.length]!.id;
      });
    }, 8000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <Section id="product-preview" className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -z-10 h-[40rem] w-[70rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400/[0.055] blur-[130px]"
      />

      <div className="grid items-end gap-8 lg:grid-cols-[minmax(270px,.38fr)_minmax(0,1fr)]">
        <div className="lg:pb-8">
          <p className="eyebrow">
            <Sparkles size={13} aria-hidden />
            The real workspace
          </p>
          <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            From first candle to final review.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-400">
            These are real views from ForexTestLab—not stock imagery or a
            conceptual mockup.
          </p>

          <div
            className="mt-7 grid gap-2"
            role="tablist"
            aria-label="ForexTestLab product views"
          >
            {VIEWS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeId === id}
                onClick={() => setActiveId(id)}
                className={`group flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                  activeId === id
                    ? "border-brand-400/35 bg-brand-400/[0.09] text-white shadow-card"
                    : "border-transparent text-slate-500 hover:border-white/[0.08] hover:bg-white/[0.025] hover:text-slate-300"
                }`}
              >
                <span
                  className={`grid h-9 w-9 place-items-center rounded-lg ${
                    activeId === id
                      ? "bg-brand-500 text-surface-950"
                      : "border border-white/[0.08] bg-surface-800"
                  }`}
                >
                  <Icon size={16} aria-hidden />
                </span>
                <span className="text-sm font-semibold">{label}</span>
                {activeId === id && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-300" />
                )}
              </button>
            ))}
          </div>

          <div key={active.id} className="showcase-copy mt-7 border-l border-brand-400/40 pl-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-300">
              {active.eyebrow}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">{active.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">{active.description}</p>
            <p className="mt-4 font-mono text-[10px] leading-5 text-slate-500">
              {active.detail}
            </p>
          </div>
        </div>

        <div className="relative min-w-0">
          <div
            aria-hidden
            className="absolute -inset-7 -z-10 rounded-[2rem] bg-[radial-gradient(circle_at_50%_55%,rgba(34,195,160,.12),transparent_65%)] blur-2xl"
          />
          <div className="overflow-hidden rounded-2xl border border-white/[0.12] bg-surface-800/90 p-1.5 shadow-[0_38px_100px_-40px_rgba(0,0,0,.95)]">
            <div className="flex h-9 items-center justify-between rounded-t-xl border-b border-white/[0.08] bg-surface-900/90 px-3">
              <span className="flex gap-1.5" aria-hidden>
                <span className="h-2 w-2 rounded-full bg-bear/75" />
                <span className="h-2 w-2 rounded-full bg-amber-400/75" />
                <span className="h-2 w-2 rounded-full bg-brand-400/75" />
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {active.label}
              </span>
              <span className="h-1.5 w-12 rounded-full bg-white/[0.06]" />
            </div>
            <div key={active.src} className="real-screen-enter overflow-hidden rounded-b-xl">
              <Image
                src={active.src}
                alt={active.alt}
                width={1600}
                height={940}
                sizes="(max-width: 1024px) 100vw, 70vw"
                className="h-auto w-full"
              />
            </div>
          </div>
          <div className="mt-4 h-px overflow-hidden bg-white/[0.06]">
            <span key={active.id} className="real-screen-timeline block h-full bg-brand-400" />
          </div>
        </div>
      </div>
    </Section>
  );
}
