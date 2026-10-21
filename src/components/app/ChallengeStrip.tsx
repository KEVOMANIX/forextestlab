import Link from "next/link";

import { formatUsd, type ChallengeCard } from "@/lib/backtest/challenge-record";

function usedTone(ratio: number): string {
  return ratio >= 0.8 ? "bg-loss" : "bg-exit";
}

function StripMetric({ label, value, ratio, fill, title }: { label: string; value: string; ratio: number; fill: string; title: string }) {
  return (
    <div className="min-w-[8.5rem]" title={title}>
      <dt className="text-xs font-semibold app-muted">{label}</dt>
      <dd className="mt-1 font-mono text-base font-semibold text-[var(--app-text)]">{value}</dd>
      <div className="mt-2 h-1.5 w-36 overflow-hidden rounded-full bg-[var(--app-panel-2)]"><div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.round(ratio * 1000) / 10}%` }} /></div>
    </div>
  );
}

/** The dashboard's one line on a running challenge; the detail lives on /app/challenges. */
export function ChallengeStrip({ challenge }: { challenge: ChallengeCard }) {
  return (
    <section aria-label="Prop firm challenge in progress" className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border border-brand-400/50 bg-[var(--app-panel)] px-5 py-4 shadow-card">
      <div className="min-w-[12rem]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-400/60 px-2.5 py-0.5 text-xs font-semibold text-brand-300"><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />Challenge · Phase {challenge.phase}</span>
        <p className="mt-2 truncate font-semibold">{challenge.name}</p>
        <p className="mt-0.5 text-xs app-muted">{challenge.accountLabel} account · {challenge.dayLabel}</p>
      </div>
      <dl className="flex flex-1 flex-wrap gap-x-8 gap-y-3">
        <StripMetric label="Profit target" value={`${(challenge.targetProgress * 100).toFixed(1)}%`} ratio={challenge.targetProgress} fill="bg-brand-500" title={`${formatUsd(challenge.toTarget)} to the ${challenge.targetPercent}% target`} />
        <StripMetric label="Daily loss room" value={formatUsd(challenge.dailyRemaining)} ratio={challenge.dailyUsedRatio} fill={usedTone(challenge.dailyUsedRatio)} title={`Of ${formatUsd(challenge.dailyAllowance)} today`} />
        <StripMetric label="Max loss room" value={formatUsd(challenge.totalRemaining)} ratio={challenge.totalUsedRatio} fill={usedTone(challenge.totalUsedRatio)} title={`Above the ${formatUsd(challenge.totalFloor)} floor`} />
      </dl>
      <Link href="/app/challenges" className="inline-flex min-h-10 items-center rounded-lg border border-brand-400/60 px-4 text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-400/10">Open challenge</Link>
    </section>
  );
}
