"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { useModalBehavior } from "@/lib/ui/use-modal-behavior";
import {
  DASHBOARD_SESSION_COOKIE,
  DASHBOARD_SESSION_COOKIE_MAX_AGE,
} from "@/lib/dashboard-session";

interface SessionOption {
  id: string;
  name: string;
  symbols: string;
  status: string;
  updatedAt: string;
  pnl: string;
  positive: boolean;
}

interface SessionTriggerDetails {
  name: string;
  symbols: string;
  status: string;
  progress: number;
}

const DASHBOARD_RAIL_STORAGE_KEY = "forextestlab.dashboard-session-rail";

export function DashboardSessionSwitcher({
  sessions,
  selectedId,
  triggerDetails,
  variant = "button",
}: {
  sessions: SessionOption[];
  selectedId: string;
  triggerDetails?: SessionTriggerDetails;
  variant?: "button" | "rail";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [railSessionIds, setRailSessionIds] = useState<string[] | null>(null);
  const sessionIdsKey = sessions.map((session) => session.id).join(",");

  useEffect(() => {
    document.cookie = `${DASHBOARD_SESSION_COOKIE}=${encodeURIComponent(selectedId)}; path=/; max-age=${DASHBOARD_SESSION_COOKIE_MAX_AGE}; samesite=lax`;
  }, [selectedId]);

  useEffect(() => {
    const availableIds = new Set(sessions.map((session) => session.id));
    let rememberedIds: string[] = [];
    try {
      const stored = window.localStorage.getItem(DASHBOARD_RAIL_STORAGE_KEY);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      rememberedIds = Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      // A blocked or malformed local-storage value should never hide the
      // active dashboard session.
    }
    const next = [selectedId, ...rememberedIds].filter(
      (id, index, ids) => availableIds.has(id) && ids.indexOf(id) === index,
    );
    setRailSessionIds(next);
  }, [selectedId, sessionIdsKey, sessions]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sessions;
    return sessions.filter((session) =>
      `${session.name} ${session.symbols} ${session.status}`.toLowerCase().includes(normalized),
    );
  }, [query, sessions]);

  const dialogRef = useModalBehavior<HTMLElement>({
    open,
    onClose: () => setOpen(false),
  });

  const saveRail = (ids: string[]) => {
    setRailSessionIds(ids);
    window.localStorage.setItem(DASHBOARD_RAIL_STORAGE_KEY, JSON.stringify(ids));
  };

  const addToRail = (id: string) => {
    const ids = railSessionIds ?? [selectedId];
    saveRail([id, ...ids.filter((sessionId) => sessionId !== id)].slice(0, 4));
  };

  const choose = (id: string) => {
    addToRail(id);
    const next = new URLSearchParams(searchParams.toString());
    next.set("session", id);
    next.delete("performance");
    setOpen(false);
    setQuery("");
    router.push(`/app?${next.toString()}`);
  };

  const dismissFromRail = (id: string) => {
    const ids = railSessionIds ?? [selectedId];
    if (id === selectedId) {
      const replacement = recentSessions.find((session) => session.id !== id);
      if (!replacement) return;
      saveRail([
        replacement.id,
        ...ids.filter((sessionId) => sessionId !== id && sessionId !== replacement.id),
      ]);
      const next = new URLSearchParams(searchParams.toString());
      next.set("session", replacement.id);
      next.delete("performance");
      router.push(`/app?${next.toString()}`);
      return;
    }
    saveRail(ids.filter((sessionId) => sessionId !== id));
  };

  // Keep the selected session in the first tile. A user must never have to
  // scroll a horizontal rail just to find what is currently in view.
  const recentSessions = (railSessionIds ?? [selectedId])
    .map((id) => sessions.find((session) => session.id === id))
    .filter((session): session is SessionOption => Boolean(session));

  return (
    <div className="relative">
      {variant === "rail" ? (
        <nav className="flex min-w-0 items-stretch gap-2 overflow-x-auto py-1" aria-label="Recent dashboard sessions">
          {recentSessions.map((session) => {
            const current = session.id === selectedId;
            return (
              <div
                key={session.id}
                className={`flex h-10 w-[10.5rem] shrink-0 items-stretch border transition-colors ${current ? "border-brand-400 bg-brand-400/[0.09] text-[var(--app-text)]" : "app-border bg-[var(--app-panel-2)]/55 text-[var(--app-muted)] hover:border-brand-400/40 hover:bg-white/[0.035] hover:text-[var(--app-text)]"}`}
              >
                <button
                  type="button"
                  onClick={() => !current && choose(session.id)}
                  aria-current={current ? "page" : undefined}
                  className="min-w-0 flex-1 px-2.5 text-left"
                >
                  <span className="block truncate text-[10px] font-semibold leading-3">{session.name}</span>
                  <span className="mt-0.5 block truncate text-[9px] leading-3 app-muted">{session.symbols}</span>
                </button>
                <button
                  type="button"
                  onClick={() => dismissFromRail(session.id)}
                  disabled={current && recentSessions.length === 1}
                  className="grid w-7 shrink-0 place-items-center app-muted transition-colors hover:text-[var(--app-text)] disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label={`Remove ${session.name} from recent sessions`}
                  title="Remove from recent sessions"
                >
                  <X size={13} strokeWidth={1.8} aria-hidden />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-10 w-[8.85rem] shrink-0 items-center justify-center gap-2 border border-dashed border-[var(--app-border)] text-[10px] font-semibold app-muted transition-colors hover:border-brand-400/55 hover:bg-white/[0.035] hover:text-brand-300"
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <Plus size={15} aria-hidden /> Add session
          </button>
        </nav>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={triggerDetails ? "group mt-4 flex w-full max-w-[22rem] items-center gap-3 rounded-xl border app-border bg-[var(--app-panel-2)]/65 px-3.5 py-3 text-left transition-colors hover:border-brand-400/40 hover:bg-brand-400/[0.05]" : "inline-flex h-9 items-center justify-between gap-3 rounded-lg border app-border bg-[var(--app-panel-2)] px-3 text-left text-xs font-semibold transition-colors hover:border-brand-400/40 hover:bg-white/[0.04]"}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Choose dashboard session"
          title="Choose dashboard session"
        >
          {triggerDetails ? <>
            <span className={`h-2 w-2 shrink-0 rounded-full ${triggerDetails.status === "Completed" ? "bg-brand-400" : "bg-amber-400"}`} aria-hidden />
            <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-[0.14em] app-muted">Current session</span><span className="mt-1 block truncate text-sm font-semibold">{triggerDetails.name}</span><span className="mt-1 block truncate text-[11px] app-muted">{triggerDetails.symbols}</span></span>
            <span className="flex shrink-0 items-center gap-2"><span className="text-right text-[11px] font-medium app-muted"><span className="block">{triggerDetails.status}</span><span className="block font-mono text-brand-300">{triggerDetails.progress.toFixed(0)}%</span></span><ChevronDown size={16} className="app-muted transition-colors group-hover:text-brand-300" aria-hidden /></span>
          </> : <><span className="truncate">Change session{sessions.length > 1 && <span className="ml-1.5 font-mono app-muted">{sessions.length}</span>}</span><ChevronDown size={15} className="shrink-0 app-muted" aria-hidden /></>}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section ref={dialogRef} tabIndex={-1} className="flex max-h-[min(620px,85dvh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)] shadow-2xl outline-none" role="dialog" aria-modal="true" aria-labelledby="session-picker-title">
            <div className="flex items-center justify-between border-b app-border p-4">
              <div>
                <h2 id="session-picker-title" className="font-semibold">Add session</h2>
                <p className="mt-1 text-xs app-muted">Choose a saved session to add it to this rail and make it active.</p>
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
                  <span className={`shrink-0 font-mono text-xs font-semibold ${session.positive ? "text-profit" : "text-loss"}`}>{session.pnl}</span>
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
