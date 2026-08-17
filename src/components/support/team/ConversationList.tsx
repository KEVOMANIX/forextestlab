import { Inbox, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { NewConversation } from "./NewConversation";
import { PopoverMenu } from "./controls";
import {
  initials,
  isOverdue,
  shortAgo,
  statusLabel,
  statusTone,
} from "./format";

export type ListConversation = {
  id: string;
  subject: string;
  customerName: string | null;
  customerEmail: string | null;
  status: string;
  priority: string;
  agentUnreadCount: number;
  createdAt: Date;
  lastMessageAt: Date;
  firstResponseAt: Date | null;
  messages: Array<{ body: string }>;
};

export const SORT_OPTIONS = [
  { id: "recent", label: "Newest activity" },
  { id: "oldest", label: "Oldest activity" },
  { id: "priority", label: "Priority first" },
  { id: "unread", label: "Unread first" },
] as const;

export function ConversationList({
  conversations,
  queue,
  queueLabel,
  queueCount,
  query,
  sort,
  selectedId,
  now,
  mobileHidden,
}: {
  conversations: ListConversation[];
  queue: string;
  queueLabel: string;
  queueCount: number;
  query: string;
  sort: string;
  selectedId: string | null;
  now: number;
  mobileHidden: boolean;
}) {
  const sortLabel =
    SORT_OPTIONS.find((option) => option.id === sort)?.label ?? SORT_OPTIONS[0].label;
  return (
    <div
      className={`min-h-0 min-w-0 flex-1 flex-col border-r app-border bg-[var(--app-panel)] lg:flex lg:w-[300px] lg:flex-none min-[1440px]:w-[336px] ${
        mobileHidden ? "hidden" : "flex"
      }`}
    >
      <div className="shrink-0 border-b app-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{queueLabel}</h1>
            <p className="mt-0.5 text-[11px] app-muted">
              {query
                ? `${conversations.length} result${conversations.length === 1 ? "" : "s"} for “${query}”`
                : conversations.length < queueCount
                  ? `Showing ${conversations.length} of ${queueCount} in this queue`
                  : `${queueCount} conversation${queueCount === 1 ? "" : "s"} in this queue`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NewConversation />
            <PopoverMenu
              label={`Sort: ${sortLabel}`}
              align="right"
              width="w-52"
              icon={<SlidersHorizontal size={14} aria-hidden />}
            >
              <p className="px-2.5 py-1.5 text-[11px] app-muted">Sort conversations</p>
              {SORT_OPTIONS.map((option) => (
                <Link
                  key={option.id}
                  href={`/support-team?queue=${queue}&sort=${option.id}${
                    query ? `&q=${encodeURIComponent(query)}` : ""
                  }`}
                  className={`block rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-white/[0.05] ${
                    sort === option.id ? "text-brand-200" : ""
                  }`}
                >
                  {option.label}
                </Link>
              ))}
            </PopoverMenu>
          </div>
        </div>
        <form className="relative mt-3">
          <input type="hidden" name="queue" value={queue} />
          <input type="hidden" name="sort" value={sort} />
          <Search
            size={13}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 app-muted"
          />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search conversations"
            className="app-input w-full py-2 pl-8 text-xs"
          />
        </form>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.map((conversation) => {
          const active = selectedId === conversation.id;
          const tone = statusTone(conversation.status);
          const overdue = isOverdue(conversation, now);
          const customer =
            conversation.customerName || conversation.customerEmail || "Guest";
          return (
            <Link
              key={conversation.id}
              href={`/support-team?queue=${queue}&sort=${sort}${
                query ? `&q=${encodeURIComponent(query)}` : ""
              }&conversation=${conversation.id}`}
              className={`flex gap-3 border-b app-border border-l-[3px] px-4 py-3 transition-colors ${
                active
                  ? "border-l-brand-400 bg-brand-400/[0.06]"
                  : "border-l-transparent hover:bg-white/[0.025]"
              }`}
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[11px] font-semibold app-muted">
                {initials(customer)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <strong className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                    {conversation.subject}
                  </strong>
                  <span className="shrink-0 text-[11px] app-muted">
                    {shortAgo(conversation.lastMessageAt, now)}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] app-muted">
                  {customer}
                </span>
                <span className="mt-1 block truncate text-[11px] leading-4 app-muted">
                  {conversation.messages[0]?.body || "No messages yet"}
                </span>
                <span className="mt-1.5 flex items-center gap-2">
                  <span className={`flex items-center gap-1.5 text-[11px] ${tone.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                    <span className="capitalize">{statusLabel(conversation.status)}</span>
                  </span>
                  {overdue && (
                    <span className="rounded px-1.5 text-[11px] font-semibold text-bear">
                      Overdue
                    </span>
                  )}
                  {conversation.priority === "urgent" && !overdue && (
                    <span className="rounded px-1.5 text-[11px] font-semibold text-bear">
                      Urgent
                    </span>
                  )}
                  {conversation.agentUnreadCount > 0 && (
                    <span className="ml-auto rounded-full bg-brand-400/15 px-1.5 text-[11px] font-semibold text-brand-200">
                      {conversation.agentUnreadCount}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          );
        })}

        {!conversations.length && (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white/[0.05]">
              <Inbox size={19} aria-hidden className="app-muted" />
            </span>
            <p className="mt-3 text-xs font-medium">
              {query ? "No conversations match that search" : "This queue is clear"}
            </p>
            <p className="mt-1 text-[11px] app-muted">
              {query
                ? "Try a different name, email or phrase."
                : "New customer messages will appear here."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
