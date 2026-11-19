import type { Prisma } from "@/generated/prisma/client";
import { Headphones } from "lucide-react";

import { ReplyLauncher } from "@/components/support/team/ReplyLauncher";
import { ConversationHeader } from "@/components/support/team/ConversationHeader";
import {
  ConversationList,
  SORT_OPTIONS,
} from "@/components/support/team/ConversationList";
import { DetailsPanel } from "@/components/support/team/DetailsPanel";
import { MessageThread } from "@/components/support/team/MessageThread";
import { QueueRail } from "@/components/support/team/QueueRail";
import { prisma } from "@/lib/db";
import { requireSupportAgent } from "@/lib/support";

const ACTIVE_STATUSES = [
  "new",
  "open",
  "active",
  "waiting_customer",
  "waiting_support",
] as const;

const QUEUE_LABELS: Record<string, string> = {
  waiting: "Inbox",
  customer: "Waiting on customer",
  starred: "Starred",
  sent: "Sent",
  mine: "Assigned to me",
  snoozed: "Snoozed",
  resolved: "Resolved",
  all: "All conversations",
  unassigned: "Unassigned",
};

function queueWhere(queue: string, agentId: string): Prisma.SupportConversationWhereInput {
  if (queue === "mine") {
    return { assignedAgentId: agentId, status: { in: [...ACTIVE_STATUSES] } };
  }
  if (queue === "snoozed") return { status: "snoozed" };
  if (queue === "customer") return { status: "waiting_customer" };
  if (queue === "starred") return { starred: true };
  if (queue === "sent") {
    return { messages: { some: { senderType: "agent", visibility: { not: "internal" } } } };
  }
  if (queue === "resolved") return { status: { in: ["resolved", "closed"] } };
  if (queue === "all") return {};
  if (queue === "unassigned") {
    return { assignedAgentId: null, status: { in: [...ACTIVE_STATUSES] } };
  }
  // An unread customer message must stay visible even if its conversation was
  // moved to another queue before an agent read it.
  return { OR: [
    { status: { in: ["new", "open", "waiting_support"] } },
    { agentUnreadCount: { gt: 0 } },
  ] };
}

function orderFor(sort: string): Prisma.SupportConversationOrderByWithRelationInput[] {
  if (sort === "oldest") return [{ lastMessageAt: "asc" }];
  if (sort === "priority") return [{ priority: "desc" }, { lastMessageAt: "desc" }];
  if (sort === "unread") return [{ agentUnreadCount: "desc" }, { lastMessageAt: "desc" }];
  return [{ lastMessageAt: "desc" }];
}

function parseContext(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function loadConversation(id: string) {
  return prisma.supportConversation.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      subject: true,
      starred: true,
      status: true,
      priority: true,
      category: true,
      channel: true,
      createdAt: true,
      customerName: true,
      customerEmail: true,
      assignedAgentId: true,
      assignedAgentName: true,
      satisfactionScore: true,
      linkedSessionId: true,
      contextJson: true,
      tags: { select: { tag: { select: { id: true, name: true } } } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          senderType: true,
          senderName: true,
          visibility: true,
          body: true,
          createdAt: true,
          deletedAt: true,
          metadataJson: true,
          // Never select attachment `data` here: the bytes belong to the
          // download route, not to every inbox render.
          attachments: { select: { id: true, fileName: true, size: true } },
        },
      },
    },
  });
}

export default async function SupportTeamPage(props: {
  searchParams?: Promise<{
    queue?: string;
    conversation?: string;
    q?: string;
    sort?: string;
    label?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const { agent } = await requireSupportAgent();
  const queue = searchParams?.queue ?? "waiting";
  const query = searchParams?.q?.trim().slice(0, 120) ?? "";
  const requestedSort = searchParams?.sort ?? "recent";
  const sort = SORT_OPTIONS.some((option) => option.id === requestedSort)
    ? requestedSort
    : "recent";
  const readOnly = agent.role === "viewer";

  const label = searchParams?.label?.slice(0, 40) || null;
  const queueBase = queueWhere(queue, agent.id);
  const base: Prisma.SupportConversationWhereInput = label
    ? { AND: [queueBase, { tags: { some: { tagId: label } } }] }
    : queueBase;
  const where: Prisma.SupportConversationWhereInput = query
    ? {
        AND: [
          base,
          {
            OR: [
              { subject: { contains: query, mode: "insensitive" } },
              { customerName: { contains: query, mode: "insensitive" } },
              { customerEmail: { contains: query, mode: "insensitive" } },
              { messages: { some: { body: { contains: query, mode: "insensitive" } } } },
            ],
          },
        ],
      }
    : base;

  // In parallel, not in a $transaction: a transaction runs its queries one by
  // one on a single connection, which cost ~270 ms of the render on every
  // click. Ten independent reads do not need one snapshot. The selected
  // conversation loads alongside them whenever the URL names it.
  const selectedFromUrl = searchParams?.conversation ?? null;
  const [
    [
      conversations,
      queueCount,
      waitingCount,
      mineCount,
      snoozedCount,
      resolvedCount,
      allCount,
      agents,
      savedReplies,
      unreadTotal,
      starredCount,
      customerCount,
      labels,
    ],
    preloaded,
  ] = await Promise.all([Promise.all([
      prisma.supportConversation.findMany({
        where,
        orderBy: orderFor(sort),
        take: 50,
        select: {
          id: true,
          subject: true,
          customerName: true,
          customerEmail: true,
          status: true,
          priority: true,
          starred: true,
          agentUnreadCount: true,
          createdAt: true,
          lastMessageAt: true,
          firstResponseAt: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true },
          },
          tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
          _count: { select: { messages: true } },
        },
      }),
      prisma.supportConversation.count({ where }),
      // Five cheap counts for the rail badges, in place of the 1,000
      // conversation rows the old operations panel loaded on every render.
      prisma.supportConversation.count({ where: queueWhere("waiting", agent.id) }),
      prisma.supportConversation.count({ where: queueWhere("mine", agent.id) }),
      prisma.supportConversation.count({ where: queueWhere("snoozed", agent.id) }),
      prisma.supportConversation.count({ where: queueWhere("resolved", agent.id) }),
      prisma.supportConversation.count({}),
      prisma.supportAgent.findMany({
        where: { active: true },
        orderBy: { displayName: "asc" },
        select: { id: true, displayName: true },
      }),
      prisma.supportSavedReply.findMany({
        where: { active: true },
        orderBy: { title: "asc" },
        take: 30,
        select: { id: true, title: true, body: true },
      }),
      // Total unread customer messages: the notification chime watches this
      // number across the poller's re-renders.
      prisma.supportConversation.aggregate({ _sum: { agentUnreadCount: true } }),
      prisma.supportConversation.count({ where: queueWhere("starred", agent.id) }),
      prisma.supportConversation.count({ where: queueWhere("customer", agent.id) }),
      prisma.supportTag.findMany({
        where: { conversations: { some: {} } },
        orderBy: { name: "asc" },
        take: 30,
        select: { id: true, name: true, color: true },
      }),
    ]), selectedFromUrl ? loadConversation(selectedFromUrl) : null]);

  const queueCounts = {
    waiting: waitingCount,
    mine: mineCount,
    starred: starredCount,
    snoozed: snoozedCount,
    resolved: resolvedCount,
    all: allCount,
  };

  // Gmail-style: the list fills the screen until a conversation is opened.
  const selected = selectedFromUrl ? preloaded : null;

  const customer = selected?.userId
    ? await prisma.userProfile.findUnique({
        where: { id: selected.userId },
        select: {
          email: true,
          displayName: true,
          billingPlan: true,
          billingStatus: true,
          createdAt: true,
          sessions: {
            orderBy: { updatedAt: "desc" },
            take: 5,
            select: {
              id: true,
              symbol: true,
              timeframe: true,
              status: true,
              updatedAt: true,
            },
          },
        },
      })
    : null;

  const now = Date.now();
  const listHref = `/support-team?queue=${queue}&sort=${sort}${
    query ? `&q=${encodeURIComponent(query)}` : ""
  }${label ? `&label=${label}` : ""}`;
  const linkedSession =
    customer?.sessions.find((session) => session.id === selected?.linkedSessionId) ??
    null;

  return (
    <main className="flex h-full overflow-hidden">
      <QueueRail
        queue={queue}
        counts={queueCounts}
        unread={unreadTotal._sum.agentUnreadCount ?? 0}
        labels={labels}
        activeLabel={label}
      />

      {!selectedFromUrl ? (
        <ConversationList
          conversations={conversations}
          queue={queue}
          queueLabel={
            label
              ? labels.find((item) => item.id === label)?.name ?? "Label"
              : QUEUE_LABELS[queue] ?? "Conversations"
          }
          queueCount={queueCount}
          query={query}
          sort={sort}
          label={label}
          now={now}
          readOnly={readOnly}
          tabCounts={{ waiting: waitingCount, customer: customerCount }}
        />
      ) : (
        <section className="mb-3 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--app-panel)] lg:mr-3 lg:mt-3 lg:rounded-2xl">
          {selected ? (
            <>
              <ConversationHeader
                conversation={selected}
                agentId={agent.id}
                backHref={listHref}
                readOnly={readOnly}
                details={
                  <DetailsPanel
                    conversation={selected}
                    customer={customer}
                    context={parseContext(selected.contextJson)}
                    agents={agents}
                    linkedSession={linkedSession}
                    readOnly={readOnly}
                  />
                }
              />
              <MessageThread
                conversationId={selected.id}
                subject={selected.subject}
                customerEmail={selected.customerEmail}
                messages={selected.messages}
                now={now}
              />
              {readOnly ? (
                <div className="shrink-0 border-t app-border px-6 py-5">
                  <p className="mx-auto max-w-[800px] rounded-xl border app-border bg-[var(--app-panel-2)] px-4 py-3 text-center text-xs app-muted">
                    Your support role is read-only, so replies are disabled.
                  </p>
                </div>
              ) : (
                <ReplyLauncher
                  key={selected.id}
                  conversationId={selected.id}
                  customerName={selected.customerName || "the customer"}
                  channel={selected.channel}
                  savedReplies={savedReplies}
                  closed={selected.status === "closed"}
                />
              )}
            </>
          ) : (
            <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
              <div>
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/[0.05]">
                  <Headphones size={20} aria-hidden className="app-muted" />
                </span>
                <p className="mt-3 text-sm font-medium">This conversation no longer exists</p>
                <a href={listHref} className="mt-2 inline-block text-xs text-brand-200 underline">
                  Back to the inbox
                </a>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
