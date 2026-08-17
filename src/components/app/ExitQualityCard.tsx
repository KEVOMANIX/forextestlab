"use client";

import { summariseExcursions, type PlanSummary } from "@/lib/backtest/exit-quality";
import type { ClosedTrade } from "@/lib/backtest/types";

const money = (value: number) =>
  `${value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const rr = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}R`;

/**
 * What the trades reached, versus what was taken from them.
 *
 * Two decisions shape how this reads, both learned the hard way:
 *
 *  - Every R figure is answered in money underneath it. The rest of the report
 *    speaks dollars; a card that switches to units of risk without translating
 *    makes the reader do the conversion before they can feel the number.
 *  - The comparison shows both totals side by side rather than one signed
 *    difference. A lone "+1.63R" tinted red is genuinely ambiguous — plus reads
 *    as gain, red reads as loss, and it is neither: it is the gap between two
 *    outcomes. Printing both lets the reader see which is larger and removes
 *    the need for a colour to carry the meaning.
 *
 * The wording also refuses to pre-judge. Cutting a trade sometimes saves money,
 * and a card that only ever says you left something behind would teach traders
 * to hold losers.
 */
export function ExitQualityCard({
  trades,
  plan,
  planUnavailable,
}: {
  trades: ClosedTrade[];
  plan: PlanSummary | null;
  /**
   * Why the comparison is missing, when it is. Without this the card stops
   * after the first figures and reads as though it were broken.
   */
  planUnavailable?: string;
}) {
  const excursion = summariseExcursions(trades);
  if (!excursion.tested && !plan) return null;

  const planAhead = plan ? plan.planR - plan.capturedR : 0;

  return (
    <section className="mt-4 overflow-hidden rounded-2xl bg-[var(--app-panel)]">
      <div className="border-b app-border p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-300">
          Exit quality
        </p>
        <h2 className="mt-1 text-xl font-semibold">
          What your exits cost — or saved
        </h2>
      </div>

      {excursion.tested > 0 && (
        <div className="border-b app-border p-5">
          <p className="text-sm leading-6">
            You banked{" "}
            <strong className="font-mono font-semibold text-brand-300">
              {money(excursion.bankedMoney)}
            </strong>{" "}
            of the{" "}
            <strong className="font-mono font-semibold">
              {money(excursion.favourableMoney)}
            </strong>{" "}
            that appeared on screen while these trades were open
            {excursion.captureRate !== null && (
              <> — {Math.round(excursion.captureRate * 100)}% of it</>
            )}
            .
          </p>
          {excursion.widestGap && (
            <p className="mt-1.5 text-sm leading-6 app-muted">
              The widest gap was trade{" "}
              <span className="font-mono text-[var(--app-text)]">
                #{excursion.widestGap.tradeNumber}
              </span>
              : it reached{" "}
              <span className="font-mono text-[var(--app-text)]">
                {rr(excursion.widestGap.peakR)}
              </span>{" "}
              and was closed at{" "}
              <span className="font-mono text-[var(--app-text)]">
                {rr(excursion.widestGap.capturedR)}
              </span>
              .
            </p>
          )}
          <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3 text-xs">
            <Figure
              label="Typical give-back"
              value={
                excursion.averageGiveBackR === null
                  ? "—"
                  : `${excursion.averageGiveBackR.toFixed(2)}R`
              }
              detail="per trade, between its peak and its close"
            />
            <Figure
              label="Gave back over 1R"
              value={`${excursion.gaveBackOverOneR} of ${excursion.tested}`}
              detail="handed back a whole unit of risk"
            />
            {excursion.averageWinnerTroughR !== null && (
              <Figure
                label="Winners dipped to"
                value={`${excursion.averageWinnerTroughR.toFixed(2)}R`}
                detail={`before they worked — your stop sat at −1.00R`}
              />
            )}
          </dl>
        </div>
      )}

      {!plan && planUnavailable && (
        <p className="p-5 text-xs leading-5 app-muted">
          <strong className="font-semibold text-[var(--app-text)]">
            Leaving the plan alone:
          </strong>{" "}
          {planUnavailable}
        </p>
      )}

      {plan && (
        <div className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] app-muted">
            The {plan.tested} trade{plan.tested === 1 ? "" : "s"} you closed by
            hand
          </p>

          {/* Both totals, not one signed difference. */}
          <div className="mt-3 grid gap-px overflow-hidden rounded-xl border app-border bg-[var(--app-border)] sm:grid-cols-3">
            <Total
              label="What you took"
              r={plan.capturedR}
              value={plan.capturedMoney}
            />
            <Total
              label="What the original plan would have taken"
              r={plan.planR}
              value={plan.planMoney}
            />
            <div className="bg-[var(--app-panel)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] app-muted">
                Difference
              </p>
              <p
                className={`mt-2 text-sm font-semibold leading-5 ${planAhead > 0 ? "text-bear" : planAhead < 0 ? "text-brand-300" : ""}`}
              >
                {planAhead > 0
                  ? `The plan was ahead by ${rr(planAhead).replace("+", "")}`
                  : planAhead < 0
                    ? `Your exits were ahead by ${rr(-planAhead).replace("+", "")}`
                    : "Level"}
              </p>
              <p className="mt-1 font-mono text-[11px] app-muted">
                {money(Math.abs(plan.planMoney - plan.capturedMoney))}
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs leading-5 app-muted">
            Left alone, the plan would have hit its target on{" "}
            <strong className="font-semibold text-[var(--app-text)]">
              {plan.reachedTarget}
            </strong>
            , stopped out on{" "}
            <strong className="font-semibold text-[var(--app-text)]">
              {plan.stoppedOut}
            </strong>
            , and still been open at the end of the session on{" "}
            <strong className="font-semibold text-[var(--app-text)]">
              {plan.unresolved}
            </strong>
            . Cutting cost you money on{" "}
            <strong className="font-semibold text-bear">{plan.cutEarly}</strong>{" "}
            and saved you money on{" "}
            <strong className="font-semibold text-brand-300">
              {plan.cutWell}
            </strong>
            .
          </p>

          <h3 className="mt-6 text-sm font-semibold">
            What a fixed target would have done instead
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">
                Net result of using one fixed target on every hand-closed trade,
                keeping each trade&apos;s original stop
              </caption>
              <thead>
                <tr className="border-b app-border app-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Target
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Trades that got there
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Better or worse than your exits
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Net over {plan.tested}
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.ladder.map((rung) => {
                  const versus = rung.netR - plan.capturedR;
                  const versusMoney = rung.netMoney - plan.capturedMoney;
                  return (
                    <tr
                      key={rung.target}
                      className="border-b app-border/60 last:border-0"
                    >
                      <td className="py-2 pr-4 font-mono">
                        {rung.target.toFixed(1)}R
                      </td>
                      <td className="py-2 pr-4 app-muted">
                        <span className="font-mono">{rung.hit}</span> of{" "}
                        <span className="font-mono">{plan.tested}</span>
                      </td>
                      <td
                        className={`py-2 pr-4 text-right font-medium ${versus > 0 ? "text-brand-300" : versus < 0 ? "text-bear" : "app-muted"}`}
                      >
                        {versus === 0
                          ? "the same"
                          : `${money(Math.abs(versusMoney))} ${versus > 0 ? "better" : "worse"}`}
                      </td>
                      <td className="py-2 text-right font-mono app-muted">
                        {rr(rung.netR)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] leading-5 app-muted">
            These targets were chosen after seeing the result, so the table is
            fitted to this sample.
            {plan.tested < 30
              ? ` With ${plan.tested} trade${plan.tested === 1 ? "" : "s"} behind it, treat it as a question to test rather than an answer.`
              : " Test it forward on a fresh period before trusting it."}
          </p>
        </div>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div>
      <dt className="app-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-base font-semibold">{value}</dd>
      <dd className="mt-0.5 text-[11px] app-muted">{detail}</dd>
    </div>
  );
}

function Total({
  label,
  r,
  value,
}: {
  label: string;
  r: number;
  value: number;
}) {
  return (
    <div className="bg-[var(--app-panel)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] app-muted">
        {label}
      </p>
      <p className="mt-2 font-mono text-xl font-semibold">{rr(r)}</p>
      <p className="mt-1 font-mono text-[11px] app-muted">{money(value)}</p>
    </div>
  );
}
