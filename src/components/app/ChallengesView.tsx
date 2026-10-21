import Link from "next/link";
import { BarChart3, Play, Plus, Trophy } from "lucide-react";

import {
  BREACH_SHORT_LABELS,
  formatSignedPercent,
  formatUsd,
  zoneCity,
  type ChallengeCard,
  type ChallengeResult,
} from "@/lib/backtest/challenge-record";
import type { ChallengeDay, ChallengesOverview } from "@/lib/backtest/challenge-queries";
import type { PropFirmBreachRule } from "@/lib/backtest/prop-firm";

const START_CHALLENGE_HREF = "/app/backtest?mode=challenge";
const RING_RADIUS = 62;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function tone(value: number): string {
  return value > 0 ? "text-profit" : value < 0 ? "text-loss" : "app-muted";
}

/** Amber while there is room; red once most of a loss allowance is spent. */
function usedColour(ratio: number): string {
  return ratio >= 0.8 ? "rgb(var(--trade-loss-rgb))" : "rgb(var(--trade-exit-rgb))";
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
          <Link href={`/app/backtest?session=${encodeURIComponent(challenge.id)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-bold text-surface-950 transition-colors hover:bg-brand-400"><Play size={14} fill="currentColor" aria-hidden />Continue</Link>
          <Link href={`/app/analytics?session=${encodeURIComponent(challenge.id)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border app-border px-4 text-sm font-semibold transition-colors hover:border-brand-400/40 hover:text-brand-300"><BarChart3 size={15} aria-hidden />Analytics</Link>
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

function SummaryTile({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <article className="rounded-2xl border app-border bg-[var(--app-panel)] p-4 shadow-card" title={title}>
      <p className="text-xs font-semibold app-muted">{label}</p>
      <p className="mt-2.5 font-mono text-2xl font-semibold leading-none text-[var(--app-text)]">{value}</p>
    </article>
  );
}

function StartButton() {
  return <Link href={START_CHALLENGE_HREF} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-400/60 px-4 text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-400/10"><Plus size={16} aria-hidden />Start a challenge</Link>;
}

export function ChallengesView({ overview }: { overview: ChallengesOverview }) {
  const { active, days, attempts, summary } = overview;
  const daysToPass = `${summary.daysToPass[1] ?? "—"} / ${summary.daysToPass[2] ?? "—"}`;
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Prop firm</p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight">Challenges</h1>
        </div>
        <StartButton />
      </header>

      {attempts.length === 0 ? (
        <section className="mt-6 rounded-2xl border border-brand-400/25 bg-brand-400/[0.06] p-6 shadow-card sm:p-8">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-brand-400/25 bg-brand-400/10 text-brand-300"><Trophy size={20} aria-hidden /></span>
          <h2 className="mt-5 text-2xl font-bold tracking-tight">No challenges yet</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 app-muted">Practise under prop-firm rules: a profit target, a daily loss limit and a maximum loss. Challenges stay out of your practice numbers.</p>
          <Link href={START_CHALLENGE_HREF} className="btn-primary mt-6">Start a challenge <Play size={14} fill="currentColor" aria-hidden /></Link>
        </section>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {active ? <ActiveChallenge challenge={active} /> : (
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border app-border bg-[var(--app-panel)] p-5 shadow-card">
              <p className="font-semibold">No challenge running</p>
              <StartButton />
            </section>
          )}

          <div className="flex flex-wrap gap-4">
            {active && days.length > 0 && (
              <section aria-labelledby="daily-heading" className="min-w-0 flex-[1.6_1_32rem] rounded-2xl border app-border bg-[var(--app-panel)] p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="daily-heading" className="font-semibold">Daily P/L</h2>
                  {Number(active.dailyAllowance) > 0 && <span className="inline-flex items-center gap-2 text-xs font-semibold text-loss" title={`The most you can lose in one day. Resets at midnight, ${zoneCity(active.resetZone)} time.`}><span className="w-5 border-t-2 border-dashed border-loss" aria-hidden />Limit {formatUsd(-Number(active.dailyAllowance))}</span>}
                </div>
                <DailyLimitChart days={days} allowance={active.dailyAllowance} />
              </section>
            )}
            <section aria-label="Your record" className="grid min-w-0 flex-[1_1_18rem] grid-cols-2 gap-3 self-start">
              <SummaryTile label="Attempts" value={String(summary.attempts)} />
              <SummaryTile label="Pass rate" value={summary.passRate === null ? "—" : `${Math.round(summary.passRate)}%`} />
              <SummaryTile label="Days to pass" value={daysToPass} title="Average trading days to pass Phase 1 / Phase 2" />
              <SummaryTile label="Top failure" value={summary.topFailure ? BREACH_SHORT_LABELS[summary.topFailure.rule] : "None"} title={summary.topFailure ? `${summary.topFailure.count} of ${summary.failed} failed attempts` : undefined} />
            </section>
          </div>

          <section aria-labelledby="attempts-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="attempts-heading" className="text-xl font-semibold">All attempts</h2>
              <p className="text-sm app-muted">{summary.attempts} attempt{summary.attempts === 1 ? "" : "s"} · {summary.passed} passed</p>
            </div>
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
                      <th scope="col" className="border-b app-border px-5 py-3 text-right">Days</th>
                      <th scope="col" className="border-b app-border px-5 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y app-border">
                    {attempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td className="px-5 py-3.5 font-semibold">{attempt.name}</td>
                        <td className="px-5 py-3.5">{attempt.phase}</td>
                        <td className="px-5 py-3.5 text-right font-mono">{attempt.accountLabel}</td>
                        <td className="px-5 py-3.5"><ResultBadge result={attempt.result} /></td>
                        <td className="px-5 py-3.5">{attempt.result === "failed"
                          ? BREACH_SHORT_LABELS[attempt.breach as PropFirmBreachRule] ?? "Rule broken"
                          : <span className={`font-mono font-semibold ${tone(attempt.profitPercent)}`}>{formatSignedPercent(attempt.profitPercent)}</span>}</td>
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
