"use client";

import {
  Bell,
  CheckCheck,
  Download,
  Headset,
  History,
  MessageCircle,
  Paperclip,
  Plus,
  Send,
  Star,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
};
type SupportMessage = {
  id: string;
  senderType: string;
  senderName: string;
  body: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  createdAt: string;
  attachments: Attachment[];
};
type Conversation = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assignedAgentName?: string | null;
  customerUnreadCount: number;
  satisfactionScore?: number | null;
  messages: SupportMessage[];
};
type ConversationSummary = {
  id: string;
  subject: string;
  status: string;
  customerUnreadCount: number;
  assignedAgentName?: string | null;
  updatedAt: string;
  messages: Array<{ body: string }>;
};

const VISITOR_KEY = "forextestlab_support_visitor";
const ACTIVE_KEY = "forextestlab_support_conversation";
const TOKENS_KEY = "forextestlab_support_tokens";
const categories = [
  ["replay", "Replay"],
  ["charts", "Charts and drawings"],
  ["orders", "Orders and positions"],
  ["market_data", "Market data"],
  ["billing", "Billing"],
  ["account", "Account"],
  ["bug", "Bug report"],
  ["feature", "Feature request"],
  ["other", "Other"],
] as const;

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "FT"
  );
}

function tokenMap() {
  try {
    return JSON.parse(window.localStorage.getItem(TOKENS_KEY) ?? "{}") as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

function saveToken(conversationId: string, token: string) {
  const tokens = tokenMap();
  tokens[conversationId] = token;
  window.localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

function supportHeaders(conversationId: string, json = false) {
  const token = tokenMap()[conversationId];
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { "x-support-token": token } : {}),
  };
}

/**
 * Routes that own the whole viewport and have their own bottom-right chrome. A
 * floating launcher there would sit on top of the trading dock's account
 * read-out, so the widget stands down and those pages link to /app/support.
 */
const HIDDEN_ROUTES = ["/app/backtest", "/app/support", "/support-team"];

export function SupportChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [visitorId, setVisitorId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("other");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const [notifications, setNotifications] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const lastAgentMessageRef = useRef<string | null>(null);

  useEffect(() => {
    const visitor =
      window.localStorage.getItem(VISITOR_KEY) || crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, visitor);
    setVisitorId(visitor);
    setConversationId(window.localStorage.getItem(ACTIVE_KEY) || "");
    setOnline(navigator.onLine);
    setNotifications(
      typeof Notification !== "undefined" &&
        Notification.permission === "granted",
    );
  }, []);

  const loadConversation = useCallback(async () => {
    if (!conversationId || !visitorId || !navigator.onLine) return;
    const response = await fetch(
      `/api/support/chat?conversationId=${encodeURIComponent(conversationId)}&visitorId=${encodeURIComponent(visitorId)}`,
      {
        cache: "no-store",
        headers: supportHeaders(conversationId),
      },
    );
    if (!response.ok) return;
    const payload = (await response.json()) as {
      conversation?: Conversation | null;
    };
    if (!payload.conversation) return;
    const next = payload.conversation;
    const lastAgent = [...next.messages]
      .reverse()
      .find((message) => message.senderType === "agent");
    if (
      lastAgent &&
      lastAgentMessageRef.current &&
      lastAgent.id !== lastAgentMessageRef.current &&
      document.visibilityState !== "visible" &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      new Notification("ForexTestLab Support", {
        body: lastAgent.body.slice(0, 140),
      });
    }
    lastAgentMessageRef.current = lastAgent?.id ?? null;
    setConversation(next);
    if (open && next.customerUnreadCount > 0) {
      void fetch("/api/support/chat", {
        method: "POST",
        headers: supportHeaders(conversationId, true),
        body: JSON.stringify({
          action: "read",
          conversationId,
          visitorId,
        }),
      });
    }
  }, [conversationId, open, visitorId]);

  const loadHistory = useCallback(async () => {
    if (!visitorId || !navigator.onLine) return;
    const response = await fetch(
      `/api/support/chat?visitorId=${encodeURIComponent(visitorId)}&list=1`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const payload = (await response.json()) as {
      conversations?: ConversationSummary[];
    };
    setConversations(payload.conversations ?? []);
  }, [visitorId]);

  useEffect(() => {
    void loadConversation();
    void loadHistory();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" && !notifications) return;
      void loadConversation();
      void loadHistory();
    }, 2_000);
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, [loadConversation, loadHistory, notifications]);

  const unread = useMemo(
    () =>
      conversations.reduce(
        (total, item) => total + item.customerUnreadCount,
        0,
      ),
    [conversations],
  );

  async function submitNew() {
    if (!input.trim() || !name.trim() || !email.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          visitorId,
          name,
          email,
          subject,
          category,
          message: input,
          clientMessageId: crypto.randomUUID(),
          context: {
            page: window.location.href,
            browser: navigator.userAgent,
          },
          channel: "widget",
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        accessToken?: string;
        conversation?: Conversation;
      };
      if (!response.ok || !payload.conversation) {
        setError(payload.message ?? "Support request could not be created.");
        return;
      }
      if (payload.accessToken) {
        saveToken(payload.conversation.id, payload.accessToken);
      }
      setConversationId(payload.conversation.id);
      setConversation(payload.conversation);
      window.localStorage.setItem(ACTIVE_KEY, payload.conversation.id);
      setInput("");
      setShowNew(false);
      void loadHistory();
    } finally {
      setSending(false);
    }
  }

  async function sendMessage() {
    if (!conversationId || !input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: supportHeaders(conversationId, true),
        body: JSON.stringify({
          action: "message",
          conversationId,
          visitorId,
          name,
          message: text,
          clientMessageId: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json()) as {
        message?: string;
        conversation?: Conversation;
      };
      if (!response.ok || !payload.conversation) {
        setError(payload.message ?? "Message could not be sent.");
        setInput(text);
        return;
      }
      setConversation(payload.conversation);
      void loadHistory();
    } finally {
      setSending(false);
    }
  }

  async function upload(file: File) {
    if (!conversationId || uploading) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("conversationId", conversationId);
      form.set("visitorId", visitorId);
      form.set("file", file);
      const response = await fetch("/api/support/attachments", {
        method: "POST",
        headers: supportHeaders(conversationId),
        body: form,
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) setError(payload.message ?? "Upload failed.");
      else await loadConversation();
    } finally {
      setUploading(false);
    }
  }

  async function download(attachment: Attachment) {
    const response = await fetch(
      `/api/support/attachments/${attachment.id}?visitorId=${encodeURIComponent(visitorId)}`,
      { headers: supportHeaders(conversationId) },
    );
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function rate(score: number) {
    if (!conversationId) return;
    await fetch("/api/support/chat", {
      method: "POST",
      headers: supportHeaders(conversationId, true),
      body: JSON.stringify({
        action: "satisfaction",
        conversationId,
        visitorId,
        score,
      }),
    });
    await loadConversation();
  }

  function startNew() {
    setConversationId("");
    setConversation(null);
    setShowHistory(false);
    setShowNew(true);
    setInput("");
    setSubject("");
    setCategory("other");
    setError("");
    window.localStorage.removeItem(ACTIVE_KEY);
  }

  function openConversation(id: string) {
    setConversationId(id);
    setConversation(null);
    setShowHistory(false);
    setShowNew(false);
    window.localStorage.setItem(ACTIVE_KEY, id);
  }

  if (HIDDEN_ROUTES.some((route) => pathname?.startsWith(route))) return null;

  return (
    <>
      {open && (
        <section
          id="support-assistant-panel"
          className="fixed bottom-24 right-4 z-[120] flex h-[620px] max-h-[calc(100dvh-7rem)] w-[min(calc(100vw-2rem),400px)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-surface-900 shadow-2xl shadow-black/40"
          aria-label="ForexTestLab support"
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[linear-gradient(135deg,rgba(34,195,160,.18),rgba(17,23,37,.7))] px-4 py-3.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-brand-400/25 bg-brand-400/15 text-xs font-bold text-brand-200">
              {conversation?.assignedAgentName ? (
                initials(conversation.assignedAgentName)
              ) : (
                <Headset size={18} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {conversation?.assignedAgentName || "ForexTestLab Support"}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                {!online
                  ? "Offline · messages will remain here"
                  : conversationId && !conversation?.assignedAgentName
                    ? "Waiting for a support agent to join"
                    : conversation?.assignedAgentName
                      ? "Support agent · joined"
                      : "Human support · live inbox"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowHistory((current) => !current)}
              className="relative grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10"
              aria-label="Previous support conversations"
            >
              <History size={15} />
              {unread > 0 && <Badge value={unread} />}
            </button>
            <button
              type="button"
              onClick={startNew}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10"
              aria-label="New support conversation"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10"
              aria-label="Close support"
            >
              <X size={16} />
            </button>
          </header>

          {showHistory && (
            <div className="border-b border-white/10 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Previous conversations
              </p>
              <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
                {conversations.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openConversation(item.id)}
                    className="block w-full rounded-lg border border-white/10 bg-surface-800 px-3 py-2 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
                        {item.subject}
                      </span>
                      {item.customerUnreadCount > 0 && (
                        <span className="rounded-full bg-brand-500 px-1.5 text-[8px] font-bold text-surface-950">
                          {item.customerUnreadCount}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[9px] capitalize text-slate-500">
                      {item.status.replaceAll("_", " ")} ·{" "}
                      {item.messages[0]?.body}
                    </p>
                  </button>
                ))}
                {!conversations.length && (
                  <p className="py-4 text-center text-[11px] text-slate-500">
                    No conversations yet.
                  </p>
                )}
              </div>
            </div>
          )}

          {showNew || (!conversationId && !conversation) ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <h2 className="font-semibold text-white">Contact the support team</h2>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Your conversation stays in ForexTestLab. We will also notify you
                by email when an agent replies.
              </p>
              <div className="mt-4 space-y-2.5">
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" className="app-input w-full py-2.5 text-xs" />
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email address" className="app-input w-full py-2.5 text-xs" />
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="app-input w-full py-2.5 text-xs" aria-label="Support category">
                  {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} placeholder="Subject" className="app-input w-full py-2.5 text-xs" />
                <textarea value={input} onChange={(event) => setInput(event.target.value)} maxLength={4_000} rows={6} placeholder="Describe what happened and what you expected" className="app-input w-full resize-none text-xs" />
                {error && <p role="alert" className="text-xs text-bear">{error}</p>}
                <button type="button" onClick={() => void submitNew()} disabled={sending || !online} className="w-full rounded-lg bg-brand-500 px-4 py-3 text-xs font-bold text-surface-950 disabled:opacity-40">
                  {sending ? "Creating conversation…" : "Start conversation"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
                {conversation && !conversation.assignedAgentName && (
                  <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-3 text-center">
                    <span className="mx-auto block h-2 w-2 animate-pulse rounded-full bg-amber-300" />
                    <p className="mt-2 text-xs font-semibold text-amber-100">
                      Waiting for a support agent to join
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-400">
                      You can close this panel. Your conversation and replies
                      will stay here.
                    </p>
                  </div>
                )}
                {conversation?.assignedAgentName && (
                  <div className="flex items-center gap-3 rounded-xl border border-brand-400/20 bg-brand-400/[0.06] px-3 py-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-400/15 text-xs font-bold text-brand-200">
                      {initials(conversation.assignedAgentName)}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {conversation.assignedAgentName}
                      </p>
                      <p className="text-[10px] text-brand-300">
                        Support agent joined the conversation
                      </p>
                    </div>
                  </div>
                )}
                {conversation?.messages.map((message) => (
                  <div key={message.id} className={`flex ${message.senderType === "customer" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-5 ${message.senderType === "customer" ? "rounded-br-md bg-brand-500 text-surface-950" : "rounded-bl-md border border-brand-400/20 bg-brand-400/10 text-slate-200"}`}>
                      {message.senderType !== "customer" && <p className="mb-1 text-[10px] font-semibold text-brand-300">{message.senderName}</p>}
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      {message.attachments.map((attachment) => (
                        <button key={attachment.id} type="button" onClick={() => void download(attachment)} className="mt-2 flex w-full items-center gap-2 rounded-lg border border-current/20 px-2 py-1.5 text-left text-[9px]">
                          <Download size={11} /> <span className="truncate">{attachment.fileName}</span>
                        </button>
                      ))}
                      {message.senderType === "customer" && (
                        <p className="mt-1 flex justify-end text-[8px] opacity-60">
                          <CheckCheck size={10} /> {message.readAt ? "Read" : message.deliveredAt ? "Delivered" : "Sending"}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {!conversation && <p className="py-8 text-center text-xs text-slate-500">Loading conversation…</p>}
                {conversation?.status === "resolved" && (
                  <div className="rounded-xl border border-brand-400/20 bg-brand-400/[0.06] p-3 text-center">
                    <p className="text-xs font-semibold">Was this support helpful?</p>
                    <div className="mt-2 flex justify-center gap-1">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <button key={score} type="button" onClick={() => void rate(score)} aria-label={`Rate support ${score} out of 5`} className={conversation.satisfactionScore && score <= conversation.satisfactionScore ? "text-amber-300" : "text-slate-600"}>
                          <Star size={18} fill="currentColor" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="shrink-0 border-t border-white/10 p-3">
                {error && <p role="alert" className="mb-2 text-[10px] text-bear">{error}</p>}
                <form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }} className="flex items-end gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || conversation?.status === "closed"} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-400 hover:text-white" aria-label="Attach file">
                    <Paperclip size={15} />
                  </button>
                  <input ref={fileRef} type="file" className="hidden" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
                  <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={2} maxLength={4_000} placeholder="Message support…" className="app-input min-w-0 flex-1 resize-none text-xs" />
                  <button type="submit" disabled={sending || !input.trim() || !online || conversation?.status === "closed"} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-500 text-surface-950 disabled:opacity-40" aria-label="Send support message">
                    <Send size={15} />
                  </button>
                </form>
                <div className="mt-2 flex items-center justify-end">
                  <button type="button" onClick={async () => {
                    if (typeof Notification === "undefined") return;
                    const permission = await Notification.requestPermission();
                    setNotifications(permission === "granted");
                  }} className="inline-flex items-center gap-1 text-[9px] text-slate-500">
                    <Bell size={10} /> {notifications ? "Notifications on" : "Enable notifications"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-5 right-4 z-[120] inline-flex items-center gap-2 rounded-full border border-brand-300/30 bg-brand-500 px-4 py-3 text-xs font-bold text-surface-950 shadow-glow transition-transform hover:-translate-y-0.5"
        aria-expanded={open}
        aria-controls="support-assistant-panel"
      >
        <MessageCircle size={17} /> Help
        {unread > 0 && <Badge value={unread} />}
      </button>
    </>
  );
}

function Badge({ value }: { value: number }) {
  return (
    <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bear px-1 text-[8px] font-bold text-white">
      {value > 99 ? "99+" : value}
    </span>
  );
}
