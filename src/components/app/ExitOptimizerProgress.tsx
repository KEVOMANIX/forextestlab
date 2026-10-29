"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { OptimizerProgress } from "@/lib/backtest/optimizer-progress";
import styles from "./ExitOptimizerWorkspace.module.css";

const STAGES = [
  { id: "preparing", title: "Prepare session" },
  { id: "loading", title: "Load market history" },
  { id: "replaying", title: "Replay exit rules" },
  { id: "validating", title: "Validate & compare" },
] as const;

export function ExitOptimizerProgress({ progress, activity, startedAt }: {
  progress: OptimizerProgress | null; activity: OptimizerProgress[]; startedAt: number;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [startedAt]);
  const current = Math.max(0, STAGES.findIndex(stage => stage.id === progress?.stage));
  const measurable = Boolean(progress?.total && progress.completed !== undefined);
  const percent = measurable ? Math.floor(100 * progress!.completed! / progress!.total!) : null;
  return <div className={styles.runProgress} data-testid="optimizer-progress">
    <div className={styles.runHeading}><div><p className={styles.eyebrow}>Live analysis</p><h3 className={styles.sectionTitle}>Testing your exits</h3></div><span className={styles.runTime}>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span></div>
    <ol className={styles.runStages}>
      {STAGES.map((stage, index) => <li key={stage.id} data-state={index < current ? "done" : index === current ? "active" : "waiting"} aria-current={index === current ? "step" : undefined}>
        <span>{index < current ? <Check size={14} /> : index === current ? <LoaderCircle size={14} className="animate-spin" /> : String(index + 1).padStart(2, "0")}</span>{stage.title}
      </li>)}
    </ol>
    <div className={styles.runCurrent}>
      <div className={styles.runStatus} aria-live="polite" aria-atomic="true"><span>{progress?.message ?? "Preparing analysis"}</span>{percent !== null && <strong>{percent}%</strong>}</div>
      <div className={styles.runTrack} role="progressbar" aria-label={STAGES[current]!.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={percent === null ? "In progress" : `${percent}% of this stage`}>
        <span className={percent === null ? styles.indeterminate : undefined} style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
      <div className={styles.runMeta}>
        <span>{measurable ? `${progress!.completed!.toLocaleString()} / ${progress!.total!.toLocaleString()} ${progress!.stage === "loading" ? "markets processed" : "rule / trade tests"}` : "Waiting for the server to finish this stage"}</span>
        {progress?.symbol && <span>{progress.symbol}{progress.tradeNumber ? ` · Trade #${progress.tradeNumber}` : ""}</span>}
      </div>
    </div>
    {activity.length > 0 && <div className={styles.runActivity}><p className={styles.eyebrow}>Recent activity</p><ul>{activity.map((item, index) => <li key={`${index}-${item.message}`}><span />{item.message}{item.stage === "replaying" && <small>{item.symbol} · #{item.tradeNumber}</small>}</li>)}</ul></div>}
    <p className={styles.note}>Progress reflects completed server work. Larger sessions can take longer.</p>
  </div>;
}
