import type { Prisma } from "@prisma/client";
import {
  CheckCircle2,
  Download,
  Headphones,
  Inbox,
  MessageSquareText,
  Search,
  Send,
  StickyNote,
  Tag,
  UserRoundCheck,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";

import {
  addConversationTag,
  addInternalNote,
  addSupportAgent,
  assignConversation,
  replyToConversation,
  saveReplyTemplate,
  snoozeConversation,
  updateConversation,
} from "./actions";
import { SupportTeamRefresh } from "@/components/support/SupportTeamRefresh";
import { prisma } from "@/lib/db";
import { formatNewYorkDateTime } from "@/lib/date-time";
import {
  requireSupportAgent,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
} from "@/lib/support";

const activeStatuses = [
  "new",
  "open",
  "active",
  "waiting_customer",
  "waiting_support",
] as const;

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function duration(ms: number | null) {
  if (ms === null) return "Not available";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
}

function parseContext(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function slaHours(priority: string) {
  return priority === "urgent"
    ? 1
    : priority === "high"
      ? 2
      : priority === "low"
        ? 8
        : 4;
}

export default async function SupportTeamPage({
  searchParams,
}: {
  searchParams?: {
    queue?: string;
    conversation?: string;
    q?: string;
  };
}) {
  const { agent } = await requireSupportAgent();
  const queue = searchParams?.queue ?? "waiting";
  const query = searchParams?.q?.trim().slice(0, 120) ?? "";
  const baseWhere: Prisma.SupportConversationWhereInput =
    queue === "mine"
      ? {
          assignedAgentId: agent.id,
          status: { in: [...activeStatuses] },
        }
      : queue === "waiting"
        ? { status: { in: ["new", "open", "waiting_support"] } }
        : queue === "snoozed"
          ? { status: "snoozed" }
          : queue === "resolved"
            ? { status: { in: ["resolved", "closed"] } }
            : queue === "all"
              ? {}
              : {
                  assignedAgentId: null,
                  status: { in: [...activeStatuses] },
                };
  const where: Prisma.SupportConversationWhereInput = query
    ? {
        AND: [
          baseWhere,
          {
            OR: [
              { subject: { contains: query, mode: "insensitive" } },
              { customerName: { contains: query, mode: "insensitive" } },
              { customerEmail: { contains: query, mode: "insensitive" } },
              {
                messages: {
                  some: { body: { contains: query, mode: "insensitive" } },
                },
              },
            ],
          },
        ],
      }
    : baseWhere;

  const [conversations, agents, savedReplies, active, resolved] =
    await prisma.$transaction([
      prisma.supportConversation.findMany({
        where,
        orderBy: [{ priority: "desc" }, { lastMessageAt: "desc" }],
        take: 100,
        include: {
          assignedAgent: true,
          tags: { include: { tag: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true, senderType: true },
          },
        },
      }),
      prisma.supportAgent.findMany({
        where: { active: true },
        orderBy: { displayName: "asc" },
      }),
      prisma.supportSavedReply.findMany({
        where: { active: true },
        orderBy: { title: "asc" },
        take: 30,
      }),
      prisma.supportConversation.findMany({
        where: { status: { in: [...activeStatuses, "snoozed"] } },
        orderBy: { lastMessageAt: "desc" },
        take: 500,
        select: {
          id: true,
          assignedAgentId: true,
          priority: true,
          createdAt: true,
          firstResponseAt: true,
          agentUnreadCount: true,
        },
      }),
      prisma.supportConversation.findMany({
        where: { status: { in: ["resolved", "closed"] } },
        orderBy: { resolvedAt: "desc" },
        take: 500,
        select: {
          createdAt: true,
          firstResponseAt: true,
          resolvedAt: true,
          satisfactionScore: true,
        },
      }),
    ]);

  const selectedId =
    searchParams?.conversation ?? conversations[0]?.id ?? null;
  const selected = selectedId
    ? await prisma.supportConversation.findUnique({
        where: { id: selectedId },
        include: {
          assignedAgent: true,
          tags: { include: { tag: true } },
          messages: {
            orderBy: { createdAt: "asc" },
            include: {
              attachments: {
                select: {
                  id: true,
                  fileName: true,
                  mimeType: true,
                  size: true,
                },
              },
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
  const breaches = active.filter(
    (item) =>
      !item.firstResponseAt &&
      now - item.createdAt.getTime() > slaHours(item.priority) * 3_600_000,
  ).length;
  const responseMedian = median(
    resolved.flatMap((item) =>
      item.firstResponseAt
        ? [item.firstResponseAt.getTime() - item.createdAt.getTime()]
        : [],
    ),
  );
  const resolutionMedian = median(
    resolved.flatMap((item) =>
      item.resolvedAt
        ? [item.resolvedAt.getTime() - item.createdAt.getTime()]
        : [],
    ),
  );
  const scores = resolved.flatMap((item) =>
    item.satisfactionScore ? [item.satisfactionScore] : [],
  );
  const satisfaction = scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : null;
  const context = parseContext(selected?.contextJson ?? null);

  const queueLinks = [
    ["waiting", "Inbox", Inbox],
    ["mine", "Assigned to me", UserRoundCheck],
    ["resolved", "Resolved", CheckCircle2],
    ["all", "All conversations", MessageSquareText],
  ] as const;

  return (
    <main className="min-h-[calc(100vh-4rem)]">
      <section className="grid gap-px bg-[var(--app-border)] xl:grid-cols-[260px_minmax(420px,1fr)_330px]">
        <aside className="min-h-[calc(100vh-4rem)] bg-[var(--app-panel-2)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-semibold">Team inbox</h1>
              <p className="mt-1 text-[10px] app-muted">
                {active.length} active conversations
              </p>
            </div>
            <SupportTeamRefresh />
          </div>
          <form className="relative mt-4">
            <input type="hidden" name="queue" value={queue} />
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 app-muted"
            />
            <input
              name="q"
              defaultValue={query}
              placeholder="Search conversations"
              className="app-input w-full py-2 pl-8 text-xs"
            />
          </form>
          <nav className="mt-4 space-y-1">
            {queueLinks.map(([id, label, Icon]) => (
              <Link
                key={id}
                href={`/support-team?queue=${id}`}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold ${
                  queue === id
                    ? "bg-brand-400/12 text-brand-300"
                    : "app-muted hover:bg-white/[0.04]"
                }`}
              >
                <Icon size={14} />
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-6 border-t app-border pt-4">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider app-muted">
              Operations
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <Stat value={String(breaches)} label="SLA breaches" danger={breaches > 0} />
              <Stat value={duration(responseMedian)} label="First response" />
              <Stat value={duration(resolutionMedian)} label="Resolution" />
              <Stat
                value={satisfaction ? satisfaction.toFixed(1) : "—"}
                label="CSAT / 5"
              />
            </div>
          </div>
          <div className="mt-6 border-t app-border pt-4">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider app-muted">
              Agent workload
            </h2>
            <div className="mt-2 space-y-2">
              {agents.map((item) => {
                const count = active.filter(
                  (conversation) =>
                    conversation.assignedAgentId === item.id,
                ).length;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="truncate">{item.displayName}</span>
                    <span className="font-mono app-muted">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="grid min-h-[calc(100vh-4rem)] bg-[var(--app-bg)] lg:grid-cols-[300px_1fr]">
          <div className="border-r app-border">
            <div className="border-b app-border px-4 py-3 text-xs font-semibold">
              {conversations.length} conversation
              {conversations.length === 1 ? "" : "s"}
            </div>
            <div className="max-h-[calc(100vh-7rem)] overflow-y-auto">
              {conversations.map((conversation) => {
                const overdue =
                  !conversation.firstResponseAt &&
                  now - conversation.createdAt.getTime() >
                    slaHours(conversation.priority) * 3_600_000;
                return (
                  <Link
                    key={conversation.id}
                    href={`/support-team?queue=${queue}&conversation=${conversation.id}`}
                    className={`block border-b app-border px-4 py-3 hover:bg-white/[0.035] ${
                      selected?.id === conversation.id
                        ? "bg-brand-400/[0.07]"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          conversation.priority === "urgent"
                            ? "bg-bear"
                            : conversation.agentUnreadCount
                              ? "bg-brand-400"
                              : "bg-slate-600"
                        }`}
                      />
                      <strong className="min-w-0 flex-1 truncate text-xs">
                        {conversation.subject}
                      </strong>
                      {overdue && (
                        <span className="text-[9px] font-bold text-bear">
                          SLA
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[11px] app-muted">
                      {conversation.customerName || conversation.customerEmail}
                    </p>
                    <p className="mt-2 line-clamp-2 text-[10px] leading-4 app-muted">
                      {conversation.messages[0]?.body || "No messages"}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[9px] app-muted">
                      <span className="capitalize">
                        {conversation.status.replaceAll("_", " ")}
                      </span>
                      <span>{formatNewYorkDateTime(conversation.lastMessageAt)}</span>
                    </div>
                  </Link>
                );
              })}
              {!conversations.length && (
                <div className="p-8 text-center text-xs app-muted">
                  This queue is clear.
                </div>
              )}
            </div>
          </div>

          {selected ? (
            <div className="flex min-h-0 flex-col">
              <header className="border-b app-border px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-semibold">
                        {selected.subject}
                      </h2>
                      <span className="rounded bg-white/[0.06] px-2 py-1 text-[9px] capitalize app-muted">
                        {selected.priority}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] app-muted">
                      {selected.customerName} · {selected.customerEmail} ·{" "}
                      {selected.category.replaceAll("_", " ")}
                    </p>
                  </div>
                  <a
                    href={`/api/support/export?conversationId=${selected.id}`}
                    className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"
                  >
                    <Download size={13} />
                    Export
                  </a>
                  {!selected.assignedAgentId ? (
                    <form action={assignConversation}>
                      <input type="hidden" name="conversationId" value={selected.id} />
                      <input type="hidden" name="agentId" value="self" />
                      <button className="btn-primary px-4 py-2 text-xs">
                        <UserPlus size={14} />
                        Join conversation
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border app-border px-3 py-1.5">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-400/15 text-[10px] font-bold text-brand-200">
                        {selected.assignedAgent?.displayName
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0]?.toUpperCase())
                          .join("") || "FT"}
                      </span>
                      <div>
                        <p className="text-[10px] font-semibold">
                          {selected.assignedAgentId === agent.id
                            ? "You joined"
                            : selected.assignedAgent?.displayName}
                        </p>
                        <p className="text-[9px] app-muted">Handling this conversation</p>
                      </div>
                    </div>
                  )}
                  {selected.status !== "resolved" &&
                    selected.status !== "closed" && (
                      <form action={updateConversation}>
                        <input type="hidden" name="conversationId" value={selected.id} />
                        <input type="hidden" name="status" value="resolved" />
                        <button className="btn-secondary px-3 py-2 text-xs">
                          <CheckCircle2 size={13} />
                          Resolve
                        </button>
                      </form>
                    )}
                </div>
              </header>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {selected.messages.map((message) => (
                  <article
                    key={message.id}
                    className={`max-w-[88%] rounded-xl px-3.5 py-3 text-xs ${
                      message.visibility === "internal"
                        ? "mx-auto border border-amber-300/25 bg-amber-300/[0.06]"
                        : message.senderType === "customer"
                          ? "mr-auto bg-[var(--app-panel-2)]"
                          : "ml-auto border border-brand-400/20 bg-brand-400/[0.08]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 text-[9px] app-muted">
                      <strong
                        className={
                          message.visibility === "internal"
                            ? "text-amber-200"
                            : "text-brand-300"
                        }
                      >
                        {message.visibility === "internal"
                          ? `Internal note · ${message.senderName}`
                          : message.senderName}
                      </strong>
                      <span>{formatNewYorkDateTime(message.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap leading-5">
                      {message.deletedAt ? "Message deleted" : message.body}
                    </p>
                    {message.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={`/api/support/attachments/${attachment.id}`}
                        className="mt-2 block rounded-lg border app-border px-3 py-2 text-[10px] text-brand-300"
                      >
                        {attachment.fileName} ·{" "}
                        {Math.ceil(attachment.size / 1_024)} KB
                      </a>
                    ))}
                  </article>
                ))}
              </div>
              <div className="border-t app-border bg-[var(--app-panel)] p-4">
                {savedReplies.length > 0 && (
                  <div className="mb-3 flex gap-2 overflow-x-auto">
                    {savedReplies.map((reply) => (
                      <form key={reply.id} action={replyToConversation}>
                        <input type="hidden" name="conversationId" value={selected.id} />
                        <input type="hidden" name="body" value={reply.body} />
                        <button
                          title={reply.body}
                          className="shrink-0 rounded-full border app-border px-3 py-1.5 text-[10px] hover:border-brand-400/40"
                        >
                          {reply.title}
                        </button>
                      </form>
                    ))}
                  </div>
                )}
                <form action={replyToConversation} className="flex gap-2">
                  <input type="hidden" name="conversationId" value={selected.id} />
                  <textarea
                    name="body"
                    required
                    maxLength={4_000}
                    rows={3}
                    placeholder="Reply to customer…"
                    className="app-input min-w-0 flex-1 resize-none text-xs"
                  />
                  <button className="btn-primary self-end px-4 py-3 text-xs">
                    <Send size={14} /> Send
                  </button>
                </form>
                <form action={addInternalNote} className="mt-2 flex gap-2">
                  <input type="hidden" name="conversationId" value={selected.id} />
                  <input
                    name="body"
                    required
                    maxLength={4_000}
                    placeholder="Add an internal note…"
                    className="app-input min-w-0 flex-1 py-2 text-xs"
                  />
                  <button className="btn-secondary px-3 py-2 text-xs">
                    <StickyNote size={13} /> Note
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="grid place-items-center p-10 text-center">
              <div>
                <Headphones size={30} className="mx-auto text-brand-300" />
                <h2 className="mt-4 font-semibold">Select a conversation</h2>
                <p className="mt-2 text-xs app-muted">
                  Choose a customer request from the inbox.
                </p>
              </div>
            </div>
          )}
        </section>

        <aside className="min-h-[calc(100vh-4rem)] bg-[var(--app-panel-2)] p-4">
          {selected ? (
            <div className="space-y-5">
              <section>
                <h2 className="text-xs font-semibold">Conversation controls</h2>
                <form action={updateConversation} className="mt-3 space-y-2">
                  <input type="hidden" name="conversationId" value={selected.id} />
                  <Field label="Status">
                    <select name="status" defaultValue={selected.status} className="app-input w-full py-2 text-xs">
                      {SUPPORT_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {value.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Priority">
                    <select name="priority" defaultValue={selected.priority} className="app-input w-full py-2 text-xs">
                      {SUPPORT_PRIORITIES.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Category">
                    <select name="category" defaultValue={selected.category} className="app-input w-full py-2 text-xs">
                      {SUPPORT_CATEGORIES.map((value) => (
                        <option key={value} value={value}>
                          {value.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button className="btn-primary w-full justify-center px-3 py-2 text-xs">
                    Save conversation
                  </button>
                </form>
                <form action={snoozeConversation} className="mt-2 flex gap-2">
                  <input type="hidden" name="conversationId" value={selected.id} />
                  <select name="minutes" className="app-input min-w-0 flex-1 py-2 text-xs">
                    <option value="60">1 hour</option>
                    <option value="240">4 hours</option>
                    <option value="1440">Tomorrow</option>
                    <option value="10080">1 week</option>
                  </select>
                  <button className="btn-secondary px-3 py-2 text-xs">
                    Snooze
                  </button>
                </form>
              </section>
              <section className="border-t app-border pt-4">
                <h2 className="text-xs font-semibold">Tags</h2>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.tags.map(({ tag }) => (
                    <span key={tag.id} className="rounded-full bg-brand-400/10 px-2 py-1 text-[9px] text-brand-300">
                      {tag.name}
                    </span>
                  ))}
                </div>
                <form action={addConversationTag} className="mt-2 flex gap-2">
                  <input type="hidden" name="conversationId" value={selected.id} />
                  <input name="tag" required maxLength={40} placeholder="Add tag" className="app-input min-w-0 flex-1 py-2 text-xs" />
                  <button className="btn-secondary px-3"><Tag size={13} /></button>
                </form>
              </section>
              <section className="border-t app-border pt-4">
                <h2 className="text-xs font-semibold">Customer</h2>
                <dl className="mt-3 space-y-2 text-xs">
                  <Detail label="Name" value={customer?.displayName || selected.customerName || "Guest"} />
                  <Detail label="Email" value={customer?.email || selected.customerEmail || "Not provided"} />
                  <Detail label="Plan" value={customer ? `${customer.billingPlan} · ${customer.billingStatus}` : "Guest"} />
                  <Detail label="Channel" value={selected.channel} />
                  <Detail label="Created" value={formatNewYorkDateTime(selected.createdAt)} />
                  <Detail label="CSAT" value={selected.satisfactionScore ? `${selected.satisfactionScore} / 5` : "Not rated"} />
                </dl>
              </section>
              {(context || selected.linkedSessionId || customer?.sessions.length) && (
                <section className="border-t app-border pt-4">
                  <h2 className="text-xs font-semibold">ForexTestLab context</h2>
                  {selected.linkedSessionId && (
                    <Link href={`/admin/sessions?session=${selected.linkedSessionId}`} className="mt-2 block text-[10px] text-brand-300">
                      Linked session {selected.linkedSessionId}
                    </Link>
                  )}
                  {context && (
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/20 p-3 text-[9px] leading-4 app-muted">
                      {JSON.stringify(context, null, 2)}
                    </pre>
                  )}
                  {customer?.sessions.map((session) => (
                    <div key={session.id} className="mt-2 rounded-lg bg-white/[0.035] p-2 text-[10px]">
                      {session.symbol} · {session.timeframe} · {session.status}
                    </div>
                  ))}
                </section>
              )}
              <section className="border-t app-border pt-4">
                <h2 className="text-xs font-semibold">Create saved reply</h2>
                <form action={saveReplyTemplate} className="mt-2 space-y-2">
                  <input name="title" required maxLength={100} placeholder="Template title" className="app-input w-full py-2 text-xs" />
                  <textarea name="body" required maxLength={4_000} rows={3} placeholder="Reply text" className="app-input w-full resize-none text-xs" />
                  <button className="btn-secondary w-full justify-center px-3 py-2 text-xs">
                    Save template
                  </button>
                </form>
              </section>
              {["supervisor", "owner"].includes(agent.role) && (
                <section className="border-t app-border pt-4">
                  <h2 className="text-xs font-semibold">Support team access</h2>
                  <p className="mt-1 text-[10px] app-muted">
                    The user must already have a ForexTestLab account.
                  </p>
                  <form action={addSupportAgent} className="mt-2 space-y-2">
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="Agent account email"
                      className="app-input w-full py-2 text-xs"
                    />
                    <select name="role" className="app-input w-full py-2 text-xs">
                      <option value="agent">Support agent</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="viewer">Read only</option>
                    </select>
                    <button className="btn-secondary w-full justify-center px-3 py-2 text-xs">
                      <Users size={13} /> Add team member
                    </button>
                  </form>
                </section>
              )}
            </div>
          ) : (
            <p className="text-xs app-muted">Customer context appears here.</p>
          )}
        </aside>
      </section>
    </main>
  );
}

function Stat({
  value,
  label,
  danger = false,
}: {
  value: string;
  label: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg bg-white/[0.035] p-2">
      <p className={`font-mono text-sm font-semibold ${danger ? "text-bear" : ""}`}>
        {value}
      </p>
      <p className="mt-1 text-[8px] uppercase tracking-wide app-muted">{label}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[10px] app-muted">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="app-muted">{label}</dt>
      <dd className="max-w-[65%] break-words text-right">{value}</dd>
    </div>
  );
}
