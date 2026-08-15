import type { Prisma } from "@/generated/prisma/client";
import { Headphones } from "lucide-react";

import { Composer } from "@/components/support/team/Composer";
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
  if (queue === "resolved") return { status: { in: ["resolved", "closed"] } };
  if (queue === "all") return {};
  if (queue === "unassigned") {
    return { assignedAgentId: null, status: { in: [...ACTIVE_STATUSES] } };
  }
  return { status: { in: ["new", "open", "waiting_support"] } };
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

export default async function SupportTeamPage(props: {
  searchParams?: Promise<{
    queue?: string;
    conversation?: string;
    q?: string;
    sort?: string;
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

  const base = queueWhere(queue, agent.id);
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

  const [
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
  ] = await prisma.$transaction([
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
          agentUnreadCount: true,
          createdAt: true,
          lastMessageAt: true,
          firstResponseAt: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true },
          },
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
    ]);

  const queueCounts = {
    waiting: waitingCount,
    mine: mineCount,
    snoozed: snoozedCount,
    resolved: resolvedCount,
    all: allCount,
  };

  const selectedId = searchParams?.conversation ?? conversations[0]?.id ?? null;
  const selected = selectedId
    ? await prisma.supportConversation.findUnique({
        where: { id: selectedId },
        select: {
          id: true,
          userId: true,
          subject: true,
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
              // Never select attachment `data` here: the bytes belong to the
              // download route, not to every inbox render.
              attachments: { select: { id: true, fileName: true, size: true } },
            },
          },
        },
      })
    : null;

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
  const threadFocus = Boolean(searchParams?.conversation);
  const listHref = `/support-team?queue=${queue}&sort=${sort}${
    query ? `&q=${encodeURIComponent(query)}` : ""
  }`;
  const linkedSession =
    customer?.sessions.find((session) => session.id === selected?.linkedSessionId) ??
    null;

  return (
    <main className="flex h-full overflow-hidden">
      <QueueRail
        queue={queue}
        counts={queueCounts}
        query={query}
        unread={unreadTotal._sum.agentUnreadCount ?? 0}
      />

      <ConversationList
        conversations={conversations}
        queue={queue}
        queueLabel={QUEUE_LABELS[queue] ?? "Conversations"}
        queueCount={queueCount}
        query={query}
        sort={sort}
        selectedId={selectedId}
        now={now}
        mobileHidden={threadFocus}
      />

      <section
        className={`min-h-0 min-w-0 flex-1 flex-col bg-[var(--app-bg)] lg:flex ${
          threadFocus ? "flex" : "hidden"
        }`}
      >
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
              <Composer
                conversationId={selected.id}
                customerName={selected.customerName || "the customer"}
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
              <p className="mt-3 text-sm font-medium">
                {conversations.length
                  ? "Select a conversation"
                  : "Nothing waiting in this queue"}
              </p>
              <p className="mt-1 text-xs app-muted">
                {conversations.length
                  ? "Choose a customer from the list to read and reply."
                  : "Switch queues from the rail to see other conversations."}
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
