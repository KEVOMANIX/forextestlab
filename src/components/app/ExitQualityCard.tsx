"use client";

import { MetricInfo } from "@/components/app/MetricInfo";
import { useTradeFocus } from "@/components/app/TradeFocusContext";
import { summariseExcursions, tradeExcursion, winnersTurnedLosses, type PlanSummary } from "@/lib/backtest/exit-quality";
import type { ExitOptimizerReport, OptimizerMetrics } from "@/lib/backtest/exit-optimizer";
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
  const tradeFocus = useTradeFocus();
  const excursion = summariseExcursions(trades);
  if (!excursion.tested && !plan) return null;

  const planAhead = plan ? plan.planR - plan.capturedR : 0;
  const givenBackMoney = Math.max(0, excursion.favourableMoney - excursion.bankedMoney);
  const capturePercent = excursion.captureRate === null ? 0 : Math.round(excursion.captureRate * 100);
  const givenBackPercent = Math.max(0, 100 - capturePercent);
  const excursionRows = trades.map(tradeExcursion).filter((row) => row.giveBackR !== null);
  const keptMost = excursionRows.filter((row) => (row.giveBackR ?? 0) <= 0.25).length;
  const gaveBackUnderOne = excursionRows.filter((row) => (row.giveBackR ?? 0) > 0.25 && (row.giveBackR ?? 0) <= 1).length;
  const turnedLosses = winnersTurnedLosses(trades);

  return (
    <section className="mt-4 overflow-hidden rounded-2xl bg-[var(--app-panel)]">
      <div className="border-b app-border p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-300">
          Exit quality
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold">
          What your exits cost — or saved
          <MetricInfo
            term="Exit quality"
            detail="Every trade is measured twice: what it reached while it was open, and what you kept. Where a trade was closed by hand, the original stop and target are then replayed against the real candles to see what leaving it alone would have done. Nothing here uses data the replay had not already shown you."
          />
        </h2>
      </div>

      {excursion.tested > 0 && (
        <div className="border-b app-border p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryFigure label="Available at peak" value={money(excursion.favourableMoney)} detail="All favourable movement recorded while these trades were open." />
            <SummaryFigure label="Given back" value={money(givenBackMoney)} tone="text-loss" detail="Favourable movement that was no longer present when the trades closed." />
            <SummaryFigure label="Banked" value={money(excursion.bankedMoney)} tone="text-profit" detail="Positive realised profit retained from the favourable movement." />
          </div>
          <div className="mt-4 overflow-hidden rounded-full bg-white/[0.06]" aria-label={`${capturePercent}% of available profit captured`}><div className="flex h-3"><span className="bg-loss/75" style={{ width: `${givenBackPercent}%` }} /><span className="bg-profit" style={{ width: `${capturePercent}%` }} /></div></div>
          <div className="mt-2 flex justify-between text-[10px] app-muted"><span>{givenBackPercent}% given back</span><span className="font-semibold text-profit">{capturePercent}% captured</span></div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-300">Give-back distribution</p>
              <div className="mt-3 space-y-3">
                {[
                  { label: "Kept most", count: keptMost, tone: "bg-profit/75" },
                  { label: "Gave back 0.25–1R", count: gaveBackUnderOne, tone: "bg-amber-300/65" },
                  { label: "Gave back over 1R", count: excursion.gaveBackOverOneR, tone: "bg-loss/75" },
                ].map((row) => <div key={row.label} className="grid grid-cols-[130px_minmax(0,1fr)_64px] items-center gap-3 text-xs"><span className="app-muted">{row.label}</span><div className="h-2 overflow-hidden rounded-full bg-white/[0.05]"><div className={`h-full rounded-full ${row.tone}`} style={{ width: `${Math.max(row.count ? 6 : 0, row.count / excursion.tested * 100)}%` }} /></div><span className="text-right font-mono font-semibold">{row.count} of {excursion.tested}</span></div>)}
              </div>
            </div>
            {excursion.widestGap && <div className="rounded-xl border app-border bg-white/[0.02] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-loss">Worst leak</p><p className="mt-2 text-sm leading-6">Trade <strong className="font-mono">#{excursion.widestGap.tradeNumber}</strong> reached <strong className="font-mono text-profit">{rr(excursion.widestGap.peakR)}</strong> and closed at <strong className="font-mono text-loss">{rr(excursion.widestGap.capturedR)}</strong>.</p></div>}
          </div>

          <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3 border-t app-border pt-4 text-xs">
            <Figure
              label="Typical give-back"
              value={
                excursion.averageGiveBackR === null
                  ? "—"
                  : `${excursion.averageGiveBackR.toFixed(2)}R`
              }
              detail="Measured per trade, between its best unrealised point and where it was actually closed."
            />
            <Figure
              label="Gave back over 1R"
              value={`${excursion.gaveBackOverOneR} of ${excursion.tested}`}
              detail="These handed back a whole unit of risk — the trades where a different exit rule would have changed the result most."
            />
            {excursion.averageWinnerTroughR !== null && (
              <Figure
                label="Winners dipped to"
                value={`${excursion.averageWinnerTroughR.toFixed(2)}R`}
                detail="How far the eventual winners went against you before they worked. Your stop sat at −1.00R, so the closer this is to −1.00R, the nearer those winners came to being stopped out."
              />
            )}
          </dl>

          <div className="mt-5 border-t app-border pt-4">
            <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-loss">Winners turned into losses</p><h3 className="mt-1 text-sm font-semibold">Reached at least +1R, then closed below 0R</h3></div><span className="font-mono text-[10px] app-muted">{turnedLosses.length} trade{turnedLosses.length === 1 ? "" : "s"}</span></div>
            {turnedLosses.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead><tr className="border-b app-border app-muted"><th className="py-2 font-medium">Trade</th><th className="py-2 text-right font-medium">Peak reached</th><th className="py-2 text-right font-medium">Final result</th><th className="py-2 text-right font-medium">Given back</th></tr></thead><tbody>{turnedLosses.slice(0, 8).map((row) => <tr key={row.tradeNumber} className="border-b app-border/60 last:border-0"><td className="py-2.5">{tradeFocus ? <button type="button" onClick={() => tradeFocus.focusTrade(row.tradeNumber)} className="font-mono font-semibold text-brand-300 hover:underline">#{row.tradeNumber}</button> : <span className="font-mono font-semibold">#{row.tradeNumber}</span>}</td><td className="py-2.5 text-right font-mono font-semibold text-profit">{rr(row.peakR)}</td><td className="py-2.5 text-right font-mono font-semibold text-loss">{rr(row.capturedR)}</td><td className="py-2.5 text-right font-mono app-muted">{row.giveBackR.toFixed(2)}R</td></tr>)}</tbody></table></div> : <p className="mt-3 rounded-xl border border-dashed app-border px-4 py-5 text-center text-xs app-muted">No trade reached +1R and later closed at a loss.</p>}
          </div>
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
              info="The real result of these trades, added up in units of risk and in money."
              r={plan.capturedR}
              value={plan.capturedMoney}
            />
            <Total
              label="What the original plan would have taken"
              info="The same trades with the stop and target they were opened with, left to resolve against the real candles. A trade still unresolved at the end of the session is counted at its closing price, not at its target."
              r={plan.planR}
              value={plan.planMoney}
            />
            <div className="bg-[var(--app-panel)] p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] app-muted">
                Difference
                <MetricInfo
                  term="Difference"
                  detail="The gap between the two totals beside it. It is not a profit or a loss — it is what your discretion was worth over these trades, positive or negative."
                />
              </p>
              <p
                className={`mt-2 text-sm font-semibold leading-5 ${planAhead > 0 ? "text-loss" : planAhead < 0 ? "text-profit" : ""}`}
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
            <strong className="font-semibold text-loss">{plan.cutEarly}</strong>{" "}
            and saved you money on{" "}
            <strong className="font-semibold text-brand-300">
              {plan.cutWell}
            </strong>
            .
          </p>

          <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold">
            What a fixed target would have done instead
            <MetricInfo
              term="Fixed target test"
              detail={`Each row replays every hand-closed trade with one fixed target and its own original stop, and compares the total with what you actually took. These targets were chosen after seeing the result, so the table is fitted to this sample. ${
                plan.tested < 30
                  ? `With ${plan.tested} trade${plan.tested === 1 ? "" : "s"} behind it, treat it as a question to test rather than an answer.`
                  : "Test it forward on a fresh period before trusting it."
              }`}
            />
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
                        className={`py-2 pr-4 text-right font-medium ${versus > 0 ? "text-profit" : versus < 0 ? "text-loss" : "app-muted"}`}
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

        </div>
      )}
    </section>
  );
}

function metric(value: number, suffix = "R") {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}${suffix}`;
}

function pf(metrics: OptimizerMetrics) {
  return metrics.profitFactor === null ? (metrics.netR > 0 ? "∞" : "—") : metrics.profitFactor.toFixed(2);
}

export function ExitOptimizerPanel({ report }: { report: ExitOptimizerReport }) {
  const tradeFocus = useTradeFocus();
  const best = report.rules.find((row) => row.rule.id === report.bestRuleId) ?? null;
  const evidenceLabel = { insufficient: "Insufficient sample", experimental: "Experimental", developing: "Developing evidence", stronger: "Stronger evidence" }[report.evidence];
  const strongestImpacts = best?.trades.slice().sort((a, b) => Math.abs(b.deltaR) - Math.abs(a.deltaR)).slice(0, 5) ?? [];

  return <div className="border-b app-border p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-300">Exit optimizer · Phase 1</p><h3 className="mt-1 text-lg font-semibold">Test exit rules without changing the entries</h3><p className="mt-1 max-w-3xl text-xs leading-5 app-muted">The first 70% of eligible trades discovers candidates. The final 30% validates them chronologically on later trades.</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${report.evidence === "insufficient" ? "bg-amber-300/10 text-amber-200" : "bg-brand-400/10 text-brand-300"}`}>{evidenceLabel} · {report.eligibleTrades} trades</span></div>

    {best ? <div className="mt-5 rounded-xl border border-brand-400/25 bg-brand-400/[0.06] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-brand-300">Best validated rule</p><p className="mt-1 text-base font-semibold">{best.rule.label}</p><p className={`mt-1 font-mono text-[10px] ${best.all.netR >= report.actual.netR ? "text-profit" : "text-loss"}`}>{metric(best.all.netR - report.actual.netR)} versus actual exits across all eligible trades</p></div><div className="rounded-full bg-brand-400/10 px-3 py-1 text-[9px] font-semibold text-brand-300">Validated on {best.validation.trades} later trades · {metric(best.validation.netR)}</div></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"><ResultMetric label="All-trades net" value={metric(best.all.netR)} tone={best.all.netR >= 0 ? "text-profit" : "text-loss"} /><ResultMetric label="All-trades win rate" value={`${best.all.winRate.toFixed(1)}%`} /><ResultMetric label="All-trades PF" value={pf(best.all)} /><ResultMetric label="Average trade" value={metric(best.all.averageR)} tone={best.all.averageR >= 0 ? "text-profit" : "text-loss"} /><ResultMetric label="Max drawdown" value={metric(-best.all.maxDrawdownR)} tone="text-loss" /><ResultMetric label="Eligible trades" value={String(best.all.trades)} /></div></div> : <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4 text-xs leading-5 text-amber-100">No candidate produced a positive validated result with enough later trades. The optimizer is reporting the tests, but it is not recommending a rule.</div>}

    <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead><tr className="border-b app-border app-muted"><th className="py-2 pr-4 font-medium">Rule</th><th className="py-2 pr-4 text-right font-medium">All trades R</th><th className="py-2 pr-4 text-right font-medium">Validation R</th><th className="py-2 pr-4 text-right font-medium">All win rate</th><th className="py-2 pr-4 text-right font-medium">All PF</th><th className="py-2 pr-4 text-right font-medium">Avg trade</th><th className="py-2 pr-4 text-right font-medium">All drawdown</th><th className="py-2 text-right font-medium">Status</th></tr></thead><tbody><tr className="border-b border-brand-400/20 bg-brand-400/[0.035]"><td className="py-2.5 pr-4 font-semibold">Actual exits · baseline</td><td className={`py-2.5 pr-4 text-right font-mono font-semibold ${report.actual.netR >= 0 ? "text-profit" : "text-loss"}`}>{metric(report.actual.netR)}</td><td className={`py-2.5 pr-4 text-right font-mono ${report.actualValidation.netR >= 0 ? "text-profit" : "text-loss"}`}>{metric(report.actualValidation.netR)}</td><td className="py-2.5 pr-4 text-right font-mono">{report.actual.winRate.toFixed(1)}%</td><td className="py-2.5 pr-4 text-right font-mono">{pf(report.actual)}</td><td className="py-2.5 pr-4 text-right font-mono">{metric(report.actual.averageR)}</td><td className="py-2.5 pr-4 text-right font-mono text-loss">{metric(-report.actual.maxDrawdownR)}</td><td className="py-2.5 text-right app-muted">Baseline</td></tr>{report.rules.slice(0, 10).map((row) => <tr key={row.rule.id} className="border-b app-border/60 last:border-0"><td className="py-2.5 pr-4 font-semibold">{row.rule.label}</td><td className={`py-2.5 pr-4 text-right font-mono font-semibold ${row.all.netR >= 0 ? "text-profit" : "text-loss"}`}>{metric(row.all.netR)}</td><td className={`py-2.5 pr-4 text-right font-mono ${row.validation.netR >= 0 ? "text-profit" : "text-loss"}`}>{metric(row.validation.netR)}</td><td className="py-2.5 pr-4 text-right font-mono">{row.all.winRate.toFixed(1)}%</td><td className="py-2.5 pr-4 text-right font-mono">{pf(row.all)}</td><td className="py-2.5 pr-4 text-right font-mono">{metric(row.all.averageR)}</td><td className="py-2.5 pr-4 text-right font-mono text-loss">{metric(-row.all.maxDrawdownR)}</td><td className="py-2.5 text-right"><span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${row.validationPassed ? "bg-profit/10 text-profit" : "bg-white/[0.04] app-muted"}`}>{row.validationPassed ? "Passed" : "Not validated"}</span></td></tr>)}</tbody></table></div>

    {best && strongestImpacts.length > 0 && <div className="mt-5 border-t app-border pt-4"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] app-muted">Trades most changed by this rule</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{strongestImpacts.map((trade) => <div key={trade.tradeId} className="rounded-lg bg-white/[0.025] p-3">{tradeFocus ? <button type="button" onClick={() => tradeFocus.focusTrade(trade.tradeNumber)} className="font-mono text-[10px] text-brand-300 hover:underline">Trade #{trade.tradeNumber}</button> : <p className="font-mono text-[10px] app-muted">Trade #{trade.tradeNumber}</p>}<p className={`mt-1 font-mono text-sm font-semibold ${trade.deltaR >= 0 ? "text-profit" : "text-loss"}`}>{metric(trade.deltaR)}</p><p className="mt-1 text-[9px] app-muted">Actual {metric(trade.actualR)} → rule {metric(trade.optimizedR)}</p></div>)}</div></div>}

    <p className="mt-4 text-[10px] leading-4 app-muted">Candle-by-candle simulation uses the session&apos;s spread, commission and intrabar execution policy. Dynamic stops become active only after the candle that triggered them closes.</p>
  </div>;
}

function ResultMetric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-lg border app-border bg-black/[0.08] px-3 py-3"><p className="text-[9px] uppercase tracking-[0.08em] app-muted">{label}</p><p className={`mt-1 font-mono text-base font-semibold ${tone}`}>{value}</p></div>;
}

function SummaryFigure({ label, value, detail, tone = "" }: { label: string; value: string; detail: string; tone?: string }) {
  return <div className="rounded-xl border app-border bg-white/[0.02] p-4"><p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] app-muted">{label}<MetricInfo term={label} detail={detail} /></p><p className={`mt-2 font-mono text-xl font-semibold ${tone}`}>{value}</p></div>;
}

/**
 * The caption used to print under every figure. Three of those stacked under
 * three numbers is more explanation than data, so it moved behind the (i).
 */
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
      <dt className="flex items-center gap-1.5 app-muted">
        {label}
        <MetricInfo term={label} detail={detail} />
      </dt>
      <dd className="mt-0.5 font-mono text-base font-semibold">{value}</dd>
    </div>
  );
}

function Total({
  label,
  info,
  r,
  value,
}: {
  label: string;
  info: string;
  r: number;
  value: number;
}) {
  return (
    <div className="bg-[var(--app-panel)] p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] app-muted">
        {label}
        <MetricInfo term={label} detail={info} />
      </p>
      <p className="mt-2 font-mono text-xl font-semibold">{rr(r)}</p>
      <p className="mt-1 font-mono text-[11px] app-muted">{money(value)}</p>
    </div>
  );
}
