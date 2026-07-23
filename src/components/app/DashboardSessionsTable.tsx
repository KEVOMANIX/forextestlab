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

  return (
    <div className="panel mt-4">
      <div className="flex flex-col gap-3 border-b app-border p-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex h-10 min-w-0 items-center gap-2 rounded-lg border app-border bg-[var(--app-panel-2)] px-3 lg:w-72">
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
          <div className="inline-flex rounded-lg border app-border bg-[var(--app-panel-2)] p-1">
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
          <label className="flex h-10 items-center gap-2 rounded-lg border app-border bg-[var(--app-panel-2)] px-3 text-xs app-muted">
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
          <div className="hidden lg:block">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">Recent backtesting sessions</caption>
              <thead className="text-xs app-muted">
                <tr className="border-b app-border">
                  <th className="w-[26%] px-5 py-3 font-medium">Session</th>
                  <th className="w-[14%] px-4 py-3 font-medium">Market</th>
                  <th className="w-[18%] px-4 py-3 font-medium">Test period</th>
                  <th className="w-[12%] px-4 py-3 font-medium">Progress</th>
                  <th className="w-[11%] px-4 py-3 text-right font-medium">Net P/L</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((session) => (
                  <tr
                    key={session.id}
                    className="border-b app-border/70 transition-colors last:border-0 hover:bg-white/[0.025]"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/app?session=${encodeURIComponent(session.id)}`}
                        className="block truncate font-semibold hover:text-brand-300"
                      >
                        {session.name}
                      </Link>
                      <span className="mt-1 block text-xs app-muted">
                        {session.updatedLabel}
                      </span>
                    </td>
                    <td className="truncate px-4 py-4 font-mono text-xs">
                      {session.symbols}
                    </td>
                    <td className="truncate px-4 py-4 text-xs app-muted">
                      {session.dateRange}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{ width: `${session.progress}%` }}
                          />
                        </div>
                        <span className="w-8 text-right font-mono text-[11px]">
                          {session.progress.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td
                      className={`px-4 py-4 text-right font-mono font-semibold ${
                        session.pnl >= 0 ? "text-brand-300" : "text-bear"
                      }`}
                    >
                      {session.pnlLabel}
                    </td>
                    <td className="px-5 py-4">
                      <SessionCardActions
                        sessionId={session.id}
                        sessionName={session.name}
                        status={session.status === "Completed" ? "finished" : "paused"}
                        archived={session.archived}
                        compact
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y app-border lg:hidden">
            {visible.map((session) => (
              <article key={session.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/app?session=${encodeURIComponent(session.id)}`}
                      className="block truncate font-semibold hover:text-brand-300"
                    >
                      {session.name}
                    </Link>
                    <p className="mt-1 truncate font-mono text-xs app-muted">
                      {session.symbols} · {session.dateRange}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      session.status === "Completed"
                        ? "bg-brand-400/10 text-brand-300"
                        : "bg-amber-400/10 text-amber-300"
                    }`}
                  >
                    {session.status}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-[11px] app-muted">
                      <span>{session.updatedLabel}</span>
                      <span>{session.progress.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${session.progress}%` }}
                      />
                    </div>
                  </div>
                  <p
                    className={`font-mono text-sm font-semibold ${
                      session.pnl >= 0 ? "text-brand-300" : "text-bear"
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
        </>
      )}
    </div>
  );
}
