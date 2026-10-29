import Link from "next/link";
import { BarChart3, Check, Lock, Play, Plus, RotateCcw, Trophy } from "lucide-react";

import {
  BREACH_SHORT_LABELS,
  challengeStartHref,
  formatSignedPercent,
  formatUsd,
  nextChallengeStep,
  zoneCity,
  type ChallengeCard,
  type ChallengeNextStep,
  type ChallengeResult,
  type ChallengeSummary,
} from "@/lib/backtest/challenge-record";
import type { ChallengeAttempt, ChallengeDay, ChallengesOverview } from "@/lib/backtest/challenge-queries";
import type { PropFirmBreachRule } from "@/lib/backtest/prop-firm";
import { ProLock, ProPeek } from "./ProLock";

const RING_RADIUS = 62;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const PRIMARY = "inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-bold text-surface-950 transition-colors hover:bg-brand-400";
const SECONDARY = "inline-flex min-h-11 items-center gap-2 rounded-xl border app-border px-4 text-sm font-semibold transition-colors hover:border-brand-400/40 hover:text-brand-300";

function tone(value: number): string {
  return value > 0 ? "text-profit" : value < 0 ? "text-loss" : "app-muted";
}

/** Amber while there is room; red once most of a loss allowance is spent. */
function usedColour(ratio: number): string {
  return ratio >= 0.8 ? "rgb(var(--trade-loss-rgb))" : "rgb(var(--trade-exit-rgb))";
}

function breachLabel(breach: string | null): string {
  return BREACH_SHORT_LABELS[breach as PropFirmBreachRule] ?? "Rule broken";
}

function Gauge({ ratio, colour, value, caption, label, title, description }: {
  ratio: number;
  colour: string;
  value: string;
  caption: string;
  label: string;
  title: string;
  description: string;
}) {
  const filled = Math.max(0, Math.min(1, ratio)) * RING_LENGTH;
  return (
    <div className="flex flex-col items-center gap-2.5" title={title}>
      <div className="relative h-[148px] w-[148px]" role="img" aria-label={description}>
        <svg width="148" height="148" viewBox="0 0 148 148" aria-hidden>
          <circle cx="74" cy="74" r={RING_RADIUS} fill="none" strokeWidth="14" style={{ stroke: "var(--app-panel-2)" }} />
          {filled > 0 && <circle cx="74" cy="74" r={RING_RADIUS} fill="none" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${filled} ${RING_LENGTH}`} transform="rotate(-90 74 74)" style={{ stroke: colour }} />}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center text-center font-mono text-xl font-semibold text-[var(--app-text)]">
          {value}
          <span className="mt-0.5 font-sans text-xs font-medium app-muted">{caption}</span>
        </span>
      </div>
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}

function ActiveChallenge({ challenge }: { challenge: ChallengeCard }) {
  const dailyUsed = Number(challenge.dailyAllowance) * challenge.dailyUsedRatio;
  return (
    <section aria-label="Challenge in progress" className="rounded-2xl border border-brand-400/50 bg-[var(--app-panel)] p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <ResultBadge result="in-progress" label={`Phase ${challenge.phase}`} />
            <span className="app-muted">{challenge.accountLabel} · {challenge.dayLabel}</span>
          </div>
          <h2 className="mt-2.5 truncate text-xl font-semibold">{challenge.name}</h2>
          <p className="mt-1.5 text-sm"><span className="font-mono font-semibold">{formatUsd(challenge.equity)}</span><span className="app-muted"> · </span><span className={`font-mono font-semibold ${tone(challenge.profitPercent)}`}>{formatSignedPercent(challenge.profitPercent)}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/backtest?session=${encodeURIComponent(challenge.id)}`} className={PRIMARY}><Play size={14} fill="currentColor" aria-hidden />Continue</Link>
          <Link href={`/app/analytics?session=${encodeURIComponent(challenge.id)}`} className={SECONDARY}><BarChart3 size={15} aria-hidden />Analytics</Link>
        </div>
      </div>
      <div className="mt-6 grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <Gauge
          ratio={challenge.targetProgress}
          colour="var(--app-accent)"
          value={`${(challenge.targetProgress * 100).toFixed(1)}%`}
          caption="of target"
          label="Profit target"
          title={`Target ${challenge.targetPercent}% · ${formatUsd(challenge.targetEquity)}. ${formatUsd(challenge.toTarget)} to go.`}
          description={`Profit target ${(challenge.targetProgress * 100).toFixed(1)}% reached`}
        />
        <Gauge
          ratio={challenge.dailyUsedRatio}
          colour={usedColour(challenge.dailyUsedRatio)}
          value={formatUsd(challenge.dailyRemaining)}
          caption="left today"
          label="Daily loss room"
          title={`Used ${formatUsd(dailyUsed)} of ${formatUsd(challenge.dailyAllowance)} today. Resets at midnight, ${zoneCity(challenge.resetZone)} time.`}
          description={`Daily loss limit ${Math.round(challenge.dailyUsedRatio * 100)}% used, ${formatUsd(challenge.dailyRemaining)} left`}
        />
        <Gauge
          ratio={challenge.totalUsedRatio}
          colour={usedColour(challenge.totalUsedRatio)}
          value={formatUsd(challenge.totalRemaining, { whole: true })}
          caption="above floor"
          label="Max loss room"
          title={`Floor ${formatUsd(challenge.totalFloor)}.`}
          description={`Maximum loss ${Math.round(challenge.totalUsedRatio * 100)}% used, ${formatUsd(challenge.totalRemaining)} above the floor`}
        />
      </div>
    </section>
  );
}

type StepState = "done" | "next" | "locked";

function PhaseStep({ state, number, label }: { state: StepState; number: string; label: string }) {
  const node = state === "done"
    ? "bg-profit/15 text-profit"
    : state === "next" ? "border-2 border-brand-400 text-brand-300" : "border app-border app-muted";
  return (
    <li className="flex flex-col items-center gap-1.5" aria-current={state === "next" ? "step" : undefined}>
      <span className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${node}`}>{state === "done" ? <Check size={16} strokeWidth={3} aria-label="Done" /> : number}</span>
      <span className={`text-xs font-semibold ${state === "locked" ? "app-muted" : ""}`}>{label}</span>
    </li>
  );
}

function PhaseSteps({ stage }: { stage: "phase-2" | "funded" }) {
  const funded = stage === "funded";
  const connector = (done: boolean) => <li aria-hidden className={`mb-5 h-0.5 w-10 rounded-full ${done ? "bg-profit" : "bg-[var(--app-border)]"}`} />;
  return (
    <ol aria-label="Challenge phases" className="flex items-center gap-2">
      <PhaseStep state="done" number="1" label="Challenge" />
      {connector(true)}
      <PhaseStep state={funded ? "done" : "next"} number="2" label="Verification" />
      {connector(funded)}
      <PhaseStep state={funded ? "done" : "locked"} number="★" label="Passed" />
    </ol>
  );
}

/** What to do when nothing is running: the next phase, or another try. */
function NextStep({ step }: { step: ChallengeNextStep<ChallengeAttempt> }) {
  const { attempt } = step;
  const review = <Link href={`/app/analytics?session=${encodeURIComponent(attempt.id)}`} className={SECONDARY}><BarChart3 size={15} aria-hidden />Review</Link>;
  const retry = step.kind === "retry";
  const badge = retry
    ? <ResultBadge result={attempt.result} label={attempt.result === "failed" ? `Failed · ${breachLabel(attempt.breach)}` : "Ended before the target"} />
    : <ResultBadge result="passed" label={step.kind === "phase-2" ? "Phase 1 passed" : "Both phases passed"} />;
  return (
    <section aria-label="Next step" className={`flex flex-wrap items-center justify-between gap-x-8 gap-y-5 rounded-2xl border bg-[var(--app-panel)] p-5 shadow-card sm:p-6 ${retry ? "app-border" : "border-brand-400/50"}`}>
      <div className="min-w-0">
        {badge}
        <h2 className="mt-2.5 truncate text-xl font-semibold">{attempt.name}</h2>
        <p className="mt-1 text-sm app-muted">
          {retry
            ? <>Phase {attempt.phase} · {attempt.accountLabel} · {attempt.tradingDays} trading day{attempt.tradingDays === 1 ? "" : "s"}</>
            : <><span className={`font-mono font-semibold ${tone(attempt.profitPercent)}`}>{formatSignedPercent(attempt.profitPercent)}</span> in {attempt.tradingDays} trading day{attempt.tradingDays === 1 ? "" : "s"}</>}
        </p>
      </div>
      {!retry && <PhaseSteps stage={step.kind} />}
      <div className="flex flex-wrap gap-2">
        {step.kind === "phase-2" && <Link href={challengeStartHref({ phase: 2, symbol: attempt.symbol, accountSize: attempt.accountSize })} className={PRIMARY}><Play size={14} fill="currentColor" aria-hidden />Start Phase 2</Link>}
        {retry && <Link href={challengeStartHref({ phase: attempt.phase, symbol: attempt.symbol, accountSize: attempt.accountSize })} className={PRIMARY}><RotateCcw size={15} aria-hidden />Try again</Link>}
        {review}
      </div>
    </section>
  );
}

function DailyLimitChart({ days, allowance }: { days: ChallengeDay[]; allowance: string }) {
  const limit = Number(allowance);
  const values = days.map((day) => Number(day.pnl));
  const upScale = Math.max(limit / 2, ...values.filter((value) => value > 0), 1);
  const downScale = limit > 0 ? limit : Math.max(1, ...values.filter((value) => value < 0).map(Math.abs));
  return (
    <div className="relative mt-5 flex gap-3" role="img" aria-label={`Closed P/L for the last ${days.length} trading days: ${days.map((day) => `${day.label} ${formatUsd(day.pnl, { signed: true })}`).join(", ")}.${limit > 0 ? ` The daily limit is ${formatUsd(-limit)}.` : ""}`}>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[100px] h-px bg-[var(--app-muted)]" />
      {limit > 0 && <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[219px] border-t-2 border-dashed border-loss" />}
      {days.map((day) => {
        const value = Number(day.pnl);
        const up = value > 0 ? Math.max(3, Math.round((value / upScale) * 100)) : 0;
        const down = value < 0 ? Math.max(3, Math.min(120, Math.round((-value / downScale) * 120))) : 0;
        return (
          <div key={day.key} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex h-[100px] w-full items-end justify-center">{up > 0 && <div className="w-3/5 max-w-14 rounded-t bg-profit" style={{ height: up }} />}</div>
            <div className="flex h-[120px] w-full items-start justify-center">{down > 0 && <div className="w-3/5 max-w-14 rounded-b bg-loss" style={{ height: down }} />}</div>
            <span className={`mt-2.5 text-xs ${day.today ? "font-bold text-[var(--app-text)]" : "app-muted"}`}>{day.label}</span>
            <span className={`mt-0.5 font-mono text-xs font-semibold ${tone(value)}`}>{formatUsd(day.pnl, { signed: true }).replace("$", "")}</span>
          </div>
        );
      })}
    </div>
  );
}

const RESULT_STYLES: Record<ChallengeResult, { label: string; className: string }> = {
  "in-progress": { label: "In progress", className: "border border-brand-400/60 text-brand-300" },
  passed: { label: "Passed", className: "bg-profit/15 text-profit" },
  failed: { label: "Failed", className: "bg-loss/15 text-loss" },
  ended: { label: "Ended", className: "border app-border app-muted" },
};

function ResultBadge({ result, label }: { result: ChallengeResult; label?: string }) {
  const style = RESULT_STYLES[result];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.className}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{label ?? style.label}</span>;
}

/** One compact row; figures with nothing to say yet are left out. */
function RecordStrip({ summary }: { summary: ChallengeSummary }) {
  const items: Array<{ label: string; value: string; title?: string }> = [
    { label: "Attempts", value: String(summary.attempts) },
    { label: "Passed", value: String(summary.passed) },
  ];
  if (summary.passRate !== null) items.push({ label: "Pass rate", value: `${Math.round(summary.passRate)}%` });
  if (summary.daysToPass[1] !== null) items.push({ label: "Phase 1 pass time", value: `${summary.daysToPass[1]} days`, title: "Average trading days to pass Phase 1" });
  if (summary.daysToPass[2] !== null) items.push({ label: "Phase 2 pass time", value: `${summary.daysToPass[2]} days`, title: "Average trading days to pass Phase 2" });
  if (summary.topFailure) items.push({ label: "Top failure", value: BREACH_SHORT_LABELS[summary.topFailure.rule], title: `${summary.topFailure.count} of ${summary.failed} failed attempts` });
  return (
    <dl aria-label="Your record" className="flex flex-wrap gap-x-10 gap-y-3 rounded-2xl border app-border bg-[var(--app-panel)] px-5 py-4 shadow-card">
      {items.map((item) => (
        <div key={item.label} title={item.title}>
          <dt className="text-xs font-semibold app-muted">{item.label}</dt>
          <dd className="mt-1 font-mono text-lg font-semibold text-[var(--app-text)]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * `locked`: the account is on Free. Past attempts stay listed and reviewable;
 * starting or continuing a challenge is Pro (the server refuses it too).
 */
/** What a running challenge looks like, shown blurred behind the Pro card. */
function SampleChallenge() {
  const meters = [
    { label: "Profit target", value: "+$6,240 of $10,000", percent: 62, tone: "bg-profit" },
    { label: "Daily loss limit", value: "$1,180 of $5,000 used", percent: 24, tone: "bg-loss" },
    { label: "Maximum loss", value: "$2,050 of $10,000 used", percent: 21, tone: "bg-loss" },
  ];
  return (
    <section className="rounded-2xl border app-border bg-[var(--app-panel)] p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-400/10 text-brand-300"><Trophy size={20} /></span>
        <div><p className="font-semibold">Phase 1 · $100,000 account</p><p className="text-xs app-muted">Day 9 · EURUSD</p></div>
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        {meters.map((meter) => (
          <div key={meter.label}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] app-muted">{meter.label}</p>
            <p className="mt-1 text-sm font-semibold">{meter.value}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className={`h-full rounded-full ${meter.tone}`} style={{ width: `${meter.percent}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex h-28 items-end gap-1.5">
        {[30, 55, -20, 70, 40, -35, 85, 60, 45].map((value, index) => (
          <div key={index} className={`flex-1 rounded-t ${value >= 0 ? "bg-profit/60" : "bg-loss/60"}`} style={{ height: `${Math.abs(value)}%` }} />
        ))}
      </div>
    </section>
  );
}

export function ChallengesView({ overview, locked = false }: { overview: ChallengesOverview; locked?: boolean }) {
  const { active, days, attempts, summary } = overview;
  const next = active || locked ? null : nextChallengeStep(attempts);
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Prop firm</p>
          <h1 className="mt-1.5 flex items-center gap-3 text-3xl font-bold tracking-tight">Challenges</h1>
        </div>
        {locked
          ? <ProLock feature="challenge" className="inline-flex min-h-11 items-center gap-2 rounded-xl border app-border px-4 text-sm font-semibold transition-colors hover:bg-[var(--app-panel-2)]"><Lock size={15} aria-hidden />Start a challenge with Pro</ProLock>
          : <Link href={challengeStartHref()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-400/60 px-4 text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-400/10"><Plus size={16} aria-hidden />Start a challenge</Link>}
      </header>

      {locked && attempts.length > 0 && (
        <p className="mt-4 rounded-xl border app-border bg-[var(--app-panel)] px-4 py-3 text-sm leading-6 app-muted">
          Prop Firm Challenge mode is part of Pro. Your attempts and their results stay here to review; upgrade or start a Pro trial to carry on or start a new one.
        </p>
      )}

      {attempts.length === 0 && locked ? (
        <ProPeek feature="challenge" title="Challenge mode is part of Pro" text="Trade a funded-account evaluation under real rules, scored day by day. Choose a monthly or yearly Pro plan to unlock challenges." className="mt-6 rounded-2xl">
          <SampleChallenge />
        </ProPeek>
      ) : attempts.length === 0 ? (
        <section className="mt-6 rounded-2xl border border-brand-400/25 bg-brand-400/[0.06] p-6 shadow-card sm:p-8">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-brand-400/25 bg-brand-400/10 text-brand-300"><Trophy size={20} aria-hidden /></span>
          <h2 className="mt-5 flex items-center gap-3 text-2xl font-bold tracking-tight">No challenges yet</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 app-muted">Trade under prop-firm rules: a profit target, a daily loss limit and a maximum loss. Challenges stay out of your backtest results.</p>
          <Link href={challengeStartHref()} className="btn-primary mt-6">Start a challenge <Play size={14} fill="currentColor" aria-hidden /></Link>
        </section>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {active && <ActiveChallenge challenge={active} />}
          {next && <NextStep step={next} />}

          {active && days.length > 0 && (
            <section aria-labelledby="daily-heading" className="rounded-2xl border app-border bg-[var(--app-panel)] p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="daily-heading" className="font-semibold">Daily P/L</h2>
                {Number(active.dailyAllowance) > 0 && <span className="inline-flex items-center gap-2 text-xs font-semibold text-loss" title={`The most you can lose in one day. Resets at midnight, ${zoneCity(active.resetZone)} time.`}><span className="w-5 border-t-2 border-dashed border-loss" aria-hidden />Limit {formatUsd(-Number(active.dailyAllowance))}</span>}
              </div>
              <DailyLimitChart days={days} allowance={active.dailyAllowance} />
            </section>
          )}

          <RecordStrip summary={summary} />

          <section aria-labelledby="attempts-heading">
            <h2 id="attempts-heading" className="text-xl font-semibold">All attempts</h2>
            <div className="mt-3 overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)] shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[46rem] border-collapse text-sm">
                  <thead>
                    <tr className="bg-[var(--app-bg)]/30 text-left text-[11px] font-semibold uppercase tracking-[0.13em] app-muted">
                      <th scope="col" className="border-b app-border px-5 py-3">Challenge</th>
                      <th scope="col" className="border-b app-border px-5 py-3">Phase</th>
                      <th scope="col" className="border-b app-border px-5 py-3 text-right">Account</th>
                      <th scope="col" className="border-b app-border px-5 py-3">Result</th>
                      <th scope="col" className="border-b app-border px-5 py-3">Outcome</th>
                      <th scope="col" className="border-b app-border px-5 py-3 text-right">Trading days</th>
                      <th scope="col" className="border-b app-border px-5 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y app-border">
                    {attempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td className="px-5 py-3.5"><span className="block font-semibold">{attempt.name}</span><span className="mt-0.5 block text-xs app-muted">{attempt.dateRange}</span></td>
                        <td className="px-5 py-3.5">{attempt.phase} · {attempt.phase === 1 ? "Challenge" : "Verification"}</td>
                        <td className="px-5 py-3.5 text-right font-mono">{attempt.accountLabel}</td>
                        <td className="px-5 py-3.5"><ResultBadge result={attempt.result} /></td>
                        <td className="px-5 py-3.5">{attempt.result === "failed"
                          ? breachLabel(attempt.breach)
                          : <><span className={`font-mono font-semibold ${tone(attempt.profitPercent)}`}>{formatSignedPercent(attempt.profitPercent)}</span><span className="font-mono app-muted"> / {attempt.targetPercent}%</span></>}</td>
                        <td className="px-5 py-3.5 text-right font-mono">{attempt.tradingDays}</td>
                        <td className="px-5 py-3.5 text-right">
                          {attempt.result === "in-progress"
                            ? <Link href={`/app/backtest?session=${encodeURIComponent(attempt.id)}`} className="inline-flex min-h-9 items-center rounded-lg border border-brand-400/60 px-3 text-xs font-semibold text-brand-300 transition-colors hover:bg-brand-400/10">Continue</Link>
                            : <Link href={`/app/analytics?session=${encodeURIComponent(attempt.id)}`} className="inline-flex min-h-9 items-center rounded-lg border app-border px-3 text-xs font-semibold transition-colors hover:border-brand-400/40 hover:text-brand-300">Review</Link>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
