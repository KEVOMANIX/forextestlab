"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

interface SessionOption {
  id: string;
  name: string;
  symbols: string;
  status: string;
  updatedAt: string;
  pnl: string;
  positive: boolean;
}

export function DashboardSessionSwitcher({
  sessions,
  selectedId,
}: {
  sessions: SessionOption[];
  selectedId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = sessions.find((session) => session.id === selectedId);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sessions;
    return sessions.filter((session) =>
      `${session.name} ${session.symbols} ${session.status}`.toLowerCase().includes(normalized),
    );
  }, [query, sessions]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const choose = (id: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("session", id);
    next.delete("performance");
    setOpen(false);
    setQuery("");
    router.push(`/app?${next.toString()}`);
  };

  return (
    <div className="relative">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] app-muted">Change session</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 min-w-48 items-center justify-between gap-3 rounded-lg border app-border bg-[var(--app-panel-2)] px-3 text-left text-sm font-semibold transition-colors hover:border-brand-400/40"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.name ?? "Choose session"}</span>
        <ChevronDown size={15} className="shrink-0 app-muted" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className="flex max-h-[min(620px,85vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="session-picker-title">
            <div className="flex items-center justify-between border-b app-border p-4">
              <div>
                <h2 id="session-picker-title" className="font-semibold">Choose dashboard session</h2>
                <p className="mt-1 text-xs app-muted">Results update to the session you select.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg app-muted hover:bg-white/[0.06]" aria-label="Close session picker"><X size={16} /></button>
            </div>
            <label className="m-4 flex items-center gap-2 rounded-lg border app-border bg-[var(--app-panel-2)] px-3">
              <Search size={15} className="app-muted" aria-hidden />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search name, pair, or status…" aria-label="Search sessions" />
            </label>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {filtered.map((session) => (
                <button key={session.id} type="button" onClick={() => choose(session.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/[0.05]">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${session.id === selectedId ? "bg-brand-500 text-surface-950" : "bg-white/[0.06] app-muted"}`}>
                    {session.id === selectedId ? <Check size={15} /> : session.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{session.name}</span>
                    <span className="mt-1 block truncate text-xs app-muted">{session.symbols} · {session.status} · {session.updatedAt}</span>
                  </span>
                  <span className={`shrink-0 font-mono text-xs font-semibold ${session.positive ? "text-brand-300" : "text-bear"}`}>{session.pnl}</span>
                </button>
              ))}
              {filtered.length === 0 && <p className="px-3 py-8 text-center text-sm app-muted">No matching sessions.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
