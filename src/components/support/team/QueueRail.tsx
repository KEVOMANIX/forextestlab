import {
  CheckCircle2,
  Clock,
  Inbox,
  Layers,
  Send,
  Star,
  Tag,
  UserRoundCheck,
} from "lucide-react";
import { SettingsIcon } from "@/components/icons/SettingsIcon";
import Link from "next/link";

import { SupportTeamRefresh } from "@/components/support/SupportTeamRefresh";
import { InboxSound } from "./InboxSound";
import { NewConversation } from "./NewConversation";

export type QueueCounts = {
  waiting: number;
  mine: number;
  starred: number;
  snoozed: number;
  resolved: number;
  all: number;
};

const QUEUES = [
  { id: "waiting", label: "Inbox", icon: Inbox },
  { id: "mine", label: "Assigned to me", icon: UserRoundCheck },
  { id: "starred", label: "Starred", icon: Star },
  { id: "snoozed", label: "Snoozed", icon: Clock },
  { id: "resolved", label: "Resolved", icon: CheckCircle2 },
  { id: "sent", label: "Sent", icon: Send },
  { id: "all", label: "All conversations", icon: Layers },
] as const;

export type RailLabel = { id: string; name: string; color: string };

/**
 * Gmail-style navigation: a compose button, the queues with their counts, and
 * the conversation labels (support tags) underneath. Account administration
 * stays in /admin.
 */
export function QueueRail({
  queue,
  counts,
  unread,
  labels,
  activeLabel,
}: {
  queue: string;
  counts: QueueCounts;
  unread: number;
  labels: RailLabel[];
  activeLabel: string | null;
}) {
  const item = (active: boolean) =>
    `flex items-center gap-3 rounded-r-full py-2 pl-5 pr-4 text-[13px] transition-colors ${
      active
        ? "bg-brand-400/[0.14] font-semibold text-brand-200"
        : "app-muted hover:bg-white/[0.05] hover:text-[var(--app-text)]"
    }`;

  return (
    <nav
      aria-label="Support queues"
      className="hidden w-[232px] shrink-0 flex-col bg-[var(--app-bg)] lg:flex"
    >
      <div className="px-3 pb-3 pt-4">
        <NewConversation variant="compose" />
        <span className="mt-2 flex items-center gap-1 pl-2">
          <SupportTeamRefresh />
          <InboxSound unread={unread} />
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-3 pr-3">
        {QUEUES.map(({ id, label, icon: Icon }) => {
          const active = !activeLabel && (queue === id || (id === "waiting" && queue === "customer"));
          const count = id in counts ? counts[id as keyof QueueCounts] : 0;
          return (
            <Link
              key={id}
              href={`/support-team?queue=${id}`}
              aria-current={active ? "page" : undefined}
              className={item(active)}
            >
              <Icon size={17} aria-hidden className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {count > 0 && id !== "all" && id !== "resolved" && (
                <span className="text-[12px] font-semibold">{count > 999 ? "999+" : count}</span>
              )}
            </Link>
          );
        })}

        <div className="mb-1 mt-5 flex items-center justify-between pl-5 pr-2 text-[13px] font-semibold">
          Labels
        </div>
        {labels.length ? (
          labels.map((label) => (
            <Link
              key={label.id}
              href={`/support-team?queue=all&label=${label.id}`}
              aria-current={activeLabel === label.id ? "page" : undefined}
              className={item(activeLabel === label.id)}
            >
              <Tag size={15} aria-hidden className="shrink-0" style={{ color: label.color }} />
              <span className="min-w-0 flex-1 truncate capitalize">{label.name}</span>
            </Link>
          ))
        ) : (
          <p className="pl-5 text-[12px] app-muted">Labels added to conversations show here.</p>
        )}
      </div>

      <div className="shrink-0 pb-3 pr-3">
        <Link href="/admin" className={item(false)}>
          <SettingsIcon size={17} aria-hidden className="shrink-0" />
          <span>Settings and admin</span>
        </Link>
      </div>
    </nav>
  );
}
