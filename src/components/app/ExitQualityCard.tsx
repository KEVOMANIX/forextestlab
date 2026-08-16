"use client";

import { Scissors, TrendingUp } from "lucide-react";

import {
  summariseExcursions,
  type PlanSummary,
} from "@/lib/backtest/exit-quality";
import type { ClosedTrade } from "@/lib/backtest/types";

const r = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}R`;

/**
 * What the trades reached versus what was taken from them.
 *
 * The two halves answer different questions and only make sense together. The
 * first is about the trades you were in — how much of the movement you banked.
 * The second is about the ones you cut by hand — whether leaving them alone
 * would have paid more. Showing only the "you cut too early" side would teach
 * traders to hold losers, so the times cutting saved money are given the same
 * prominence and the net is stated plainly.
 */
export function ExitQualityCard({
  trades,
  plan,
  planUnavailable,
}: {
  trades: ClosedTrade[];
  plan: PlanSummary | null;
  /**
   * Why the second half is missing, when it is. Without this the card simply
   * stops after the first four figures and reads as though the feature is
   * broken rather than waiting on something.
   */
  planUnavailable?: string;
}) {
  const excursion = summariseExcursions(trades);
  if (!excursion.tested && !plan) return null;

  return (
    <section className="mt-4 overflow-hidden rounded-2xl bg-[var(--app-panel)]">
      <div className="border-b app-border p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-300">
          Exit quality
        </p>
        <h2 className="mt-1 text-xl font-semibold">What you left on the table</h2>
        <p className="mt-1 text-xs leading-5 app-muted">
          How much of each trade&apos;s favourable movement you banked, and what
          the trades you closed by hand would have done if the original stop and
          target had been left alone.
        </p>
      </div>

      {excursion.tested > 0 && (
        <div className="grid gap-px bg-[var(--app-border)] sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Capture rate"
            value={
              excursion.captureRate === null
                ? "—"
                : `${Math.round(excursion.captureRate * 100)}%`
            }
            detail="Of the open profit that appeared, this much was banked"
          />
          <Stat
            label="Average give-back"
            value={
              excursion.averageGiveBackR === null
                ? "—"
                : `${excursion.averageGiveBackR.toFixed(2)}R`
            }
            detail="Between each trade's peak and where it was closed"
          />
          <Stat
            label="Gave back over 1R"
            value={`${excursion.gaveBackOverOneR} / ${excursion.tested}`}
            detail="Trades that handed back a full unit of risk"
          />
          <Stat
            label="Heat on winners"
            value={
              excursion.averageWinnerTroughR === null
                ? "—"
                : `${excursion.averageWinnerTroughR.toFixed(2)}R`
            }
            detail="How far winners went against you before they worked"
          />
        </div>
      )}

      {!plan && planUnavailable && (
        <p className="border-t app-border px-5 py-4 text-xs leading-5 app-muted">
          <strong className="font-semibold text-[var(--app-text)]">
            If you had left the plan alone:
          </strong>{" "}
          {planUnavailable}
        </p>
      )}

      {plan && (
        <div className="border-t app-border p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] app-muted">
                If you had left the plan alone
              </p>
              <p
                className={`mt-2 font-mono text-2xl font-semibold ${plan.netDeltaR > 0 ? "text-bear" : plan.netDeltaR < 0 ? "text-brand-300" : ""}`}
              >
                {r(plan.netDeltaR)}
              </p>
              <p className="mt-1 max-w-lg text-xs leading-5 app-muted">
                {plan.netDeltaR > 0
                  ? `Across ${plan.tested} hand-closed trade${plan.tested === 1 ? "" : "s"}, holding to the original stop or target would have produced ${r(plan.netDeltaR)} more.`
                  : plan.netDeltaR < 0
                    ? `Across ${plan.tested} hand-closed trade${plan.tested === 1 ? "" : "s"}, closing by hand was worth ${r(-plan.netDeltaR)} more than the original plan.`
                    : `Across ${plan.tested} hand-closed trade${plan.tested === 1 ? "" : "s"}, closing by hand came out level with the original plan.`}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
              <Split
                icon={<Scissors size={13} aria-hidden />}
                label="Cut too early"
                value={plan.cutEarly}
                tone="text-bear"
              />
              <Split
                icon={<TrendingUp size={13} aria-hidden />}
                label="Cut well"
                value={plan.cutWell}
                tone="text-brand-300"
              />
              <Split label="Would have hit target" value={plan.reachedTarget} />
              <Split label="Would have stopped out" value={plan.stoppedOut} />
            </dl>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">
                What a fixed target would have produced on the hand-closed trades
              </caption>
              <thead>
                <tr className="border-b app-border app-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Fixed target
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Reached it
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Net
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    vs what you took
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {plan.ladder.map((rung) => {
                  const versus = rung.netR - plan.capturedR;
                  return (
                    <tr key={rung.target} className="border-b app-border/60 last:border-0">
                      <td className="py-2 pr-4">{rung.target.toFixed(1)}R</td>
                      <td className="py-2 pr-4 app-muted">
                        {rung.hit} of {plan.tested}
                      </td>
                      <td className="py-2 pr-4 text-right">{r(rung.netR)}</td>
                      <td
                        className={`py-2 text-right ${versus > 0 ? "text-brand-300" : versus < 0 ? "text-bear" : "app-muted"}`}
                      >
                        {r(versus)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] leading-5 app-muted">
            A fixed target chosen after the fact is fitted to this sample.
            {plan.tested < 30
              ? ` With ${plan.tested} trade${plan.tested === 1 ? "" : "s"} behind it, treat the table as a question to test, not an answer.`
              : " Test it forward on a fresh period before trusting it."}
          </p>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-[var(--app-panel)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] app-muted">
        {label}
      </p>
      <p className="mt-2 font-mono text-xl font-semibold">{value}</p>
      <p className="mt-1 text-[11px] leading-4 app-muted">{detail}</p>
    </div>
  );
}

function Split({
  icon,
  label,
  value,
  tone = "",
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 app-muted">
        {icon}
        {label}
      </dt>
      <dd className={`mt-1 font-mono text-base font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}
