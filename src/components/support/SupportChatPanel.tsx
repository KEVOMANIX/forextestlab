"use client";

import { Headset, Paperclip, Plus, Send, Star, X } from "lucide-react";
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

/**
 * The panel only polls while it is open and visible, so a widget mounted on
 * every page costs nothing until somebody actually asks for help.
 */
const POLL_INTERVAL_MS = 10_000;

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
  const [conversation, setConversation] =
    useState<SupportChatConversation | null>(null);
  const [previous, setPrevious] = useState<SupportChatSummary[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const select = useCallback((id: string) => {
    setConversationId(id);
    setConversation(null);
    setError("");
    if (id) window.localStorage.setItem(SUPPORT_ACTIVE_KEY, id);
    else window.localStorage.removeItem(SUPPORT_ACTIVE_KEY);
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
      if (response.status === 404) select("");
      return;
    }
    const payload = (await response.json()) as {
      conversation?: SupportChatConversation | null;
    };
    if (!payload.conversation) return;
    setConversation(payload.conversation);
    if (payload.conversation.customerUnreadCount > 0) {
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
    if (!conversationId) void loadPrevious();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadThread();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [conversationId, loadPrevious, loadThread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
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
    setInput("");
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
    else setConversation(payload.conversation);
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

  const closed = conversation?.status === "closed";
  const subtitle = conversation?.assignedAgentName
    ? `${conversation.assignedAgentName} is on this conversation`
    : conversationId
      ? "Sent — we reply here and by email"
      : "Usually answered within one business day";

  // `app-theme-surface` carries the --app-* variables the shared input styles
  // read: the widget also mounts on marketing pages, which sit outside the app
  // shell that normally defines them.
  return (
    <section
      id="support-panel"
      aria-label="ForexTestLab support"
      className="app-theme-surface fixed bottom-24 right-4 z-[120] flex h-[560px] max-h-[calc(100dvh-7rem)] w-[min(calc(100vw-2rem),380px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-900 shadow-2xl shadow-black/50"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-400/15 text-brand-200">
          <Headset size={17} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">Support</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">{subtitle}</p>
        </div>
        {conversationId && (
          <button
            type="button"
            onClick={() => {
              select("");
              setInput("");
              void loadPrevious();
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Start a new conversation"
          >
            <Plus size={16} aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Close support"
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      {!conversationId ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="text-sm leading-6 text-slate-300">
            Tell us what you need help with. We’ll reply right here and email you
            a copy.
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
              className="w-full rounded-lg bg-brand-500 px-4 py-3 text-xs font-bold text-surface-950 transition-opacity disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send message"}
            </button>
          </div>

          {previous.length > 0 && (
            <div className="mt-6 border-t border-white/10 pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Earlier conversations
              </p>
              <div className="mt-2 space-y-1.5">
                {previous.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => select(item.id)}
                    className="block w-full rounded-lg border border-white/10 px-3 py-2 text-left hover:border-brand-400/30 hover:bg-white/[0.03]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white">
                        {item.subject}
                      </span>
                      {item.customerUnreadCount > 0 && (
                        <span className="rounded-full bg-brand-500 px-1.5 text-[8px] font-bold text-surface-950">
                          {item.customerUnreadCount}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[10px] text-slate-500">
                      {item.messages[0]?.body}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
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
            {conversation?.messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.senderType === "customer" ? "justify-end" : "justify-start"}`}
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
                  <p className="whitespace-pre-wrap">{message.body}</p>
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
            ))}
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
                      className={
                        conversation.satisfactionScore &&
                        score <= conversation.satisfactionScore
                          ? "text-amber-300"
                          : "text-slate-600 hover:text-amber-200"
                      }
                    >
                      <Star size={17} fill="currentColor" aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="shrink-0 border-t border-white/10 p-3">
            {error && (
              <p role="alert" className="mb-2 text-[10px] text-bear">
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
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-400 hover:text-white disabled:opacity-40"
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
                placeholder={closed ? "This conversation is closed" : "Message support…"}
                className="app-input min-w-0 flex-1 resize-none text-xs"
              />
              <button
                type="submit"
                disabled={busy || closed || !input.trim()}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-500 text-surface-950 disabled:opacity-40"
                aria-label="Send message"
              >
                <Send size={15} aria-hidden />
              </button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
