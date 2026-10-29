"use client";

import { ArrowUpRight, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { validationReason, type OptimizerObjective } from "@/components/app/ExitQualityCard";
import { useTradeFocus } from "@/components/app/TradeFocusContext";
import type { ExitOptimizerReport, OptimizerMetrics, OptimizerRuleResult } from "@/lib/backtest/exit-optimizer";
import styles from "./ExitOptimizerWorkspace.module.css";

const r = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}R`;
const factor = (metrics: OptimizerMetrics) => metrics.profitFactor?.toFixed(2) ?? (metrics.netR > 0 ? "∞" : "—");
const objectiveLabel: Record<OptimizerObjective, string> = { balanced: "Balanced", return: "Maximum return", "profit-factor": "Profit factor", drawdown: "Lowest drawdown" };

export function ExitOptimizerResults({ report, best, objective, onDeploy }: {
  report: ExitOptimizerReport; best: OptimizerRuleResult | null; objective: OptimizerObjective; onDeploy: () => void;
}) {
  const focus = useTradeFocus();
  const [showAll, setShowAll] = useState(false);
  const candidates = showAll ? report.rules : report.rules.slice(0, 5);
  const impacts = best?.trades.slice().sort((a, b) => Math.abs(b.deltaR) - Math.abs(a.deltaR)).slice(0, 5) ?? [];
  const evidence = { insufficient: "Insufficient sample", experimental: "Experimental", developing: "Developing evidence", stronger: "Stronger evidence" }[report.evidence];

  return <section className={styles.panel} data-testid="optimizer-results">
    {best ? <>
      <div className={styles.resultHeading}>
        <div><p className={styles.eyebrow}>Recommended · {objectiveLabel[objective]}</p><h3>{best.rule.label}</h3>
          <p className={`${styles.delta} ${best.all.netR >= report.actual.netR ? styles.positive : styles.negative}`}>{r(best.all.netR - report.actual.netR)} vs. original exits</p>
        </div>
        <span className={styles.badge}><Check size={12} />Passed validation</span>
      </div>
      <dl className={styles.metrics}>
        <Figure label="Net result" value={r(best.all.netR)} baseline={`Original ${r(report.actual.netR)}`} />
        <Figure label="Profit factor" value={factor(best.all)} baseline={`Original ${factor(report.actual)}`} />
        <Figure label="Max drawdown" value={`${best.all.maxDrawdownR.toFixed(2)}R`} baseline={`Original ${report.actual.maxDrawdownR.toFixed(2)}R`} />
        <Figure label="Validation" value={r(best.validation.netR)} baseline={`${best.validation.trades} later trades · ${r(best.validation.netR - report.actualValidation.netR)} vs. original`} />
      </dl>
      <details className={styles.extra}><summary>Win rate, average trade &amp; sample</summary><dl className={styles.metrics}>
        <Figure label="All-trades win rate" value={`${best.all.winRate.toFixed(1)}%`} baseline={`Original ${report.actual.winRate.toFixed(1)}%`} />
        <Figure label="Average trade" value={r(best.all.averageR)} baseline={`Original ${r(report.actual.averageR)}`} />
        <Figure label="Eligible trades" value={String(best.all.trades)} baseline={evidence} />
      </dl></details>
      <OptimizerEquity report={report} best={best} />
    </> : <>
      <p className={styles.eyebrow}>Analysis complete · {evidence}</p><h3 className={styles.sectionTitle}>No validated recommendation</h3>
      <p className={styles.warning}>No tested rule improved on the original exits in validation with enough later trades. The comparison below shows the results.</p>
    </>}

    <section className={styles.candidateSection}>
      <h4 className={styles.candidatesTitle}>Candidate comparison</h4>
      <div className={styles.tableScroll}><table className={styles.table}>
        <thead><tr><th>Exit rule</th><th>Net R</th><th>Validation R</th><th>PF</th><th>Status</th></tr></thead>
        <tbody>
          <tr className={styles.baseline}><td>Original exits · baseline</td><td>{r(report.actual.netR)}</td><td>{r(report.actualValidation.netR)}</td><td>{factor(report.actual)}</td><td className={styles.rowStatus}>Baseline</td></tr>
          {candidates.map(row => {
            const status = validationReason(row, report.actualValidation);
            return <tr key={row.rule.id} className={row.rule.id === best?.rule.id ? styles.recommended : undefined}>
              <td>{row.rule.label}</td><td>{r(row.all.netR)}</td><td className={row.validation.netR >= 0 ? styles.positive : styles.negative}>{r(row.validation.netR)}</td><td>{factor(row.all)}</td>
              <td className={styles.rowStatus}><span title={status.detail}>{status.label}</span></td>
            </tr>;
          })}
        </tbody>
      </table></div>
      {report.rules.length > 5 && <button type="button" className={styles.inlineLink} onClick={() => setShowAll(current => !current)}>{showAll ? "Show fewer candidates" : `Show all ${report.rules.length} candidates`}<ArrowUpRight size={14} /></button>}
      <details className={styles.extra}><summary>All candidate metrics</summary><div className={styles.tableScroll}><table className={styles.table}>
        <thead><tr><th>Exit rule</th><th>Win rate</th><th>Avg. trade</th><th>Drawdown</th><th>Trades</th></tr></thead>
        <tbody>
          <tr className={styles.baseline}><td>Original exits · baseline</td><td>{report.actual.winRate.toFixed(1)}%</td><td>{r(report.actual.averageR)}</td><td>{report.actual.maxDrawdownR.toFixed(2)}R</td><td>{report.actual.trades}</td></tr>
          {report.rules.map(row => <tr key={row.rule.id}><td>{row.rule.label}</td><td>{row.all.winRate.toFixed(1)}%</td><td>{r(row.all.averageR)}</td><td>{row.all.maxDrawdownR.toFixed(2)}R</td><td>{row.all.trades}</td></tr>)}
        </tbody>
      </table></div></details>
    </section>

    {best && impacts.length > 0 && <details className={styles.extra}><summary>Trades most changed</summary><div className={styles.impactList}>
      {impacts.map(trade => <div key={trade.tradeId}>
        {focus ? <button type="button" onClick={() => focus.focusTrade(trade.tradeNumber)} className="text-brand-300 hover:underline">Trade #{trade.tradeNumber}</button> : <span>Trade #{trade.tradeNumber}</span>}
        <strong className={trade.deltaR >= 0 ? styles.positive : styles.negative}>{r(trade.deltaR)}</strong>
        <span className="app-muted">{r(trade.actualR)} → {r(trade.optimizedR)}</span>
      </div>)}
    </div></details>}

    <div className={styles.under}><p>{report.eligibleTrades} eligible trades · {report.discoveryTrades} discovery / {report.validationTrades} validation</p>
      {best && <button type="button" className={styles.secondary} onClick={onDeploy}>Save exit plan<ArrowUpRight size={14} /></button>}
    </div>
    <p className={styles.note}>Uses the session&apos;s spread, commission and execution policy. Dynamic stops activate after the triggering candle closes.</p>
  </section>;
}

function Figure({ label, value, baseline }: { label: string; value: string; baseline: string }) {
  return <div><dt>{label}</dt><dd>{value}<small>{baseline}</small></dd></div>;
}

function cumulative(values: number[]) {
  const result = [0]; for (const value of values) result.push(result[result.length - 1]! + value); return result;
}

function OptimizerEquity({ report, best }: { report: ExitOptimizerReport; best: OptimizerRuleResult }) {
  const holder = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const node = holder.current; if (!node) return;
    const observer = new ResizeObserver(entries => { const measured = entries[0]?.contentRect.width; if (measured && measured > 0) setWidth(measured); });
    observer.observe(node); return () => observer.disconnect();
  }, []);
  const actual = cumulative(best.trades.map(trade => trade.actualR));
  const optimized = cumulative(best.trades.map(trade => trade.optimizedR));
  let low = 0, high = 0;
  for (const value of [...actual, ...optimized]) { low = Math.min(low, value); high = Math.max(high, value); }
  const padding = Math.max(1, (high - low) * .1); low -= padding; high += padding;
  const height = 230, left = 46, right = 20, top = 26, bottom = 32;
  const count = actual.length - 1;
  const x = (index: number) => left + index / Math.max(1, count) * (width - left - right);
  const y = (value: number) => height - bottom - (value - low) / (high - low) * (height - top - bottom);
  const points = (values: number[]) => values.map((value, index) => `${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
  const split = Math.min(report.discoveryTrades, count);
  const ticks = Array.from({ length: 4 }, (_, index) => low + (high - low) * index / 3);
  const tradeTicks = Array.from(new Set([0, Math.floor(count / 2), count]));

  return <section className={styles.plot}>
    <div className={styles.plotHeading}><h4>Equity comparison</h4><div className={styles.legend}><span><i />Optimized</span><span><i />Original</span></div></div>
    <div ref={holder} className={styles.graph}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Cumulative R over ${count} trades, comparing original and optimized exits. Validation starts after trade ${split}.`}>
      {ticks.map((value, index) => <g key={index}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="var(--app-border)" /><text x={left - 7} y={y(value) + 4} textAnchor="end" fill="var(--app-muted)" fontSize={11}>{value.toFixed(1)}R</text></g>)}
      <line x1={x(split)} x2={x(split)} y1={top} y2={height - bottom} stroke="var(--app-muted)" strokeDasharray="3 5" opacity={.6} />
      <text x={Math.min(x(split) + 6, width - 77)} y={14} fill="var(--app-muted)" fontSize={11}>Validation</text>
      <text x={left} y={14} fill="var(--app-muted)" fontSize={11}>Cumulative R</text>
      <polyline points={points(actual)} fill="none" stroke="var(--app-muted)" strokeWidth={1.6} />
      <polyline points={points(optimized)} fill="none" stroke="var(--app-accent)" strokeWidth={2.3} />
      {tradeTicks.map(index => <text key={index} x={x(index)} y={height - 8} textAnchor={index === count ? "end" : "middle"} fill="var(--app-muted)" fontSize={11}>{index === count ? `${count} trades` : index}</text>)}
    </svg></div>
  </section>;
}
