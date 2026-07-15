import { Construction } from "lucide-react";

import { Section } from "@/components/Section";

const ROADMAP = [
  { phase: "Phase 1", title: "Landing page and waitlist", current: true },
  { phase: "Phase 2", title: "Historical chart and replay prototype" },
  { phase: "Phase 3", title: "Simulated trade execution" },
  { phase: "Phase 4", title: "Journaling and performance analytics" },
  { phase: "Phase 5", title: "Private beta testing" },
];

export function DevelopmentStatus() {
  return (
    <Section id="development-status" className="bg-surface-900/40">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
        <div>
          <p className="eyebrow">
            <Construction size={14} aria-hidden />
            Development status
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Transparent about where we are
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-400 sm:text-lg">
            ForexTestLab is currently in development. Features, integrations,
            pricing, and launch dates may change before public release.
          </p>
          <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
            <p className="text-sm leading-relaxed text-amber-200/90">
              We publish this roadmap to set clear expectations. It shows the
              order of work, not fixed dates — no exact timelines are promised.
            </p>
          </div>
        </div>

        <ol className="relative space-y-4 border-l border-white/10 pl-6">
          {ROADMAP.map((item) => (
            <li key={item.phase} className="relative">
              <span
                className={`absolute -left-[31px] top-1.5 grid h-4 w-4 place-items-center rounded-full border-2 ${
                  item.current
                    ? "border-brand-400 bg-brand-400"
                    : "border-white/20 bg-surface-900"
                }`}
                aria-hidden
              />
              <div
                className={`rounded-xl border p-4 ${
                  item.current
                    ? "border-brand-400/30 bg-brand-400/5"
                    : "border-white/10 bg-surface-800/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-brand-300">
                    {item.phase}
                  </span>
                  {item.current && (
                    <span className="rounded-full bg-brand-400/15 px-2 py-0.5 text-[11px] font-medium text-brand-200">
                      In progress
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium text-white">
                  {item.title}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
