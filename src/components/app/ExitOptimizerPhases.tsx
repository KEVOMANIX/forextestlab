"use client";

import { Check, Download, Save, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useTradeFocus } from "@/components/app/TradeFocusContext";
import type { ExitOptimizerReport, OptimizerRuleResult, OptimizedTradeResult } from "@/lib/backtest/exit-optimizer";

const r = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}R`;
const session = (time: number) => { const hour = new Date(time).getUTCHours(); return hour < 7 ? "Asia" : hour < 13 ? "London" : hour < 21 ? "New York" : "Late"; };

function groups(trades: OptimizedTradeResult[], key: (trade: OptimizedTradeResult) => string) {
  const map = new Map<string, { count: number; actual: number; optimized: number }>();
  for (const trade of trades) { const name = key(trade); const row = map.get(name) ?? { count: 0, actual: 0, optimized: 0 }; row.count += 1; row.actual += trade.actualR; row.optimized += trade.optimizedR; map.set(name, row); }
  return [...map].map(([label, value]) => ({ label, ...value, delta: value.optimized - value.actual })).sort((a, b) => b.delta - a.delta);
}

export function ExitOptimizerPhases({ report, best, activePhase }: { report: ExitOptimizerReport; best: OptimizerRuleResult; activePhase?: 3 | 4 | 5 | 6 }) {
  const [phase, setPhase] = useState<3 | 4 | 5 | 6>(3);
  const current = activePhase ?? phase;
  return <section className={activePhase ? "" : "mt-5 rounded-xl border app-border bg-black/[0.05] p-4"}>
    {!activePhase && <div className="flex gap-2 overflow-x-auto">{([3, 4, 5, 6] as const).map((number) => <button key={number} type="button" onClick={() => setPhase(number)} className={`min-w-36 flex-1 rounded-lg border px-3 py-2 text-left ${phase === number ? "border-brand-400/45 bg-brand-400/[0.08]" : "app-border bg-white/[0.015]"}`}><span className="text-[9px] font-semibold text-brand-300">Phase {number}</span><strong className="mt-0.5 block text-[11px]">{{ 3: "Context", 4: "Robustness", 5: "Trade review", 6: "Deploy plan" }[number]}</strong></button>)}</div>}
    {current === 3 && <ContextPhase best={best} />}
    {current === 4 && <RobustnessPhase report={report} best={best} />}
    {current === 5 && <TradeReviewPhase best={best} />}
    {current === 6 && <DeployPhase report={report} best={best} />}
  </section>;
}

function ContextPhase({ best }: { best: OptimizerRuleResult }) {
  const dimensions = [
    { title: "Direction", rows: groups(best.trades, (trade) => trade.direction === "short" ? "Short" : "Long") },
    { title: "Trading session", rows: groups(best.trades, (trade) => session(trade.entryTime)) },
    { title: "Entry weekday", rows: groups(best.trades, (trade) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(trade.entryTime)) },
  ];
  return <div className="mt-4"><h4 className="text-sm font-semibold">Where this exit works best</h4><p className="mt-1 text-[10px] app-muted">The same validated rule segmented by trade direction, entry session and weekday. Small groups should be treated as clues, not separate strategies.</p><div className="mt-4 grid gap-3 lg:grid-cols-3">{dimensions.map((dimension) => <div key={dimension.title} className="rounded-lg border app-border bg-white/[0.015] p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] app-muted">{dimension.title}</p><div className="mt-3 space-y-2">{dimension.rows.map((row) => <div key={row.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-[10px]"><span>{row.label} <i className="not-italic app-muted">({row.count})</i></span><span className="font-mono app-muted">{r(row.optimized)}</span><span className={`font-mono font-semibold ${row.delta >= 0 ? "text-profit" : "text-loss"}`}>{r(row.delta)}</span></div>)}</div></div>)}</div></div>;
}

function RobustnessPhase({ report, best }: { report: ExitOptimizerReport; best: OptimizerRuleResult }) {
  const windows = useMemo(() => Array.from({ length: 4 }, (_, index) => { const start = Math.floor(index * best.trades.length / 4); const end = Math.floor((index + 1) * best.trades.length / 4); const slice = best.trades.slice(start, end); return { label: `Window ${index + 1}`, count: slice.length, delta: slice.reduce((sum, trade) => sum + trade.deltaR, 0) }; }), [best]);
  const simulations = useMemo(() => { let seed = 7193; const next = () => (seed = (seed * 48271) % 2147483647) / 2147483647; return Array.from({ length: 500 }, () => Array.from({ length: best.trades.length }, () => best.trades[Math.floor(next() * best.trades.length)]!.optimizedR).reduce((sum, value) => sum + value, 0)).sort((a, b) => a - b); }, [best]);
  const positiveWindows = windows.filter((window) => window.delta > 0).length;
  const passRate = report.rules.length ? report.rules.filter((row) => row.validationPassed).length / report.rules.length : 0;
  const stability = Math.round((positiveWindows / 4 * 55) + (best.validation.netR > 0 ? 25 : 0) + Math.min(20, passRate * 100));
  const percentile = (p: number) => simulations[Math.min(simulations.length - 1, Math.floor(simulations.length * p))] ?? 0;
  return <div className="mt-4"><h4 className="text-sm font-semibold">Is the improvement robust?</h4><p className="mt-1 text-[10px] app-muted">Rolling windows and deterministic bootstrap resampling check whether one period or a few lucky trades dominate the result.</p><div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr_0.7fr]"><div className="rounded-lg border app-border p-3"><p className="text-[10px] font-semibold">Rolling windows</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{windows.map((window) => <div key={window.label} className="rounded bg-white/[0.025] p-2"><p className="text-[9px] app-muted">{window.label} · {window.count}</p><p className={`mt-1 font-mono text-sm font-semibold ${window.delta >= 0 ? "text-profit" : "text-loss"}`}>{r(window.delta)}</p></div>)}</div></div><div className="rounded-lg border app-border p-3"><p className="text-[10px] font-semibold">Monte Carlo · 500 resamples</p><dl className="mt-3 grid grid-cols-3 gap-2 text-center"><div><dt className="text-[8px] app-muted">5th pct</dt><dd className="mt-1 font-mono text-xs">{r(percentile(.05))}</dd></div><div><dt className="text-[8px] app-muted">Median</dt><dd className="mt-1 font-mono text-xs">{r(percentile(.5))}</dd></div><div><dt className="text-[8px] app-muted">95th pct</dt><dd className="mt-1 font-mono text-xs">{r(percentile(.95))}</dd></div></dl></div><div className="rounded-lg border border-brand-400/25 bg-brand-400/[0.05] p-3"><p className="text-[9px] app-muted">Stability score</p><p className="mt-2 font-mono text-3xl font-semibold text-brand-300">{stability}<span className="text-xs app-muted">/100</span></p><p className="mt-2 text-[9px] app-muted">{positiveWindows}/4 periods improved</p></div></div></div>;
}

function TradeReviewPhase({ best }: { best: OptimizerRuleResult }) {
  const focus = useTradeFocus();
  const [filter, setFilter] = useState<"improved" | "harmed" | "saved" | "cut">("improved");
  const filtered = best.trades.filter((trade) => filter === "improved" ? trade.deltaR > 0 : filter === "harmed" ? trade.deltaR < 0 : filter === "saved" ? trade.actualR < 0 && trade.optimizedR >= 0 : trade.actualR > 1 && trade.optimizedR < trade.actualR).sort((a, b) => Math.abs(b.deltaR) - Math.abs(a.deltaR));
  const filters = [{ id: "improved", label: "Improved" }, { id: "harmed", label: "Harmed" }, { id: "saved", label: "Losses avoided" }, { id: "cut", label: "Winners cut early" }] as const;
  return <div className="mt-4"><h4 className="text-sm font-semibold">Understand exactly what changed</h4><div className="mt-3 flex flex-wrap gap-2">{filters.map((item) => { const count = best.trades.filter((trade) => item.id === "improved" ? trade.deltaR > 0 : item.id === "harmed" ? trade.deltaR < 0 : item.id === "saved" ? trade.actualR < 0 && trade.optimizedR >= 0 : trade.actualR > 1 && trade.optimizedR < trade.actualR).length; return <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`rounded-full px-3 py-1.5 text-[9px] font-semibold ${filter === item.id ? "bg-brand-400 text-surface-950" : "bg-white/[0.04] app-muted"}`}>{item.label} · {count}</button>; })}</div><div className="mt-3 max-h-72 overflow-auto rounded-lg border app-border"><table className="w-full min-w-[620px] text-left text-[10px]"><thead><tr className="sticky top-0 bg-[var(--app-panel)] app-muted"><th className="p-2">Trade</th><th className="p-2">Pair</th><th className="p-2 text-right">Actual</th><th className="p-2 text-right">Optimized</th><th className="p-2 text-right">Change</th><th className="p-2">Exit reason</th></tr></thead><tbody>{filtered.map((trade) => <tr key={trade.tradeId} className="border-t app-border"><td className="p-2">{focus ? <button onClick={() => focus.focusTrade(trade.tradeNumber)} className="text-brand-300 hover:underline">#{trade.tradeNumber}</button> : `#${trade.tradeNumber}`}</td><td className="p-2">{trade.symbol ?? "—"}</td><td className="p-2 text-right font-mono">{r(trade.actualR)}</td><td className="p-2 text-right font-mono">{r(trade.optimizedR)}</td><td className={`p-2 text-right font-mono font-semibold ${trade.deltaR >= 0 ? "text-profit" : "text-loss"}`}>{r(trade.deltaR)}</td><td className="p-2 app-muted">{trade.reason}</td></tr>)}</tbody></table>{!filtered.length && <p className="p-5 text-center text-[10px] app-muted">No trades in this category.</p>}</div></div>;
}

function DeployPhase({ report, best }: { report: ExitOptimizerReport; best: OptimizerRuleResult }) {
  const [saved, setSaved] = useState(false);
  const plan = { version: 1, savedAt: new Date().toISOString(), rule: best.rule, expected: best.all, validation: best.validation, eligibleTrades: report.eligibleTrades, recheckAfterNewTrades: 30 };
  const save = () => { localStorage.setItem("forextestlab:saved-exit-plan", JSON.stringify(plan)); setSaved(true); };
  const download = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "forextestlab-exit-plan.json"; anchor.click(); URL.revokeObjectURL(url); };
  return <div className="mt-4"><h4 className="text-sm font-semibold">Turn the winner into a repeatable plan</h4><div className="mt-4 grid gap-3 lg:grid-cols-[1.5fr_1fr]"><div className="rounded-lg border border-brand-400/25 bg-brand-400/[0.05] p-4"><p className="flex items-center gap-2 text-[10px] font-semibold uppercase text-brand-300"><ShieldCheck size={14} />Recommended exit plan</p><p className="mt-2 text-base font-semibold">{best.rule.label}</p><p className="mt-2 text-[10px] leading-5 app-muted">Apply this rule consistently to new trades that use a defined initial stop. Re-test after 30 additional trades; historical improvement does not guarantee future results.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-[10px] font-bold text-surface-950">{saved ? <Check size={13} /> : <Save size={13} />}{saved ? "Saved on this device" : "Save as exit plan"}</button><button type="button" onClick={download} className="inline-flex items-center gap-2 rounded-lg border app-border px-4 py-2 text-[10px] font-semibold"><Download size={13} />Export plan</button></div></div><div className="rounded-lg border app-border p-4"><p className="text-[10px] font-semibold">Expected from this sample</p><dl className="mt-3 grid grid-cols-2 gap-3 text-[9px] app-muted"><div><dt>Net return</dt><dd className="mt-1 font-mono text-sm text-white">{r(best.all.netR)}</dd></div><div><dt>Profit factor</dt><dd className="mt-1 font-mono text-sm text-white">{best.all.profitFactor?.toFixed(2) ?? "∞"}</dd></div><div><dt>Win rate</dt><dd className="mt-1 font-mono text-sm text-white">{best.all.winRate.toFixed(1)}%</dd></div><div><dt>Max drawdown</dt><dd className="mt-1 font-mono text-sm text-loss">{r(-best.all.maxDrawdownR)}</dd></div></dl><p className="mt-4 rounded bg-amber-300/[0.06] p-2 text-[9px] text-amber-100">Monitor rather than assume. The plan should be reviewed when market conditions or your entry process changes.</p></div></div></div>;
}
