"use client";

import Link from "next/link";
import { Activity, Bot, Clock3, Gauge, Lightbulb, Play, Sparkles, Target, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { useState } from "react";

import { AiInsightsPanel } from "@/components/app/AiInsightsPanel";

const PORTFOLIO_SUGGESTED_QUESTIONS = [
  "Which of my strategies is performing best, and why?",
  "What patterns show up across all my sessions?",
  "Where am I losing the most money overall?",
  "What should I focus on to improve as a trader?",
] as const;

type Tab = "insights" | "activity" | "analyst";
type InsightIcon = "trophy" | "clock" | "gauge" | "play" | "target" | "lightbulb";

const INSIGHT_ICONS = { trophy: Trophy, clock: Clock3, gauge: Gauge, play: Play, target: Target, lightbulb: Lightbulb } as const;

export interface DashboardInsight {
  icon: InsightIcon;
  title: string;
  detail: string;
}

export interface DashboardActivity {
  id: string;
  label: string;
  date: string;
  pnl: string;
  positive: boolean;
}

export function DashboardReviewWorkspace({ insights, activity, aiEnabled }: { insights: DashboardInsight[]; activity: DashboardActivity[]; aiEnabled: boolean }) {
  const [tab, setTab] = useState<Tab>("insights");
  const tabs = [
    { id: "insights" as const, label: "Insights", icon: Sparkles },
    { id: "activity" as const, label: "Activity", icon: Activity },
    { id: "analyst" as const, label: "AI analyst", icon: Bot, pro: true },
  ];

  return (
    <section className="panel mt-4 overflow-hidden">
      <div className="flex flex-col gap-3 border-b app-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-300">Review workspace</p>
          <h2 className="mt-1 text-lg font-semibold">Turn results into better decisions</h2>
        </div>
        <div role="tablist" aria-label="Dashboard review views" className="inline-flex w-fit rounded-lg border app-border bg-[var(--app-panel-2)] p-1">
          {tabs.map(({ id, label, icon: Icon, pro }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${tab === id ? "bg-white/[0.08] text-[var(--app-text)]" : "app-muted hover:text-brand-300"}`}>
              <Icon size={13} aria-hidden /> {label}{pro && <span className="rounded bg-amber-300/10 px-1 py-0.5 text-[8px] font-bold text-amber-200">PRO</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {tab === "insights" && (
          <div className="grid gap-3 md:grid-cols-3">
            {insights.map(({ icon, title, detail }) => {
              const Icon = INSIGHT_ICONS[icon];
              return <article key={title} className="rounded-xl border app-border bg-[var(--app-panel-2)]/55 p-4"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-400/10 text-brand-300"><Icon size={16} aria-hidden /></span><h3 className="mt-3 text-sm font-semibold leading-5">{title}</h3><p className="mt-2 text-xs leading-5 app-muted">{detail}</p></article>;
            })}
          </div>
        )}

        {tab === "activity" && (
          activity.length ? <ol className="grid gap-2 lg:grid-cols-2">{activity.map((item) => <li key={item.id} className="flex items-center gap-3 rounded-xl border app-border bg-[var(--app-panel-2)]/45 p-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${item.positive ? "bg-brand-400/10 text-brand-300" : "bg-bear/10 text-bear"}`}>{item.positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold capitalize">{item.label}</span><span className="mt-1 block text-[11px] app-muted">{item.date}</span></span><span className={`font-mono text-xs font-semibold ${item.positive ? "text-brand-300" : "text-bear"}`}>{item.pnl}</span></li>)}</ol> : <div className="rounded-xl bg-[var(--app-panel-2)]/55 px-4 py-8 text-center"><Activity size={20} className="mx-auto text-brand-300" /><p className="mt-3 text-sm font-semibold">No closed trades yet</p><p className="mt-1 text-xs app-muted">Your latest decisions will appear here.</p></div>
        )}

        {tab === "analyst" && (aiEnabled ? <AiInsightsPanel scope="portfolio" suggestions={PORTFOLIO_SUGGESTED_QUESTIONS} title="Ask your trading data" subtitle="AI analysis across all your saved sessions" /> : <div className="relative overflow-hidden rounded-xl border border-brand-400/25 bg-[linear-gradient(120deg,rgba(34,195,160,0.10),rgba(59,107,255,0.08))] p-5"><Bot size={22} className="text-brand-300" /><p className="mt-3 font-semibold">Meet your AI trading analyst</p><p className="mt-1 max-w-2xl text-xs leading-5 app-muted">Pro reviews every saved session, identifies recurring strengths and mistakes, and suggests what to test next.</p><Link href="/account/billing" className="btn-primary mt-4 px-4 py-2 text-xs">Unlock AI analyst</Link></div>)}
      </div>
    </section>
  );
}
