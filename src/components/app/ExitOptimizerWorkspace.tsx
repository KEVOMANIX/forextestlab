"use client";

import { ArrowUpRight, Check, Clock3, LoaderCircle, Play, ShieldCheck, Target, TrendingUp, Workflow } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { objectiveScore, type OptimizerObjective } from "@/components/app/ExitQualityCard";
import { ExitOptimizerPhases } from "@/components/app/ExitOptimizerPhases";
import { ExitOptimizerResults } from "@/components/app/ExitOptimizerResults";
import type { ExitOptimizerReport } from "@/lib/backtest/exit-optimizer";
import styles from "./ExitOptimizerWorkspace.module.css";

type RuleGroup = { id: string; phase: 1 | 2; label: string; detail: string; rules: readonly string[]; icon: ComponentType<{ size?: number }> };
const GROUPS: readonly RuleGroup[] = [
  { id: "targets", phase: 1, label: "Fixed targets", detail: "0.5R to 3R", rules: ["target-0.5", "target-1", "target-1.5", "target-2", "target-2.5", "target-3"], icon: Target },
  { id: "break-even", phase: 1, label: "Break even", detail: "Trigger from +0.5R to +2R", rules: ["be-0.5", "be-1", "be-1.5", "be-2"], icon: ShieldCheck },
  { id: "trailing", phase: 1, label: "Trailing stops", detail: "Three R-based trails", rules: ["trail-1-0.5", "trail-1.5-1", "trail-2-1"], icon: TrendingUp },
  { id: "holding", phase: 1, label: "Holding time", detail: "Exit after 1 to 12 hours", rules: ["hold-1h", "hold-2h", "hold-4h", "hold-8h", "hold-12h"], icon: Clock3 },
  { id: "combinations", phase: 2, label: "Rule combinations", detail: "Break even + trailing stop + final target", rules: ["combo-be1-trail2-1-target3", "combo-be0.5-trail1.5-1-target3", "combo-be1-trail2-0.5-target3", "combo-be1-trail1.5-0.5-target2.5"], icon: Workflow },
];
const OBJECTIVES: Array<{ id: OptimizerObjective; label: string }> = [
  { id: "balanced", label: "Balanced" }, { id: "return", label: "Maximum return" },
  { id: "profit-factor", label: "Profit factor" }, { id: "drawdown", label: "Lowest drawdown" },
];
const PHASES = ["Rules", "Combinations", "Context", "Robustness", "Review", "Deploy"];
type Phase = 1 | 2 | 3 | 4 | 5 | 6;
const isAnalysisPhase = (phase: Phase): phase is 3 | 4 | 5 | 6 => phase >= 3;

export function ExitOptimizerWorkspace({ sessionId, status }: { sessionId?: string; status: string }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(GROUPS.map(group => group.id)));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ExitOptimizerReport | null>(null);
  const [objective, setObjective] = useState<OptimizerObjective>("balanced");
  const [view, setView] = useState<"configure" | "results">("configure");
  const [phase, setPhase] = useState<Phase>(1);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    setReport(null); setError(null); setRunning(false); setView("configure"); setPhase(1);
    return () => { request.current?.abort(); request.current = null; };
  }, [sessionId]);

  const best = report?.rules.filter(row => row.validationPassed).sort((a, b) => objectiveScore(b, objective) - objectiveScore(a, objective))[0] ?? null;
  const ruleCount = GROUPS.filter(group => selected.has(group.id)).reduce((sum, group) => sum + group.rules.length, 0);
  const canRun = status === "finished" && Boolean(sessionId) && ruleCount > 0 && !running;
  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const configure = () => { setView("configure"); setPhase(1); };
  const run = async () => {
    if (!canRun || !sessionId) return;
    const controller = new AbortController();
    request.current?.abort(); request.current = controller;
    setRunning(true); setError(null);
    try {
      const ruleIds = GROUPS.filter(group => selected.has(group.id)).flatMap(group => [...group.rules]);
      const response = await fetch(`/api/backtest/sessions/${encodeURIComponent(sessionId)}/exit-optimizer`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleIds }), signal: controller.signal,
      });
      const body = await response.json() as { optimizer?: ExitOptimizerReport; error?: string };
      if (!response.ok || !body.optimizer) throw new Error(body.error || "The optimizer could not complete.");
      if (!controller.signal.aborted) { setReport(body.optimizer); setView("results"); setPhase(1); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The optimizer could not complete.");
    } finally {
      if (request.current === controller) { request.current = null; setRunning(false); }
    }
  };

  return <main className={styles.workspace} data-testid="optimizer-workspace">
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Strategy research</p><h2 className={styles.title}>Exit optimizer</h2></div>
      <div className={styles.viewSwitch} aria-label="Optimizer view">
        <button type="button" aria-pressed={view === "configure"} onClick={configure} disabled={running}>Configure</button>
        <button type="button" aria-pressed={view === "results"} onClick={() => { setView("results"); setPhase(1); }} disabled={!report || running}>Results</button>
      </div>
    </header>

    <nav className={styles.phases} aria-label="Optimizer phases">
      {PHASES.map((label, index) => {
        const number = (index + 1) as Phase;
        return <button key={label} type="button" aria-current={phase === number ? "step" : undefined}
          disabled={running || (number > 2 && !best)} title={number > 2 && !best ? "Run the optimizer and find a validated candidate first" : undefined}
          onClick={() => { setPhase(number); setView(number <= 2 ? "configure" : "results"); }}>
          <span>{String(number).padStart(2, "0")}</span>{label}
        </button>;
      })}
    </nav>

    <div className={styles.layout}>
      <div className={styles.content}>
        {running ? <section className={styles.panel} role="status" aria-live="polite">
          <div className={styles.loading}><LoaderCircle size={26} className="animate-spin" /><h3>Running your exit analysis</h3><p>Replaying selected rules and validating them on later trades.</p></div>
        </section> : view === "configure" ? <section className={styles.panel}>
          <p className={styles.eyebrow}>{phase === 2 ? "Coordinated exit plans" : "Design your test"}</p>
          <h3 className={styles.sectionTitle}>{phase === 2 ? "Combine protection and targets" : "Find a better exit."}</h3>
          <div className={styles.ruleGrid}>
            {GROUPS.filter(group => group.phase === phase).map(group => {
              const active = selected.has(group.id), Icon = group.icon;
              return <button type="button" key={group.id} className={styles.rule} aria-pressed={active} onClick={() => toggle(group.id)}>
                <span className={styles.ruleTop}><span className={styles.ruleIcon}><Icon size={20} /></span><span className={styles.ruleCheck}>{active && <Check size={12} />}</span></span>
                <span><strong>{group.label}</strong><small>{group.detail}</small></span>
                <span className={styles.ruleCount}>{group.rules.length} variations</span>
              </button>;
            })}
          </div>
          {phase === 1 && <button type="button" className={styles.inlineLink} onClick={() => setPhase(2)}>Rule combinations <span>{selected.has("combinations") ? "4 selected" : "Not selected"}</span><ArrowUpRight size={14} /></button>}
          {phase === 2 && <p className={styles.note}>Tests break-even, trailing protection and a final target as a single plan. Selections in Rules remain included.</p>}
          <div className={styles.actionRow}><span>{ruleCount} variations selected</span><button type="button" className={styles.primary} onClick={() => void run()} disabled={!canRun}><Play size={14} />Run optimizer<ArrowUpRight size={14} /></button></div>
          <p className={styles.note}>Same entries. Same risk. Different exits.</p>
        </section> : report && phase <= 2 ? <ExitOptimizerResults report={report} best={best} objective={objective} onDeploy={() => setPhase(6)} /> : report && best && isAnalysisPhase(phase) ?
          <section className={`${styles.panel} ${styles.phaseContent}`}><ExitOptimizerPhases report={report} best={best} activePhase={phase} /></section> : null}

        {status !== "finished" ? <p className={styles.warning}>Finish this replay before running the optimizer.</p> : !sessionId ? <p className={styles.warning}>Select a real session to run the optimizer.</p> : null}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>

      <aside className={styles.scope} aria-label="Test scope">
        <p className={styles.eyebrow}>Analysis settings</p><h3>Test scope</h3>
        <dl>
          <div><dt>Eligible trades</dt><dd>{report?.eligibleTrades ?? "—"}</dd></div>
          <div><dt>{view === "results" && report ? "Rules tested" : "Rule variations"}</dt><dd>{view === "results" && report ? report.rules.length : ruleCount}</dd></div>
          <div><dt>Discovery</dt><dd>{report ? report.discoveryTrades : "70%"}</dd></div>
          <div><dt>Validation</dt><dd>{report ? report.validationTrades : "30%"}</dd></div>
        </dl>
        <label className={styles.objective}>Optimize for<select aria-label="Optimization objective" value={objective} onChange={event => setObjective(event.target.value as OptimizerObjective)} disabled={running}>
          {OBJECTIVES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        {report && <button type="button" className={styles.secondary} onClick={configure} disabled={running}>Edit rules</button>}
        <p className={styles.note}>Chronological validation on later trades. Simulation, not a performance guarantee.</p>
      </aside>
    </div>
  </main>;
}
