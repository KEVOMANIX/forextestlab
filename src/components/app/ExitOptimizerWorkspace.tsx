"use client";

import { ArrowRight, Check, Clock3, LoaderCircle, Play, RotateCcw, ShieldCheck, Target, TrendingUp, Trophy } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { ExitOptimizerPanel, type OptimizerObjective } from "@/components/app/ExitQualityCard";
import type { ExitOptimizerReport } from "@/lib/backtest/exit-optimizer";

type RuleGroup = { id: string; label: string; detail: string; description: string; rules: readonly string[]; icon: ComponentType<{ size?: number; className?: string }> };
const GROUPS: readonly RuleGroup[] = [
  { id: "targets", label: "Fixed targets", detail: "0.5R to 3R", description: "Find the profit target with the strongest repeatable result.", rules: ["target-0.5", "target-1", "target-1.5", "target-2", "target-2.5", "target-3"], icon: Target },
  { id: "break-even", label: "Break even", detail: "Trigger from +0.5R to +2R", description: "Move the stop to entry after price reaches a reward threshold.", rules: ["be-0.5", "be-1", "be-1.5", "be-2"], icon: ShieldCheck },
  { id: "trailing", label: "Trailing stops", detail: "Three R-based trails", description: "Protect open profit while allowing winners room to continue.", rules: ["trail-1-0.5", "trail-1.5-1", "trail-2-1"], icon: TrendingUp },
  { id: "holding", label: "Holding time", detail: "Exit after 1 to 12 hours", description: "Discover whether time in the market helps your outcomes.", rules: ["hold-1h", "hold-2h", "hold-4h", "hold-8h", "hold-12h"], icon: Clock3 },
];
const STAGES = [
  { threshold: 22, label: "Preparing trades", detail: "Loading entries, stops and candle paths" },
  { threshold: 58, label: "Testing combinations", detail: "Replaying every selected exit rule" },
  { threshold: 88, label: "Validating candidates", detail: "Checking winners on later trades" },
  { threshold: 101, label: "Ranking results", detail: "Comparing stability and drawdown" },
] as const;
const OBJECTIVES: Array<{ id: OptimizerObjective; label: string; detail: string }> = [
  { id: "balanced", label: "Balanced", detail: "Return and risk" },
  { id: "return", label: "Maximum return", detail: "Highest total R" },
  { id: "profit-factor", label: "Profit factor", detail: "Best gain/loss ratio" },
  { id: "drawdown", label: "Lowest drawdown", detail: "Smoothest result" },
];

export function ExitOptimizerWorkspace({ sessionId, status }: { sessionId?: string; status: string }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(GROUPS.map((g) => g.id)));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ExitOptimizerReport | null>(null);
  const [objective, setObjective] = useState<OptimizerObjective>("balanced");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const run = async () => {
    if (!sessionId || status !== "finished" || !selected.size) return;
    setRunning(true); setReport(null); setError(null); setProgress(4);
    timer.current = setInterval(() => setProgress((v) => Math.min(92, v + (v < 35 ? 7 : v < 70 ? 4 : 1))), 450);
    try {
      const ruleIds = GROUPS.filter((g) => selected.has(g.id)).flatMap((g) => [...g.rules]);
      const response = await fetch(`/api/backtest/sessions/${encodeURIComponent(sessionId)}/exit-optimizer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleIds }) });
      const body = await response.json() as { optimizer?: ExitOptimizerReport; error?: string };
      if (!response.ok || !body.optimizer) throw new Error(body.error || "The optimizer could not complete.");
      setProgress(100); setReport(body.optimizer);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The optimizer could not complete."); setProgress(0); }
    finally { if (timer.current) clearInterval(timer.current); timer.current = null; setRunning(false); }
  };

  const currentStep = report ? 3 : running ? 2 : 1;
  const activeStage = STAGES.findIndex((stage) => progress < stage.threshold);
  const ruleCount = GROUPS.filter((g) => selected.has(g.id)).reduce((sum, g) => sum + g.rules.length, 0);
  const steps = [{ n: 1, title: "Select rules", text: "Choose what to test" }, { n: 2, title: "Run analysis", text: "Replay each combination" }, { n: 3, title: "Review winner", text: "See validated results" }];

  return <main className="mt-5 space-y-4">
    <section className="overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)]">
      <div className="border-b app-border px-5 py-5 lg:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-300">Exit optimizer</p>
        <h2 className="mt-1 text-xl font-semibold">Find a stronger way to exit</h2>
        <p className="mt-2 max-w-3xl text-xs leading-5 app-muted">Choose the rules you want to test. We keep every entry and initial stop unchanged, then validate the strongest result on later trades.</p>
        <ol className="mt-5 grid gap-2 md:grid-cols-3">{steps.map((step) => { const complete = currentStep > step.n; const active = currentStep === step.n; return <li key={step.n} className={`relative flex items-center gap-3 rounded-xl border px-4 py-3 ${active ? "border-brand-400/45 bg-brand-400/[0.08]" : complete ? "border-brand-400/20 bg-brand-400/[0.035]" : "app-border bg-white/[0.015]"}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-bold ${active || complete ? "border-brand-300/60 bg-brand-400 text-surface-950" : "app-border app-muted"}`}>{complete ? <Check size={15} /> : step.n}</span><span><strong className="block text-xs">{step.title}</strong><span className="mt-0.5 block text-[9px] app-muted">{step.text}</span></span>{step.n < 3 && <ArrowRight size={14} className="absolute -right-2.5 z-10 hidden rounded-full bg-[var(--app-panel)] app-muted md:block" />}</li>; })}</ol>
      </div>

      <div className="p-5 lg:p-6">
        {!running && !report && <><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold">Select exit rules to test</p><p className="mt-1 text-[10px] app-muted">Choose one or more families. You can run another selection later.</p></div><p className="font-mono text-[10px] text-brand-300">{ruleCount} rule variations selected</p></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{GROUPS.map((group) => { const active = selected.has(group.id); const Icon = group.icon; return <button key={group.id} type="button" onClick={() => toggle(group.id)} className={`relative min-h-40 rounded-xl border p-4 text-left transition-all ${active ? "border-brand-400/55 bg-brand-400/[0.08]" : "app-border bg-white/[0.015] hover:border-brand-400/25 hover:bg-white/[0.035]"}`}><span className={`grid h-9 w-9 place-items-center rounded-lg ${active ? "bg-brand-400/15 text-brand-300" : "bg-white/[0.04] app-muted"}`}><Icon size={18} /></span><span className={`absolute right-4 top-4 grid h-5 w-5 place-items-center rounded-md border ${active ? "border-brand-300 bg-brand-400 text-surface-950" : "app-border"}`}>{active && <Check size={13} />}</span><strong className="mt-4 block text-sm">{group.label}</strong><span className="mt-1 block font-mono text-[10px] text-brand-300">{group.detail}</span><span className="mt-2 block text-[10px] leading-4 app-muted">{group.description}</span></button>; })}</div>
          <div className="mt-5 border-t app-border pt-4"><p className="text-xs font-semibold">What should the optimizer prioritize?</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{OBJECTIVES.map((item) => <button key={item.id} type="button" onClick={() => setObjective(item.id)} className={`rounded-lg border px-3 py-2.5 text-left ${objective === item.id ? "border-brand-400/50 bg-brand-400/[0.08]" : "app-border bg-white/[0.015]"}`}><strong className="block text-[11px]">{item.label}</strong><span className="mt-0.5 block text-[9px] app-muted">{item.detail}</span></button>)}</div></div></>}

        {status !== "finished" ? <p className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-xs text-amber-100">Finish this replay before running the optimizer. Its comparison requires candles beyond each original exit.</p> : !sessionId ? <p className="mt-5 text-xs app-muted">Select a real session to run the optimizer.</p> : null}
        {running && <div role="status" className="mx-auto max-w-3xl py-3"><div className="flex items-center justify-between gap-3"><div><p className="inline-flex items-center gap-2 text-sm font-semibold"><LoaderCircle size={16} className="animate-spin text-brand-300" />Running your exit analysis</p><p className="mt-1 text-[10px] app-muted">Keep this tab open while we replay the rules candle by candle.</p></div><span className="font-mono text-lg font-semibold text-brand-300">{progress}%</span></div><div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-brand-400 transition-[width] duration-500" style={{ width: `${progress}%` }} /></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{STAGES.map((stage, index) => { const done = progress >= stage.threshold; const active = index === activeStage; return <div key={stage.label} className={`flex items-center gap-3 rounded-xl border p-3 ${active ? "border-brand-400/35 bg-brand-400/[0.06]" : "app-border bg-white/[0.015]"}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${done ? "bg-brand-400 text-surface-950" : active ? "bg-brand-400/15 text-brand-300" : "bg-white/[0.04] app-muted"}`}>{done ? <Check size={14} /> : active ? <LoaderCircle size={14} className="animate-spin" /> : index + 1}</span><span><strong className="block text-[11px]">{stage.label}</strong><span className="mt-0.5 block text-[9px] app-muted">{stage.detail}</span></span></div>; })}</div></div>}
        {error && <p role="alert" className="mt-5 rounded-xl border border-loss/25 bg-loss/[0.07] p-4 text-xs text-loss">{error}</p>}
        {!running && <div className={`flex flex-wrap items-center gap-3 ${report ? "justify-between border-t app-border pt-5" : "mt-5"}`}>{report && <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-brand-400/15 text-brand-300"><Trophy size={15} /></span><span><strong className="block text-xs">Analysis complete</strong><span className="block text-[9px] app-muted">The winner was tested against later trades.</span></span></div>}<div className="flex flex-wrap items-center gap-3"><button type="button" onClick={run} disabled={status !== "finished" || !sessionId || !selected.size} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-500 px-6 text-xs font-bold text-surface-950 hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-45">{report ? <RotateCcw size={14} /> : <Play size={14} />}{report ? "Run another test" : "Run optimizer"}<ArrowRight size={14} /></button>{!report && <span className="text-[10px] app-muted">{selected.size} of {GROUPS.length} rule families selected</span>}</div></div>}
      </div>
    </section>
    {report && <section className="overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)]"><ExitOptimizerPanel report={report} objective={objective} /></section>}
  </main>;
}
