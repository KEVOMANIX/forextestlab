"use client";

import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { SessionCardActions } from "@/components/app/SessionCardActions";

export interface DashboardSessionRow {
  id: string;
  name: string;
  symbols: string;
  dateRange: string;
  status: "Active" | "Completed";
  updatedAt: number;
  updatedLabel: string;
  pnl: number;
  pnlLabel: string;
  progress: number;
  winRate: number | null;
  closedTrades: number;
  archived: boolean;
}

type StatusFilter = "all" | "active" | "completed";
type SortMode = "recent" | "pnl" | "progress";

export function DashboardSessionsTable({
  sessions,
}: {
  sessions: DashboardSessionRow[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("recent");

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sessions
      .filter((session) => {
        const matchesQuery =
          !normalized ||
          `${session.name} ${session.symbols}`.toLowerCase().includes(normalized);
        const matchesStatus =
          status === "all" || session.status.toLowerCase() === status;
        return matchesQuery && matchesStatus;
      })
      .sort((left, right) => {
        if (sort === "pnl") return right.pnl - left.pnl;
        if (sort === "progress") return right.progress - left.progress;
        return right.updatedAt - left.updatedAt;
      });
  }, [query, sessions, sort, status]);
  const displayed = visible.slice(0, 6);

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)] shadow-card">
      <div className="flex flex-col gap-3 border-b app-border bg-[var(--app-panel-2)]/35 p-3.5 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex h-9 min-w-0 items-center gap-2 rounded-lg border app-border bg-[var(--app-bg)]/45 px-3 lg:w-72">
          <Search size={15} className="shrink-0 app-muted" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sessions"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            aria-label="Search sessions"
          />
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="inline-flex rounded-lg border app-border bg-[var(--app-bg)]/45 p-1">
            {(["all", "active", "completed"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatus(option)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  status === option
                    ? "bg-white/[0.08] text-[var(--app-text)]"
                    : "app-muted hover:text-[var(--app-text)]"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <label className="flex h-9 items-center gap-2 rounded-lg border app-border bg-[var(--app-bg)]/45 px-3 text-xs app-muted">
            <SlidersHorizontal size={14} aria-hidden />
            <span className="sr-only">Sort sessions</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="bg-transparent font-semibold text-[var(--app-text)] outline-none"
              aria-label="Sort sessions"
            >
              <option value="recent">Most recent</option>
              <option value="pnl">Highest P/L</option>
              <option value="progress">Most progress</option>
            </select>
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="font-semibold">No matching sessions</p>
          <p className="mt-1 text-sm app-muted">Adjust the search or status filter.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <div className="min-w-[55rem]">
            <div className="grid grid-cols-[minmax(18rem,1.8fr)_8rem_6rem_7rem_14rem] items-center gap-5 border-b app-border bg-[var(--app-bg)]/30 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.13em] app-muted">
              <span>Session</span>
              <span>Progress</span>
              <span className="text-right">Win rate</span>
              <span className="text-right">Net P/L</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y app-border">
              {displayed.map((session) => (
                <article key={session.id} className="group grid grid-cols-[minmax(18rem,1.8fr)_8rem_6rem_7rem_14rem] items-center gap-5 px-5 py-4 transition-colors hover:bg-brand-400/[0.055] focus-within:bg-brand-400/[0.055]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/app?session=${encodeURIComponent(session.id)}`} className="truncate font-semibold transition-colors group-hover:text-brand-300">{session.name}</Link>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] app-muted">{session.symbols}</p>
                  </div>
                  <div>
                    <p className="text-right font-mono text-sm font-semibold text-[var(--app-text)]">{session.progress.toFixed(0)}%</p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-brand-500" style={{ width: `${session.progress}%` }} /></div>
                  </div>
                  <div className="text-right"><p className={`font-mono text-sm font-semibold ${session.winRate === null ? "app-muted" : "text-brand-300"}`}>{session.winRate === null ? "—" : `${session.winRate.toFixed(0)}%`}</p></div>
                  <p className={`text-right font-mono text-sm font-semibold ${session.pnl >= 0 ? "text-profit" : "text-loss"}`}>{session.pnlLabel}</p>
                  <div className="justify-self-end"><SessionCardActions sessionId={session.id} sessionName={session.name} status={session.status === "Completed" ? "finished" : "paused"} archived={session.archived} compact /></div>
                </article>
              ))}
            </div>
            </div>
          </div>

          <div className="divide-y app-border lg:hidden">
            {displayed.map((session) => (
              <article key={session.id} className="p-4">
                <div className="min-w-0">
                  <div className="min-w-0">
                    <Link
                      href={`/app?session=${encodeURIComponent(session.id)}`}
                      className="block truncate font-semibold hover:text-brand-300"
                    >
                      {session.name}
                    </Link>
                    <p className="mt-1 truncate font-mono text-xs app-muted">{session.symbols}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_auto_auto] items-end gap-4">
                  <div>
                    <div className="mb-2 flex items-center justify-end text-[11px] app-muted"><span>{session.progress.toFixed(0)}%</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${session.progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right"><p className={`font-mono text-sm font-semibold ${session.winRate === null ? "app-muted" : "text-brand-300"}`}>{session.winRate === null ? "—" : `${session.winRate.toFixed(0)}%`}</p><p className="mt-0.5 text-[10px] app-muted">Win rate</p></div>
                  <p
                    className={`font-mono text-sm font-semibold ${
                      session.pnl >= 0 ? "text-profit" : "text-loss"
                    }`}
                  >
                    {session.pnlLabel}
                  </p>
                </div>
                <div className="mt-4 border-t app-border pt-3">
                  <SessionCardActions
                    sessionId={session.id}
                    sessionName={session.name}
                    status={session.status === "Completed" ? "finished" : "paused"}
                    archived={session.archived}
                    compact
                  />
                </div>
              </article>
            ))}
          </div>
          {visible.length > displayed.length && (
            <div className="border-t app-border px-4 py-3 text-center text-xs app-muted">
              Showing {displayed.length} of {visible.length} sessions. Use search or open full history to see more.
            </div>
          )}
        </>
      )}
    </div>
  );
}
