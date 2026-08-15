import {
  CheckCircle2,
  Clock,
  Inbox,
  Layers,
  Settings,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";

import { SupportTeamRefresh } from "@/components/support/SupportTeamRefresh";

export type QueueCounts = {
  waiting: number;
  mine: number;
  snoozed: number;
  resolved: number;
  all: number;
};

const QUEUES = [
  { id: "waiting", label: "Inbox", icon: Inbox },
  { id: "mine", label: "Assigned to me", icon: UserRoundCheck },
  { id: "snoozed", label: "Snoozed", icon: Clock },
  { id: "resolved", label: "Resolved", icon: CheckCircle2 },
  { id: "all", label: "All conversations", icon: Layers },
] as const;

/**
 * Navigation only. Operations metrics, SLA statistics, agent workload and team
 * access management deliberately do not live beside an open customer
 * conversation; account administration stays in /admin.
 */
export function QueueRail({
  queue,
  counts,
  query,
}: {
  queue: string;
  counts: QueueCounts;
  query: string;
}) {
  const suffix = query ? `&q=${encodeURIComponent(query)}` : "";
  return (
    <nav
      aria-label="Support queues"
      className="hidden w-[72px] shrink-0 flex-col border-r app-border bg-[var(--app-panel-2)] lg:flex min-[1440px]:w-[216px]"
    >
      <div className="flex h-16 shrink-0 items-center justify-center gap-2 border-b app-border px-3 min-[1440px]:justify-between min-[1440px]:px-4">
        <span className="hidden text-sm font-semibold min-[1440px]:inline">
          Team inbox
        </span>
        <SupportTeamRefresh />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 min-[1440px]:p-3">
        {QUEUES.map(({ id, label, icon: Icon }) => {
          const active = queue === id;
          const count = counts[id];
          return (
            <Link
              key={id}
              href={`/support-team?queue=${id}${suffix}`}
              title={label}
              aria-current={active ? "page" : undefined}
              className={`relative mb-0.5 flex items-center justify-center rounded-lg px-2 py-2.5 text-xs font-medium transition-colors min-[1440px]:justify-start min-[1440px]:gap-2.5 min-[1440px]:px-3 ${
                active
                  ? "bg-brand-400/[0.09] text-brand-200"
                  : "app-muted hover:bg-white/[0.04] hover:text-[var(--app-text)]"
              }`}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-400"
                />
              )}
              <Icon size={16} aria-hidden className="shrink-0" />
              <span className="hidden min-w-0 flex-1 truncate min-[1440px]:inline">
                {label}
              </span>
              {count > 0 && (
                <span
                  className={`absolute right-1.5 top-1.5 rounded-full px-1.5 text-[10px] font-semibold min-[1440px]:static min-[1440px]:translate-y-0 ${
                    active ? "bg-brand-400/15 text-brand-200" : "bg-white/[0.06] app-muted"
                  }`}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="shrink-0 border-t app-border p-2 min-[1440px]:p-3">
        <Link
          href="/admin"
          title="Admin settings"
          className="flex items-center justify-center rounded-lg px-2 py-2.5 text-xs font-medium app-muted transition-colors hover:bg-white/[0.04] hover:text-[var(--app-text)] min-[1440px]:justify-start min-[1440px]:gap-2.5 min-[1440px]:px-3"
        >
          <Settings size={16} aria-hidden className="shrink-0" />
          <span className="hidden min-[1440px]:inline">Settings and admin</span>
        </Link>
      </div>
    </nav>
  );
}
