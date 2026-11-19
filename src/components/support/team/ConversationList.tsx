import { CheckCircle2, Hourglass, Inbox, Search, SlidersHorizontal, Star } from "lucide-react";
import Link from "next/link";

import { toggleConversationStar } from "@/app/support-team/actions";
import { NewConversation } from "./NewConversation";
import { PopoverMenu } from "./controls";
import { cleanMessageBody, isOverdue } from "./format";

export type ListConversation = {
  id: string;
  subject: string;
  customerName: string | null;
  customerEmail: string | null;
  status: string;
  priority: string;
  starred: boolean;
  agentUnreadCount: number;
  createdAt: Date;
  lastMessageAt: Date;
  firstResponseAt: Date | null;
  messages: Array<{ body: string }>;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
  _count: { messages: number };
};

export const SORT_OPTIONS = [
  { id: "recent", label: "Newest activity" },
  { id: "oldest", label: "Oldest activity" },
  { id: "priority", label: "Priority first" },
  { id: "unread", label: "Unread first" },
] as const;

const TABS = [
  { id: "waiting", label: "Needs reply", icon: Inbox },
  { id: "customer", label: "Waiting on customer", icon: Hourglass },
  { id: "resolved", label: "Resolved", icon: CheckCircle2 },
] as const;

/** Gmail-style time: clock time today, "Nov 18" this year, a full date before. */
function rowTime(value: Date, now: number) {
  const today = new Date(now);
  if (value.toDateString() === today.toDateString()) {
    return value.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: value.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export function ConversationList({
  conversations,
  queue,
  queueLabel,
  queueCount,
  query,
  sort,
  label,
  now,
  readOnly,
  tabCounts,
}: {
  conversations: ListConversation[];
  queue: string;
  queueLabel: string;
  queueCount: number;
  query: string;
  sort: string;
  label: string | null;
  now: number;
  readOnly: boolean;
  tabCounts: { waiting: number; customer: number };
}) {
  const sortLabel =
    SORT_OPTIONS.find((option) => option.id === sort)?.label ?? SORT_OPTIONS[0].label;
  const extra = `${query ? `&q=${encodeURIComponent(query)}` : ""}${label ? `&label=${label}` : ""}`;
  const showTabs = !label && TABS.some((tab) => tab.id === queue);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 px-3 pb-2 pt-3 lg:pl-0">
        <form className="relative max-w-[720px] flex-1">
          <input type="hidden" name="queue" value={queue} />
          <input type="hidden" name="sort" value={sort} />
          {label && <input type="hidden" name="label" value={label} />}
          <Search
            size={17}
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 app-muted"
          />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search conversations, customers, emails"
            className="w-full rounded-full border-0 bg-[var(--app-panel-2)] py-3 pl-12 pr-4 text-sm outline-none placeholder:text-slate-500 focus:bg-[var(--app-panel-solid)] focus:ring-1 focus:ring-brand-400/40"
          />
        </form>
        <span className="lg:hidden">
          <NewConversation />
        </span>
      </div>

      <div className="mx-0 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--app-panel)] lg:mr-3 lg:rounded-2xl">
        <div className="flex shrink-0 items-center gap-3 border-b app-border px-4 py-2 text-xs app-muted">
          <span className="font-semibold text-[var(--app-text)]">{queueLabel}</span>
          <PopoverMenu
            label={`Sort: ${sortLabel}`}
            align="left"
            width="w-52"
            icon={<SlidersHorizontal size={14} aria-hidden />}
          >
            <p className="px-2.5 py-1.5 text-[11px] app-muted">Sort conversations</p>
            {SORT_OPTIONS.map((option) => (
              <Link
                key={option.id}
                href={`/support-team?queue=${queue}&sort=${option.id}${extra}`}
                className={`block rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-white/[0.05] ${
                  sort === option.id ? "text-brand-200" : ""
                }`}
              >
                {option.label}
              </Link>
            ))}
          </PopoverMenu>
          <span className="ml-auto">
            {query
              ? `${conversations.length} result${conversations.length === 1 ? "" : "s"} for “${query}”`
              : queueCount
                ? `1–${conversations.length} of ${queueCount}`
                : "0"}
          </span>
        </div>

        {showTabs && (
          <div className="flex shrink-0 overflow-x-auto border-b app-border">
            {TABS.map(({ id, label: tabLabel, icon: Icon }) => {
              const active = queue === id;
              const count = id === "resolved" ? 0 : tabCounts[id];
              return (
                <Link
                  key={id}
                  href={`/support-team?queue=${id}&sort=${sort}${extra}`}
                  className={`flex min-w-[190px] items-center gap-3 border-b-[3px] px-5 py-3 text-[13px] transition-colors ${
                    active
                      ? "border-brand-400 font-semibold text-brand-200"
                      : "border-transparent app-muted hover:bg-white/[0.03]"
                  }`}
                >
                  <Icon size={16} aria-hidden />
                  {tabLabel}
                  {count > 0 && (
                    <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-surface-950">
                      {count} {id === "waiting" ? "new" : ""}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations.map((conversation) => {
            const unread = conversation.agentUnreadCount > 0;
            const overdue = isOverdue(conversation, now);
            const customer =
              conversation.customerName || conversation.customerEmail || "Guest";
            const count = conversation._count.messages;
            return (
              <div
                key={conversation.id}
                className={`group flex items-center border-b app-border text-[13px] transition-shadow hover:relative hover:z-10 hover:shadow-[0_1px_3px_rgba(0,0,0,0.18)] ${
                  unread ? "bg-[var(--app-panel)]" : "bg-[var(--app-panel-2)]"
                }`}
              >
                <form action={toggleConversationStar} className="shrink-0 pl-3">
                  <input type="hidden" name="conversationId" value={conversation.id} />
                  <input type="hidden" name="starred" value={String(!conversation.starred)} />
                  <button
                    type="submit"
                    disabled={readOnly}
                    aria-label={conversation.starred ? "Unstar" : "Star"}
                    className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-white/[0.06] disabled:cursor-default"
                  >
                    <Star
                      size={16}
                      aria-hidden
                      className={conversation.starred ? "fill-amber-300 text-amber-300" : "app-muted"}
                    />
                  </button>
                </form>
                <Link
                  href={`/support-team?queue=${queue}&sort=${sort}${extra}&conversation=${conversation.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-2 pr-4"
                >
                  <span
                    className={`w-[120px] shrink-0 truncate sm:w-[190px] ${unread ? "font-bold" : "app-muted"}`}
                  >
                    {customer}
                    {count > 1 && <span className="ml-1 font-normal app-muted">{count}</span>}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {conversation.tags.map(({ tag }) => (
                      <span
                        key={tag.id}
                        className="mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold capitalize"
                        style={{ color: tag.color, backgroundColor: `${tag.color}22` }}
                      >
                        {tag.name}
                      </span>
                    ))}
                    {(overdue || conversation.priority === "urgent") && (
                      <span className="mr-1.5 rounded bg-loss/15 px-1.5 py-0.5 text-[11px] font-semibold text-loss">
                        {overdue ? "Overdue" : "Urgent"}
                      </span>
                    )}
                    <span className={unread ? "font-bold" : ""}>{conversation.subject}</span>
                    <span className="app-muted">
                      {" - "}
                      {cleanMessageBody(conversation.messages[0]?.body ?? "").replace(/\s+/g, " ") || "No messages yet"}
                    </span>
                  </span>
                  <span
                    className={`w-[70px] shrink-0 text-right text-xs ${unread ? "font-bold" : "app-muted"}`}
                  >
                    {rowTime(conversation.lastMessageAt, now)}
                  </span>
                </Link>
              </div>
            );
          })}

          {!conversations.length && (
            <div className="px-6 py-20 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white/[0.05]">
                <Inbox size={19} aria-hidden className="app-muted" />
              </span>
              <p className="mt-3 text-sm font-medium">
                {query ? "No conversations match that search" : "Nothing here"}
              </p>
              <p className="mt-1 text-xs app-muted">
                {query
                  ? "Try a different name, email or phrase."
                  : "New customer messages will appear in the Inbox."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
