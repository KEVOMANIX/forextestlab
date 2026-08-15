"use client";

import {
  ArrowLeft,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronRight,
  Headset,
  MessageSquarePlus,
  Paperclip,
  Send,
  Star,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  SUPPORT_ACTIVE_KEY,
  saveSupportToken,
  supportHeaders,
  supportVisitorId,
  type SupportAttachment,
  type SupportChatConversation,
  type SupportChatSummary,
} from "@/lib/support-client";
import {
  isSupportMuted,
  playSupportChime,
  setSupportMuted,
} from "@/lib/support-sound";

/**
 * The panel only polls while it is open and visible, so a widget mounted on
 * every page costs nothing until somebody actually asks for help.
 */
const POLL_INTERVAL_MS = 10_000;
const CLOSED_STATUSES = ["resolved", "closed"];

type View = "home" | "new" | "thread";

/** Openers that put the agent in the right area immediately; the API derives
 * the subject from the first line, so these also title the conversation. */
const TOPICS = [
  ["Replay or charts", "I need help with replay or charts: "],
  ["Billing or plan", "I need help with billing or my plan: "],
  ["Something is broken", "Something is not working: "],
] as const;

export function SupportChatPanel({
  onClose,
  onUnread,
}: {
  onClose: () => void;
  onUnread: (count: number) => void;
}) {
  const visitorId = useRef(supportVisitorId()).current;
  const [conversationId, setConversationId] = useState(
    () => window.localStorage.getItem(SUPPORT_ACTIVE_KEY) ?? "",
  );
  const [view, setView] = useState<View>(() =>
    window.localStorage.getItem(SUPPORT_ACTIVE_KEY) ? "thread" : "home",
  );
  const [conversation, setConversation] =
    useState<SupportChatConversation | null>(null);
  const [previous, setPrevious] = useState<SupportChatSummary[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  // Tracks the newest agent message already seen, so the chime marks arrivals
  // rather than firing again on every poll or on the first render.
  const lastAgentRef = useRef<string | null>(null);

  const [canAskAlerts, setCanAskAlerts] = useState(false);

  useEffect(() => {
    setMuted(isSupportMuted());
    setCanAskAlerts(
      typeof Notification !== "undefined" && Notification.permission === "default",
    );
  }, []);

  async function enableAlerts() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setCanAskAlerts(permission === "default");
  }

  const select = useCallback((id: string) => {
    setConversationId(id);
    setConversation(null);
    setError("");
    lastAgentRef.current = null;
    if (id) {
      window.localStorage.setItem(SUPPORT_ACTIVE_KEY, id);
      setView("thread");
    } else {
      window.localStorage.removeItem(SUPPORT_ACTIVE_KEY);
    }
  }, []);

  const loadThread = useCallback(async () => {
    if (!conversationId) return;
    const response = await fetch(
      `/api/support/chat?conversationId=${encodeURIComponent(conversationId)}&visitorId=${encodeURIComponent(visitorId)}`,
      { cache: "no-store", headers: supportHeaders(conversationId) },
    );
    if (!response.ok) {
      // The stored conversation is gone or no longer ours — fall back to the
      // start form instead of leaving the panel stuck on "Loading".
      if (response.status === 404) {
        select("");
        setView("home");
      }
      return;
    }
    const payload = (await response.json()) as {
      conversation?: SupportChatConversation | null;
    };
    if (!payload.conversation) return;
    const next = payload.conversation;
    const newestAgent = [...next.messages]
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
    setConversation(next);
    if (next.customerUnreadCount > 0) {
      onUnread(0);
      void fetch("/api/support/chat", {
        method: "POST",
        headers: supportHeaders(conversationId, true),
        body: JSON.stringify({ action: "read", conversationId, visitorId }),
      });
    }
  }, [conversationId, onUnread, select, visitorId]);

  const loadPrevious = useCallback(async () => {
    const response = await fetch(
      `/api/support/chat?visitorId=${encodeURIComponent(visitorId)}&list=1`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const payload = (await response.json()) as {
      conversations?: SupportChatSummary[];
    };
    setPrevious(payload.conversations ?? []);
  }, [visitorId]);

  useEffect(() => {
    void loadThread();
    void loadPrevious();
    // Deliberately polls on a hidden tab as well: an open conversation should
    // land its reply while the customer is reading something else.
    const timer = window.setInterval(() => void loadThread(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [conversationId, loadPrevious, loadThread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [conversation?.messages.length]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: supportHeaders(conversationId, true),
        body: JSON.stringify({ ...body, visitorId }),
      });
      const payload = (await response.json()) as {
        message?: string;
        accessToken?: string;
        conversation?: SupportChatConversation;
      };
      if (!response.ok || !payload.conversation) {
        setError(payload.message ?? "Message could not be sent. Please retry.");
        if (response.status === 409) void loadThread();
        return null;
      }
      return payload;
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!input.trim() || !name.trim() || !email.trim() || busy) return;
    const payload = await post({
      action: "start",
      name,
      email,
      message: input,
      clientMessageId: crypto.randomUUID(),
      channel: "widget",
      context: { page: window.location.href, browser: navigator.userAgent },
    });
    if (!payload?.conversation) return;
    if (payload.accessToken)
      saveSupportToken(payload.conversation.id, payload.accessToken);
    select(payload.conversation.id);
    setConversation(payload.conversation);
    lastAgentRef.current = "";
    setInput("");
    playSupportChime("sent");
    void loadPrevious();
  }

  async function send() {
    const text = input.trim();
    if (!conversationId || !text || busy) return;
    setInput("");
    const payload = await post({
      action: "message",
      conversationId,
      name,
      message: text,
      clientMessageId: crypto.randomUUID(),
    });
    if (!payload?.conversation) setInput(text);
    else {
      setConversation(payload.conversation);
      playSupportChime("sent");
    }
  }

  async function upload(file: File) {
    if (!conversationId || busy) return;
    setBusy(true);
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

  async function download(attachment: SupportAttachment) {
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
    await loadThread();
  }

  function startNew(starter = "") {
    select("");
    setInput(starter);
    setError("");
    setView("new");
  }

  function goHome() {
    setView("home");
    setError("");
    void loadPrevious();
  }

  const ended = Boolean(conversation && CLOSED_STATUSES.includes(conversation.status));
  const agentName = conversation?.assignedAgentName ?? "";
  // The first non-customer message is where an agent actually appeared, so the
  // "joined" marker sits there rather than floating at the top of the thread.
  const firstAgentIndex =
    conversation?.messages.findIndex((message) => message.senderType !== "customer") ??
    -1;
  const inThread = view === "thread" && Boolean(conversationId);
  const title = inThread
    ? conversation?.assignedAgentName || "Support"
    : view === "new"
      ? "New conversation"
      : "Support";
  const subtitle = inThread
    ? ended
      ? "Conversation closed"
      : conversation?.assignedAgentName
        ? "Support agent"
        : "We reply here and by email"
    : "Usually answered within one business day";

  // `app-theme-surface` carries the --app-* variables the shared input styles
  // read: the widget also mounts on marketing pages, which sit outside the app
  // shell that normally defines them.
  return (
    <section
      id="support-panel"
      aria-label="ForexTestLab support"
      className="app-theme-surface fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] top-3 z-[120] flex animate-panel-in flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-900 shadow-2xl shadow-black/50 motion-reduce:animate-none sm:inset-x-auto sm:right-4 sm:top-auto sm:h-[560px] sm:max-h-[calc(100dvh-7rem)] sm:w-[380px] sm:bottom-24"
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-white/10 px-3 py-3">
        {view !== "home" ? (
          <button
            type="button"
            onClick={goHome}
            aria-label="Back to conversations"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={17} aria-hidden />
          </button>
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-400/15 text-brand-200">
            <Headset size={17} aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{title}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            const next = !muted;
            setMuted(next);
            setSupportMuted(next);
            if (!next) playSupportChime("sent");
          }}
          aria-pressed={muted}
          aria-label={muted ? "Turn notification sound on" : "Turn notification sound off"}
          title={muted ? "Sound off" : "Sound on"}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          {muted ? <BellOff size={16} aria-hidden /> : <Bell size={16} aria-hidden />}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close support"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      {view === "home" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="text-sm leading-6 text-slate-300">
            Hi there. Ask us anything about your account, your plan or the
            backtester and we’ll reply here and by email.
          </p>
          <button
            type="button"
            onClick={() => startNew()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-xs font-bold text-surface-950 transition-colors hover:bg-brand-400"
          >
            <MessageSquarePlus size={15} aria-hidden /> Start a conversation
          </button>

          <div className="mt-3 space-y-1.5">
            {TOPICS.map(([label, starter]) => (
              <button
                key={label}
                type="button"
                onClick={() => startNew(starter)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-left text-xs text-slate-300 transition-colors hover:border-brand-400/30 hover:bg-white/[0.03]"
              >
                {label}
                <ChevronRight size={14} aria-hidden className="shrink-0 text-slate-500" />
              </button>
            ))}
          </div>

          {previous.length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Your conversations
              </p>
              <div className="mt-2 space-y-1.5">
                {previous.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => select(item.id)}
                    className="block w-full rounded-xl border border-white/10 px-3 py-2.5 text-left transition-colors hover:border-brand-400/30 hover:bg-white/[0.03]"
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">
                        {item.subject}
                      </span>
                      {item.customerUnreadCount > 0 && (
                        <span className="animate-badge-pop rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-surface-950 motion-reduce:animate-none">
                          {item.customerUnreadCount}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-slate-500">
                      {CLOSED_STATUSES.includes(item.status)
                        ? "Closed"
                        : item.messages[0]?.body}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : view === "new" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="text-sm leading-6 text-slate-300">
            Tell us what you need help with.
          </p>
          <div className="mt-4 space-y-2.5">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              autoComplete="name"
              className="app-input w-full py-2.5 text-xs"
            />
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="Email address"
              autoComplete="email"
              className="app-input w-full py-2.5 text-xs"
            />
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={4_000}
              rows={6}
              placeholder="What’s happening, and what did you expect?"
              className="app-input w-full resize-none text-xs"
            />
            {error && (
              <p role="alert" className="text-xs text-bear">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => void start()}
              disabled={busy || !input.trim() || !name.trim() || !email.trim()}
              className="w-full rounded-lg bg-brand-500 px-4 py-3 text-xs font-bold text-surface-950 transition-opacity hover:bg-brand-400 disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send message"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4"
            aria-live="polite"
          >
            {!conversation && (
              <p className="py-8 text-center text-xs text-slate-500">Loading…</p>
            )}
            {conversation?.messages.map((message, index) => (
              <div key={message.id}>
                {index === firstAgentIndex && (
                  <p className="my-3 flex items-center gap-2 text-center text-[10px] text-slate-500">
                    <span className="h-px flex-1 bg-white/10" />
                    {message.senderName} joined the conversation
                    <span className="h-px flex-1 bg-white/10" />
                  </p>
                )}
                <div
                  className={`flex animate-message-in motion-reduce:animate-none ${
                    message.senderType === "customer" ? "justify-end" : "justify-start"
                  }`}
                >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-5 ${
                    message.senderType === "customer"
                      ? "rounded-br-md bg-brand-500 text-surface-950"
                      : "rounded-bl-md bg-white/[0.06] text-slate-200"
                  }`}
                >
                  {message.senderType !== "customer" && (
                    <p className="mb-1 text-[10px] font-semibold text-brand-300">
                      {message.senderName}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  {message.attachments.map((attachment) => (
                    <button
                      key={attachment.id}
                      type="button"
                      onClick={() => void download(attachment)}
                      className="mt-2 block w-full truncate rounded-lg border border-current/20 px-2 py-1.5 text-left text-[10px] underline-offset-2 hover:underline"
                    >
                      {attachment.fileName}
                    </button>
                  ))}
                  </div>
                </div>
              </div>
            ))}

            {conversation && !agentName && !ended && (
              <div className="animate-message-in rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center motion-reduce:animate-none">
                <span className="mx-auto block h-2 w-2 animate-pulse-soft rounded-full bg-brand-400 motion-reduce:animate-none" />
                <p className="mt-2 text-[11px] font-semibold text-white">
                  Waiting for a support agent to join
                </p>
                <p className="mt-1 text-[10px] leading-4 text-slate-400">
                  You can switch tabs or close this window. We will chime here and
                  email you the moment someone replies.
                </p>
                {canAskAlerts && (
                  <button
                    type="button"
                    onClick={() => void enableAlerts()}
                    className="mt-2.5 rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-semibold text-brand-300 transition-colors hover:border-brand-400/40"
                  >
                    Also alert me on my desktop
                  </button>
                )}
              </div>
            )}
            {conversation?.status === "resolved" && (
              <div className="rounded-xl border border-white/10 p-3 text-center">
                <p className="text-[11px] font-semibold text-white">
                  Was this helpful?
                </p>
                <div className="mt-2 flex justify-center gap-1">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => void rate(score)}
                      aria-label={`Rate support ${score} out of 5`}
                      className={`transition-transform hover:scale-110 ${
                        conversation.satisfactionScore &&
                        score <= conversation.satisfactionScore
                          ? "text-amber-300"
                          : "text-slate-600 hover:text-amber-200"
                      }`}
                    >
                      <Star size={17} fill="currentColor" aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {ended ? (
            <div className="shrink-0 border-t border-white/10 p-3">
              <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <CheckCircle2
                  size={15}
                  aria-hidden
                  className="mt-0.5 shrink-0 text-brand-300"
                />
                <p className="text-[11px] leading-4 text-slate-400">
                  Support closed this conversation. You can still read it here.
                </p>
              </div>
              <button
                type="button"
                onClick={() => startNew()}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-xs font-bold text-surface-950 transition-colors hover:bg-brand-400"
              >
                <MessageSquarePlus size={14} aria-hidden /> Start a new conversation
              </button>
            </div>
          ) : (
            <div className="shrink-0 border-t border-white/10 p-3">
              {error && (
                <p role="alert" className="mb-2 text-[11px] text-bear">
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
                  disabled={busy}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-400 transition-colors hover:text-white disabled:opacity-40"
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
                  placeholder="Message support…"
                  className="app-input min-w-0 flex-1 resize-none text-xs"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-500 text-surface-950 transition-colors hover:bg-brand-400 disabled:opacity-40"
                  aria-label="Send message"
                >
                  <Send size={15} aria-hidden />
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </section>
  );
}
