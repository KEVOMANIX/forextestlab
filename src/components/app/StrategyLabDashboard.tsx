"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { PINE_SCRIPTS_CHANGED, PINE_STRATEGY_TEMPLATE, deletePineScript, isPineStrategy, pineScriptsLoaded, readPineScripts, savePineScript, withPineTitle, type PineScript } from "@/lib/chart/pine-scripts";
import { deletePineResult, readPineResults, type PineTestSummary } from "@/lib/chart/pine-results";
import { useLabDialog } from "./LabDialog";

type Sort = "edited" | "net" | "name";
const SORTS: [Sort, string][] = [["edited", "Last edited"], ["net", "Net profit"], ["name", "Name"]];

const percent = (value: number) => { const digits = Math.abs(value) >= 10 ? 1 : 2; const text = Math.abs(value).toFixed(digits); return `${Number(text) === 0 ? "" : value > 0 ? "+" : "−"}${text}%`; };
const signedMoney = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(value))}`;
const shortDate = (time: string) => { const date = new Date(`${time}T00:00:00Z`); return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }) : time; };
function ago(time: number) {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Realized equity with a dashed starting-balance line; green above it, red below. */
function EquityLine({ values, positive }: { values: number[]; positive: boolean }) {
  const gradient = useId();
  if (values.length < 2) return <div className="h-[74px]" />;
  const start = values[0]!;
  const low = Math.min(...values, start), high = Math.max(...values, start), span = high - low || 1;
  const y = (value: number) => 70 - (value - low) / span * 64;
  const path = values.map((value, index) => `${index ? "L" : "M"}${(index / (values.length - 1) * 300).toFixed(1)},${y(value).toFixed(1)}`).join("");
  const color = positive ? "rgb(var(--trade-profit-rgb, 47 210 154))" : "rgb(var(--trade-loss-rgb, 242 101 107))";
  return <svg viewBox="0 0 300 74" preserveAspectRatio="none" className="h-[74px] w-full" aria-hidden>
    <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.28} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient></defs>
    <line x1={0} x2={300} y1={y(start)} y2={y(start)} stroke="var(--app-border)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
    <path d={`${path} L300,74 L0,74Z`} fill={`url(#${gradient})`} />
    <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function CardMenu({ onRename, onDuplicate, onDelete }: { onRename: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close); window.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("keydown", escape); };
  }, [open]);
  const item = "flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs hover:bg-[var(--app-panel-2)]";
  return <div ref={ref} className="relative" onClick={event => event.stopPropagation()}>
    <button type="button" onClick={() => setOpen(!open)} aria-label="Script actions" aria-expanded={open} className="grid size-7 place-items-center rounded-md app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"><MoreHorizontal size={16} /></button>
    {open && <div role="menu" className="absolute right-0 top-8 z-20 w-40 rounded-lg border app-border bg-[var(--app-panel-solid)] p-1 shadow-xl">
      <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onRename(); }}><Pencil size={13} />Rename</button>
      <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onDuplicate(); }}><Copy size={13} />Duplicate</button>
      <button type="button" role="menuitem" className={`${item} text-loss`} onClick={() => { setOpen(false); onDelete(); }}><Trash2 size={13} />Delete</button>
    </div>}
  </div>;
}

/** Strategy Lab home: every saved Pine script as a card with its last test. */
export function StrategyLabDashboard({ sampleMode }: { sampleMode: boolean }) {
  const router = useRouter();
  const dialogs = useLabDialog();
  const [scripts, setScripts] = useState<PineScript[] | null>(null);
  const [results, setResults] = useState<Record<string, PineTestSummary>>({});
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("edited");

  useEffect(() => {
    const load = () => { const list = readPineScripts(); if (pineScriptsLoaded()) { setScripts(list); setResults(readPineResults()); } };
    load();
    window.addEventListener(PINE_SCRIPTS_CHANGED, load);
    window.addEventListener("storage", load);
    return () => { window.removeEventListener(PINE_SCRIPTS_CHANGED, load); window.removeEventListener("storage", load); };
  }, []);

  const open = (id: string) => router.push(`/app/strategies?script=${encodeURIComponent(id)}`);
  // New strategies open straight away; the name is changed by clicking it in the editor.
  const create = (code: string) => {
    const taken = new Set((scripts ?? []).map(script => script.name));
    let name = "My strategy";
    for (let number = 2; taken.has(name); number++) name = `My strategy ${number}`;
    const id = crypto.randomUUID();
    savePineScript({ id, name, code: code.replace(/^(\s*(?:strategy|indicator)\s*\(\s*)"[^"]*"/m, (_, start: string) => `${start}${JSON.stringify(name)}`), updatedAt: Date.now() });
    open(id);
  };
  const rename = async (script: PineScript) => {
    const name = await dialogs.prompt({ title: "Rename strategy", label: "Name", value: script.name });
    if (name && name !== script.name) savePineScript({ ...script, name, code: withPineTitle(script.code, name), updatedAt: Date.now() });
  };
  const duplicate = (script: PineScript) => savePineScript({ ...script, id: crypto.randomUUID(), name: `${script.name} (copy)`, updatedAt: Date.now() });
  const remove = async (script: PineScript) => {
    if (!await dialogs.confirm({ title: "Delete strategy?", message: `“${script.name}” and its last test result will be removed. This can't be undone.`, confirmLabel: "Delete", danger: true })) return;
    deletePineScript(script.id); deletePineResult(script.id); setResults(readPineResults());
  };

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase();
    return (scripts ?? [])
      .filter(script => isPineStrategy(script.code))
      .filter(script => !words || script.name.toLowerCase().includes(words) || (results[script.id]?.symbol ?? "").toLowerCase().includes(words))
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name)
        : sort === "net" ? (results[b.id]?.netPercent ?? -Infinity) - (results[a.id]?.netPercent ?? -Infinity) || b.updatedAt - a.updatedAt
        : b.updatedAt - a.updatedAt);
  }, [scripts, results, query, sort]);


  return <div className="min-h-[calc(100dvh-4rem)] bg-[var(--app-bg)] px-4 py-6 text-[var(--app-text)] sm:px-7">
    {dialogs.dialog}
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Strategy Lab</h1><p className="mt-1 text-sm app-muted">Write Pine strategies and test them on real history.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative"><Search size={15} className="absolute left-3 top-2.5 app-muted" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search strategies or markets" className="h-9 w-56 rounded-lg border app-border bg-[var(--app-panel-solid)] pl-9 pr-3 text-sm outline-none focus:border-[var(--app-accent)]" /></label>
          <button type="button" onClick={() => create(PINE_STRATEGY_TEMPLATE)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--app-accent)] px-3.5 text-xs font-bold text-[var(--app-accent-ink)]"><Plus size={15} />New strategy</button>
        </div>
      </div>
      {sampleMode && <p className="mt-4 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs"><strong>Sample data.</strong> Scripts stay in this browser until you sign in, then move to your account. Sign in to test them on real history. <a href="/sign-in?next=%2Fapp%2Fstrategies" className="font-semibold underline">Sign in</a></p>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <p className="text-xs app-muted">{scripts === null ? "Loading…" : (() => { const count = scripts.filter(script => isPineStrategy(script.code)).length; return `${count} ${count === 1 ? "strategy" : "strategies"}`; })()}{sampleMode ? " · saved in this browser until you sign in" : " · synced to your account"}</p>
        <label className="relative ml-auto inline-flex items-center text-xs app-muted">Sort
          <select value={sort} onChange={event => setSort(event.target.value as Sort)} className="ml-2 h-8 appearance-none rounded-full border app-border bg-[var(--app-panel-solid)] pl-3 pr-7 text-xs text-[var(--app-text)]">{SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5" />
        </label>
      </div>

      {scripts === null ? <div className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[0, 1, 2].map(index => <div key={index} className="h-[236px] animate-pulse rounded-xl border app-border bg-[var(--app-panel-solid)]" />)}</div>
        : <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="strategy-cards">
          {visible.map(script => {
            const result = results[script.id];
            const tone = !result ? "app-muted" : result.netPnl > 0 ? "text-profit" : result.netPnl < 0 ? "text-loss" : "";
            const metrics: [string, string, string][] = [
              ["Profit factor", result?.profitFactor != null ? result.profitFactor.toFixed(2) : "—", result ? "" : "app-muted"],
              ["Win rate", result ? `${result.winRate.toFixed(1)}%` : "—", result ? "" : "app-muted"],
              ["Trades", result ? result.trades.toLocaleString() : "—", result ? "" : "app-muted"],
              ["Max DD", result ? `−${result.maxDrawdownPercent.toFixed(1)}%` : "—", result ? "text-loss" : "app-muted"],
            ];
            return <div key={script.id} role="link" tabIndex={0} onClick={() => open(script.id)} onKeyDown={event => { if (event.key === "Enter") open(script.id); }} data-testid="strategy-card"
              className="group relative flex cursor-pointer flex-col rounded-2xl border app-border bg-[var(--app-panel-solid)] p-[18px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition duration-150 hover:-translate-y-0.5 hover:border-[var(--app-accent)] focus-visible:border-[var(--app-accent)] focus-visible:outline-none">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-semibold">{script.name}</h2>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{result
                    ? <><span className="rounded-md bg-[var(--app-panel-2)] px-2 py-0.5 text-[11px] font-semibold app-muted">{result.symbol}</span><span className="rounded-md bg-[var(--app-panel-2)] px-2 py-0.5 text-[11px] font-semibold app-muted">{result.timeframe}</span></>
                    : <span className="rounded-md bg-[var(--app-panel-2)] px-2 py-0.5 text-[11px] font-semibold app-muted">Not tested yet</span>}</div>
                </div>
                {result
                  ? <div className="shrink-0 text-right"><p className={`font-mono text-xl font-bold leading-tight tabular-nums ${tone}`}>{signedMoney(result.netPnl)}</p><p className={`font-mono text-xs tabular-nums ${tone}`}>{percent(result.netPercent)}</p></div>
                  : <CardMenu onRename={() => void rename(script)} onDuplicate={() => duplicate(script)} onDelete={() => void remove(script)} />}
              </div>
              <div className="mt-3">{result ? <EquityLine values={result.equity} positive={result.netPnl >= 0} />
                : <div className="grid h-[74px] place-items-center rounded-xl border border-dashed app-border text-xs app-muted"><span>Open it and press <strong className="text-[var(--app-text)]">Run test</strong></span></div>}</div>
              <div className="mt-3 grid grid-cols-4 border-t app-border pt-3">
                {metrics.map(([label, value, color], index) => <div key={label} className={index ? "border-l app-border pl-2.5" : ""}><p className="text-[10px] uppercase tracking-wide app-muted">{label}</p><p className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${color}`}>{value}</p></div>)}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-[11px] app-muted">
                <span className="truncate">{result ? `${shortDate(result.from)} – ${shortDate(result.through)} · ` : ""}edited {ago(script.updatedAt)}</span>
                <span className="flex shrink-0 items-center gap-1"><span className="font-bold text-[var(--app-accent-text)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Open →</span>{result && <CardMenu onRename={() => void rename(script)} onDuplicate={() => duplicate(script)} onDelete={() => void remove(script)} />}</span>
              </div>
            </div>;
          })}
          {!query && <button type="button" onClick={() => create(PINE_STRATEGY_TEMPLATE)} className="grid min-h-[268px] place-items-center rounded-2xl border-[1.5px] border-dashed app-border p-4 text-center app-muted transition-colors hover:border-[var(--app-accent)] hover:text-[var(--app-text)]">
            <span><span className="mx-auto grid size-11 place-items-center rounded-xl bg-[var(--app-panel-2)] text-[var(--app-accent-text)]"><Plus size={22} /></span><strong className="mt-2.5 block text-sm text-[var(--app-text)]">New strategy</strong><span className="mt-1 block text-xs">Start from an EMA crossover<br />or paste a TradingView script</span></span>
          </button>}
          {query && !visible.length && <p className="col-span-full py-12 text-center text-sm app-muted">No strategies match.</p>}
        </div>}
    </div>
  </div>;
}
