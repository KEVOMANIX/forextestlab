"use client";

import { useMemo, useState } from "react";
import { BarChart3, Check, ChevronDown, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { useModalBehavior } from "@/lib/ui/use-modal-behavior";

export interface AnalyticsSessionOption {
  id: string;
  name: string;
  symbols: string;
  status: string;
  updatedAt: string;
  pnl: string;
  positive: boolean;
}

export function AnalyticsSessionPicker({ sessions, selectedId }: { sessions: AnalyticsSessionOption[]; selectedId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0];
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return sessions;
    return sessions.filter((session) => `${session.name} ${session.symbols}`.toLowerCase().includes(value));
  }, [query, sessions]);
  const dialogRef = useModalBehavior<HTMLElement>({ open, onClose: () => setOpen(false) });

  if (!selected) return null;

  const choose = (id: string) => {
    setOpen(false);
    setQuery("");
    router.push(`/app/analytics?session=${encodeURIComponent(id)}`);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group flex max-w-full items-center gap-3 rounded-xl px-1 py-1 text-left transition-colors hover:bg-white/[0.035]" aria-haspopup="dialog" aria-expanded={open} aria-label="Search and select an analytics session">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-400/12 text-brand-300"><BarChart3 size={15} aria-hidden /></span>
        <span className="min-w-0"><span className="block text-[9px] font-semibold uppercase tracking-[0.16em] app-muted">Selected session</span><span className="mt-0.5 block truncate text-base font-semibold sm:text-lg">{selected.name}</span></span>
        <ChevronDown size={16} className="shrink-0 app-muted transition-colors group-hover:text-brand-300" aria-hidden />
      </button>

      {open && <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
        <section ref={dialogRef} tabIndex={-1} className="flex max-h-[min(640px,86dvh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)] shadow-2xl outline-none" role="dialog" aria-modal="true" aria-labelledby="analytics-session-picker-title">
          <div className="flex items-start justify-between gap-4 border-b app-border p-5">
            <div><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand-300">Session library</p><h2 id="analytics-session-picker-title" className="mt-1 text-lg font-semibold">Select a session</h2></div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg app-muted transition-colors hover:bg-white/[0.06] hover:text-[var(--app-text)]" aria-label="Close session picker"><X size={16} aria-hidden /></button>
          </div>
          <label className="m-4 flex items-center gap-2 rounded-xl border app-border bg-[var(--app-panel-2)] px-3.5 focus-within:border-brand-400/45">
            <Search size={15} className="app-muted" aria-hidden />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--app-muted)]" placeholder="Search name or market…" aria-label="Search analytics sessions" />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {filtered.map((session) => {
              const active = session.id === selectedId;
              return <button key={session.id} type="button" onClick={() => choose(session.id)} aria-current={active ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${active ? "bg-brand-400/[0.10]" : "hover:bg-white/[0.045]"}`}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold ${active ? "bg-brand-500 text-surface-950" : "bg-white/[0.055] app-muted"}`}>{active ? <Check size={15} aria-hidden /> : session.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{session.name}</span><span className="mt-1 block truncate text-[11px] app-muted">{session.symbols}</span></span><span className="shrink-0 text-right"><span className={`block font-mono text-xs font-semibold ${session.positive ? "text-profit" : "text-loss"}`}>{session.pnl}</span><span className="mt-1 block text-[9px] app-muted">{session.updatedAt}</span></span></button>;
            })}
            {filtered.length === 0 && <div className="px-4 py-12 text-center"><Search size={20} className="mx-auto app-muted" aria-hidden /><p className="mt-3 text-sm font-semibold">No matching sessions</p><p className="mt-1 text-xs app-muted">Try a session name or market symbol.</p></div>}
          </div>
        </section>
      </div>}
    </>
  );
}
