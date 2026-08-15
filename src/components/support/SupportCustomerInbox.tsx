"use client";

import { CheckCircle2, Headphones, Inbox, Paperclip, Plus, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { playSupportChime } from "@/lib/support-sound";

/** Signed-in users get their replies by email too, so the inbox refreshes at a
 * calm cadence instead of hammering the database from every open tab. */
const POLL_INTERVAL_MS = 10_000;

/** Resolving a conversation ends it for the customer; the thread stays
 * readable and a follow-up starts a new one. */
const CLOSED_STATUSES = ["resolved", "closed"];

const CATEGORIES = [
  ["replay", "Replay"],
  ["charts", "Charts and drawings"],
  ["orders", "Orders and positions"],
  ["market_data", "Market data"],
  ["billing", "Billing"],
  ["account", "Account"],
  ["bug", "Bug report"],
  ["feature", "Feature request"],
  ["other", "Something else"],
] as const;

type Summary = {
  id: string;
  subject: string;
  status: string;
  customerUnreadCount: number;
  lastMessageAt: string;
  messages: Array<{ body: string }>;
};
type Attachment = { id: string; fileName: string };
type Conversation = Omit<Summary, "messages" | "lastMessageAt"> & {
  assignedAgentName: string | null;
  messages: Array<{
    id: string;
    senderType: string;
    senderName: string;
    body: string;
    createdAt: string;
    attachments: Attachment[];
  }>;
};

export function SupportCustomerInbox({
  initialConversations,
  customerName,
  customerEmail,
}: {
  initialConversations: Summary[];
  customerName: string;
  customerEmail: string;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(
    initialConversations[0]?.id ?? "",
  );
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [composing, setComposing] = useState(!initialConversations.length);
  const [input, setInput] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastAgentRef = useRef<string | null>(null);

  const loadList = useCallback(async () => {
    const response = await fetch("/api/support/chat?list=1", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { conversations?: Summary[] };
    setConversations(payload.conversations ?? []);
  }, []);

  const loadThread = useCallback(async () => {
    if (!selectedId) return;
    const response = await fetch(
      `/api/support/chat?conversationId=${encodeURIComponent(selectedId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const payload = (await response.json()) as {
      conversation?: Conversation | null;
    };
    if (!payload.conversation) return;
    const newestAgent = [...payload.conversation.messages]
      .reverse()
      .find((message) => message.senderType !== "customer");
    if (
      newestAgent &&
      lastAgentRef.current !== null &&
      newestAgent.id !== lastAgentRef.current
    ) {
      playSupportChime("incoming");
    }
    lastAgentRef.current = newestAgent?.id ?? "";
    setConversation(payload.conversation);
    if (payload.conversation.customerUnreadCount > 0) {
      void fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", conversationId: selectedId }),
      });
    }
  }, [selectedId]);

  useEffect(() => {
    void loadThread();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadThread();
    }, POLL_INTERVAL_MS);
    // The sidebar only changes when a reply lands, which the thread poll
    // already surfaces — so it refreshes on focus rather than on a timer.
    window.addEventListener("focus", loadList);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", loadList);
    };
  }, [loadList, loadThread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conversation?.messages.length]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        message?: string;
        conversation?: Conversation;
      };
      if (!response.ok || !payload.conversation) {
        setError(payload.message ?? "That could not be sent. Please retry.");
        return null;
      }
      return payload.conversation;
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!selectedId || !text || busy) return;
    setInput("");
    const updated = await post({
      action: "message",
      conversationId: selectedId,
      message: text,
      name: customerName,
      clientMessageId: crypto.randomUUID(),
    });
    if (!updated) setInput(text);
    else {
      setConversation(updated);
      void loadList();
    }
  }

  async function create() {
    if (!subject.trim() || !input.trim() || busy) return;
    const created = await post({
      action: "start",
      name: customerName,
      email: customerEmail,
      subject,
      category,
      message: input,
      clientMessageId: crypto.randomUUID(),
      channel: "app",
      context: { page: window.location.href },
    });
    if (!created) return;
    setSelectedId(created.id);
    setConversation(created);
    setInput("");
    setSubject("");
    setComposing(false);
    void loadList();
  }

  async function upload(file: File) {
    if (!selectedId || busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("conversationId", selectedId);
      form.set("file", file);
      const response = await fetch("/api/support/attachments", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setError(payload.message ?? "That file could not be uploaded.");
        return;
      }
    } finally {
      setBusy(false);
    }
    await loadThread();
  }

  function openConversation(id: string) {
    setSelectedId(id);
    setConversation(null);
    lastAgentRef.current = null;
    setComposing(false);
    setInput("");
    setError("");
  }

  const closed = Boolean(
    conversation && CLOSED_STATUSES.includes(conversation.status),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Support</h1>
          <p className="mt-1.5 text-sm app-muted">
            Message the team. Replies land here and in your email.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setComposing(true);
            setConversation(null);
            setInput("");
            setError("");
          }}
          className="btn-primary px-4 py-2.5 text-xs"
        >
          <Plus size={15} aria-hidden /> New message
        </button>
      </div>

      <section className="mt-6 grid overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)] lg:h-[min(680px,calc(100dvh-13rem))] lg:grid-cols-[280px_1fr]">
        <aside className="flex max-h-52 min-h-0 flex-col border-b app-border lg:max-h-none lg:border-b-0 lg:border-r">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversations.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openConversation(item.id)}
                className={`block w-full border-b app-border px-4 py-3.5 text-left transition-colors ${
                  selectedId === item.id && !composing
                    ? "bg-brand-400/[0.07]"
                    : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <strong className="min-w-0 flex-1 truncate text-sm">
                    {item.subject}
                  </strong>
                  {item.customerUnreadCount > 0 && (
                    <span className="rounded-full bg-brand-500 px-1.5 text-[9px] font-bold text-surface-950">
                      {item.customerUnreadCount}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 truncate text-xs app-muted">
                  {item.messages[0]?.body}
                </p>
              </button>
            ))}
            {!conversations.length && (
              <div className="px-5 py-12 text-center">
                <Inbox size={22} className="mx-auto text-brand-300" aria-hidden />
                <p className="mt-3 text-xs app-muted">No messages yet.</p>
              </div>
            )}
          </div>
        </aside>

        {composing ? (
          <div className="min-h-0 overflow-y-auto p-6 sm:p-8">
            <h2 className="text-lg font-semibold">How can we help?</h2>
            <div className="mt-5 max-w-xl space-y-3">
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Subject"
                className="app-input w-full py-3 text-sm"
              />
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                aria-label="Topic"
                className="app-input w-full py-3 text-sm"
              >
                {CATEGORIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={8}
                maxLength={4_000}
                placeholder="What’s happening, and what did you expect?"
                className="app-input w-full resize-none text-sm"
              />
              {error && (
                <p role="alert" className="text-xs text-bear">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={() => void create()}
                disabled={busy || !subject.trim() || !input.trim()}
                className="btn-primary px-5 py-3 text-sm"
              >
                <Send size={15} aria-hidden /> {busy ? "Sending…" : "Send message"}
              </button>
            </div>
          </div>
        ) : conversation ? (
          <div className="flex min-h-[60vh] flex-col lg:min-h-0">
            <header className="flex shrink-0 items-center gap-3 border-b app-border px-5 py-3.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-400/10 text-brand-300">
                <Headphones size={17} aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{conversation.subject}</h2>
                <p className="mt-0.5 text-[11px] app-muted">
                  {conversation.assignedAgentName
                    ? `${conversation.assignedAgentName} is on this conversation`
                    : "With the support team"}
                </p>
              </div>
            </header>
            <div
              className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-5"
              aria-live="polite"
            >
              {conversation.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.senderType === "customer" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[76%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                      message.senderType === "customer"
                        ? "rounded-br-md bg-brand-500 text-surface-950"
                        : "rounded-bl-md bg-white/[0.06]"
                    }`}
                  >
                    {message.senderType !== "customer" && (
                      <p className="mb-1 text-[11px] font-semibold text-brand-300">
                        {message.senderName}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap">{message.body}</p>
                    {message.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={`/api/support/attachments/${attachment.id}`}
                        className="mt-2 block truncate text-xs underline"
                      >
                        {attachment.fileName}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
              {!conversation.assignedAgentName && !closed && (
                <div className="rounded-xl border app-border px-4 py-3 text-center">
                  <span className="mx-auto block h-2 w-2 animate-pulse-soft rounded-full bg-brand-400 motion-reduce:animate-none" />
                  <p className="mt-2 text-xs font-semibold">
                    Waiting for a support agent to join
                  </p>
                  <p className="mt-1 text-[11px] app-muted">
                    You can leave this page. Replies arrive here and by email.
                  </p>
                </div>
              )}
              <div ref={endRef} />
            </div>
            {closed ? (
              <div className="shrink-0 border-t app-border p-4">
                <div className="flex items-center gap-3 rounded-xl border app-border px-4 py-3">
                  <CheckCircle2 size={16} aria-hidden className="shrink-0 text-brand-300" />
                  <p className="min-w-0 flex-1 text-xs app-muted">
                    Support closed this conversation. Start a new one and we will pick it up from there.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setComposing(true);
                      setConversation(null);
                      setInput("");
                      setError("");
                    }}
                    className="btn-primary shrink-0 px-3 py-2 text-xs"
                  >
                    <Plus size={14} aria-hidden /> New message
                  </button>
                </div>
              </div>
            ) : (
            <div className="shrink-0 border-t app-border p-4">
              {error && (
                <p role="alert" className="mb-2 text-xs text-bear">
                  {error}
                </p>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
                className="flex items-end gap-2"
              >
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy || closed}
                  className="btn-secondary h-11 w-11 p-0 disabled:opacity-40"
                  aria-label="Attach a file"
                >
                  <Paperclip size={15} aria-hidden />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                    event.target.value = "";
                  }}
                />
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  maxLength={4_000}
                  disabled={closed}
                  placeholder={closed ? "This conversation is closed" : "Reply…"}
                  className="app-input min-w-0 flex-1 resize-none text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || closed || !input.trim()}
                  className="btn-primary h-11 px-4 disabled:opacity-40"
                  aria-label="Send reply"
                >
                  <Send size={15} aria-hidden />
                </button>
              </form>
            </div>
            )}
          </div>
        ) : (
          <div className="grid place-items-center p-10 text-center">
            <p className="text-sm app-muted">Loading…</p>
          </div>
        )}
      </section>
    </div>
  );
}
