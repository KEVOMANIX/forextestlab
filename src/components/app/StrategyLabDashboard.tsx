"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Code2, Copy, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { PINE_SCRIPTS_CHANGED, PINE_STRATEGY_TEMPLATE, deletePineScript, isPineStrategy, readPineScripts, savePineScript, type PineScript } from "@/lib/chart/pine-scripts";
import { deletePineResult, readPineResults, type PineTestSummary } from "@/lib/chart/pine-results";
import { useLabDialog } from "./LabDialog";

type Sort = "edited" | "net" | "name";
const SORTS: [Sort, string][] = [["edited", "Last edited"], ["net", "Net profit"], ["name", "Name"]];

const percent = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;
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

function EquityLine({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return <div className="h-[60px]" />;
  const low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
  const path = values.map((value, index) => `${index ? "L" : "M"}${(index / (values.length - 1) * 260).toFixed(1)},${(56 - (value - low) / span * 52).toFixed(1)}`).join("");
  return <svg viewBox="0 0 260 60" preserveAspectRatio="none" className="h-[60px] w-full" aria-hidden>
    <path d={`${path} L260,60 L0,60Z`} fill={positive ? "rgb(var(--trade-profit-rgb, 47 210 154) / .13)" : "rgb(var(--trade-loss-rgb, 242 101 107) / .13)"} />
    <path d={path} fill="none" stroke={positive ? "rgb(var(--trade-profit-rgb, 47 210 154))" : "rgb(var(--trade-loss-rgb, 242 101 107))"} strokeWidth={2} vectorEffect="non-scaling-stroke" />
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
    const load = () => { setScripts(readPineScripts()); setResults(readPineResults()); };
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
    if (name && name !== script.name) savePineScript({ ...script, name, updatedAt: Date.now() });
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
      {sampleMode && <p className="mt-4 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs"><strong>Sample data.</strong> Scripts are saved in this browser; sign in to test them on real history. <a href="/sign-in?next=%2Fapp%2Fstrategies" className="font-semibold underline">Sign in</a></p>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <p className="text-xs app-muted">{scripts === null ? "Loading…" : (() => { const count = scripts.filter(script => isPineStrategy(script.code)).length; return `${count} ${count === 1 ? "strategy" : "strategies"}`; })()} · saved in this browser</p>
        <label className="relative ml-auto inline-flex items-center text-xs app-muted">Sort
          <select value={sort} onChange={event => setSort(event.target.value as Sort)} className="ml-2 h-8 appearance-none rounded-full border app-border bg-[var(--app-panel-solid)] pl-3 pr-7 text-xs text-[var(--app-text)]">{SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5" />
        </label>
      </div>

      {scripts === null ? <div className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[0, 1, 2].map(index => <div key={index} className="h-[236px] animate-pulse rounded-xl border app-border bg-[var(--app-panel-solid)]" />)}</div>
        : <div className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="strategy-cards">
          {visible.map(script => {
            const strategy = isPineStrategy(script.code);
            const result = strategy ? results[script.id] : undefined;
            return <div key={script.id} role="link" tabIndex={0} onClick={() => open(script.id)} onKeyDown={event => { if (event.key === "Enter") open(script.id); }} data-testid="strategy-card"
              className="group flex min-h-[236px] cursor-pointer flex-col rounded-xl border app-border bg-[var(--app-panel-solid)] p-4 transition-colors hover:border-[var(--app-accent)] focus-visible:border-[var(--app-accent)] focus-visible:outline-none">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{script.name}</h2><p className="mt-0.5 truncate text-[11px] app-muted">{result ? `${result.symbol} ${result.timeframe} · ${shortDate(result.from)} – ${shortDate(result.through)}` : `${strategy ? "Not tested yet" : "Indicator"} · edited ${ago(script.updatedAt)}`}</p></div>
                <div className="flex shrink-0 items-center gap-1"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${strategy ? "bg-[var(--app-accent)]/15 text-[var(--app-accent-text)]" : "bg-[var(--app-panel-2)] app-muted"}`}>{strategy ? "Strategy" : "Indicator"}</span><CardMenu onRename={() => void rename(script)} onDuplicate={() => duplicate(script)} onDelete={() => void remove(script)} /></div>
              </div>
              <div className="mt-3 flex-1">
                {result ? <EquityLine values={result.equity} positive={result.netPnl >= 0} />
                  : <div className="grid h-[60px] place-items-center rounded-lg border border-dashed app-border px-3 text-center text-[11px] app-muted">{strategy ? "Open it and press Run test to see results" : "Indicators draw on the chart. Add it from the chart's Indicators menu."}</div>}
              </div>
              {strategy ? <div className="mt-3 grid grid-cols-3 gap-2 border-t app-border pt-3">
                {([["Net", result ? percent(result.netPercent) : "—", result ? result.netPnl > 0 ? "text-profit" : result.netPnl < 0 ? "text-loss" : "" : "app-muted"], ["Profit factor", result?.profitFactor != null ? result.profitFactor.toFixed(2) : "—", result ? "" : "app-muted"], ["Win rate", result ? `${result.winRate.toFixed(1)}%` : "—", result ? "" : "app-muted"]] as [string, string, string][]).map(([label, value, color]) => <div key={label}><p className="text-[10px] uppercase tracking-wide app-muted">{label}</p><p className={`font-mono text-sm font-semibold tabular-nums ${color}`}>{value}</p></div>)}
              </div> : <p className="mt-3 flex items-center gap-1.5 border-t app-border pt-3 text-[11px] app-muted group-hover:text-[var(--app-text)]"><Code2 size={13} />Open in editor</p>}
              {result && <p className="mt-2 text-[10.5px] app-muted">{result.trades} trades · max drawdown −{result.maxDrawdownPercent.toFixed(1)}% · edited {ago(script.updatedAt)}</p>}
            </div>;
          })}
          {!query && <button type="button" onClick={() => create(PINE_STRATEGY_TEMPLATE)} className="grid min-h-[236px] place-items-center rounded-xl border border-dashed app-border p-4 text-center app-muted transition-colors hover:border-[var(--app-accent)] hover:text-[var(--app-text)]">
            <span><Plus size={26} className="mx-auto" /><strong className="mt-2 block text-sm text-[var(--app-text)]">New strategy</strong><span className="mt-1 block text-[11px]">Starts from an EMA crossover you can edit,<br />or paste a TradingView script</span></span>
          </button>}
          {query && !visible.length && <p className="col-span-full py-12 text-center text-sm app-muted">No strategies match.</p>}
        </div>}
    </div>
  </div>;
}
