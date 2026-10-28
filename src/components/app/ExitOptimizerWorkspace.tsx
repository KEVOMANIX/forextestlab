"use client";

import { Check, LoaderCircle, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ExitOptimizerPanel } from "@/components/app/ExitQualityCard";
import type { ExitOptimizerReport } from "@/lib/backtest/exit-optimizer";

const GROUPS = [
  { id: "targets", label: "Fixed targets", detail: "0.5R to 3R", rules: ["target-0.5", "target-1", "target-1.5", "target-2", "target-2.5", "target-3"] },
  { id: "break-even", label: "Break even", detail: "Trigger from +0.5R to +2R", rules: ["be-0.5", "be-1", "be-1.5", "be-2"] },
  { id: "trailing", label: "Trailing stops", detail: "Three R-based trails", rules: ["trail-1-0.5", "trail-1.5-1", "trail-2-1"] },
  { id: "holding", label: "Holding time", detail: "Exit after 1 to 12 hours", rules: ["hold-1h", "hold-2h", "hold-4h", "hold-8h", "hold-12h"] },
] as const;

export function ExitOptimizerWorkspace({ sessionId, status }: { sessionId?: string; status: string }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(GROUPS.map((group) => group.id)));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ExitOptimizerReport | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const run = async () => {
    if (!sessionId || status !== "finished" || !selected.size) return;
    setRunning(true);
    setReport(null);
    setError(null);
    setProgress(4);
    timer.current = setInterval(() => setProgress((value) => Math.min(92, value + (value < 35 ? 7 : value < 70 ? 4 : 1))), 450);
    try {
      const ruleIds = GROUPS.filter((group) => selected.has(group.id)).flatMap((group) => [...group.rules]);
      const response = await fetch(`/api/backtest/sessions/${encodeURIComponent(sessionId)}/exit-optimizer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleIds }) });
      const body = await response.json() as { ok?: boolean; optimizer?: ExitOptimizerReport; error?: string };
      if (!response.ok || !body.optimizer) throw new Error(body.error || "The optimizer could not complete.");
      setProgress(100);
      setReport(body.optimizer);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The optimizer could not complete.");
      setProgress(0);
    } finally {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setRunning(false);
    }
  };

  const stage = progress < 25 ? "Loading historical candles" : progress < 60 ? "Simulating exit rules" : progress < 90 ? "Validating on later trades" : "Ranking the results";

  return <main className="mt-5 space-y-4">
    <section className="overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)]">
      <div className="border-b app-border p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-300">Exit optimizer</p><h2 className="mt-1 text-xl font-semibold">Build an exit test</h2><p className="mt-2 max-w-3xl text-xs leading-5 app-muted">Choose the exit families to test. Your entries and initial stops stay unchanged. The first 70% of eligible trades discovers candidates; the final 30% validates them.</p></div>
      <div className="p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{GROUPS.map((group) => { const active = selected.has(group.id); return <button key={group.id} type="button" onClick={() => toggle(group.id)} disabled={running} className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-brand-400/45 bg-brand-400/[0.08]" : "app-border bg-white/[0.015] hover:bg-white/[0.035]"}`}><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${active ? "border-brand-300 bg-brand-400 text-surface-950" : "app-border"}`}>{active && <Check size={13} strokeWidth={3} />}</span><span><strong className="block text-sm">{group.label}</strong><span className="mt-1 block text-[10px] app-muted">{group.detail}</span></span></button>; })}</div>

        {status !== "finished" ? <p className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-xs text-amber-100">Finish this replay before running the optimizer. Its comparison requires candles beyond each original exit.</p> : !sessionId ? <p className="mt-5 text-xs app-muted">Select a real session to run the optimizer.</p> : null}

        {running && <div className="mt-5 rounded-xl border app-border bg-white/[0.02] p-4" role="status"><div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-xs font-semibold"><LoaderCircle size={15} className="animate-spin text-brand-300" />{stage}</span><span className="font-mono text-xs text-brand-300">{progress}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-brand-400 transition-[width] duration-500" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-[10px] app-muted">Keep this tab open while the server replays the selected rules candle by candle.</p></div>}
        {error && <p role="alert" className="mt-5 rounded-xl border border-loss/25 bg-loss/[0.07] p-4 text-xs text-loss">{error}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={run} disabled={running || status !== "finished" || !sessionId || !selected.size} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-5 text-xs font-bold text-surface-950 transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-45">{running ? <LoaderCircle size={14} className="animate-spin" /> : report ? <RotateCcw size={14} /> : <Play size={14} />}{report ? "Run again" : "Run optimizer"}</button><span className="text-[10px] app-muted">{selected.size} of {GROUPS.length} rule groups selected</span></div>
      </div>
    </section>

    {report && <section className="overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)]"><ExitOptimizerPanel report={report} /></section>}
  </main>;
}
