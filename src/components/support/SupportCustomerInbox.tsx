"use client";

import {
  CheckCheck,
  Headphones,
  Inbox,
  MessageSquarePlus,
  Paperclip,
  Send,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Summary = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  customerUnreadCount: number;
  assignedAgentName: string | null;
  lastMessageAt: string;
  messages: Array<{ body: string }>;
};
type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
};
type Conversation = Omit<Summary, "messages"> & {
  messages: Array<{
    id: string;
    senderType: string;
    senderName: string;
    body: string;
    deliveredAt: string | null;
    readAt: string | null;
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
  const [input, setInput] = useState("");
  const [newOpen, setNewOpen] = useState(initialConversations.length === 0);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refreshList = useCallback(async () => {
    const response = await fetch("/api/support/chat?list=1", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = (await response.json()) as {
      conversations?: Summary[];
    };
    setConversations(payload.conversations ?? []);
  }, []);

  const refreshConversation = useCallback(async () => {
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
    void refreshConversation();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshConversation();
      void refreshList();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [refreshConversation, refreshList]);

  async function send() {
    if (!selectedId || !input.trim() || busy) return;
    const message = input.trim();
    setInput("");
    setBusy(true);
    const response = await fetch("/api/support/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "message",
        conversationId: selectedId,
        message,
        name: customerName,
        clientMessageId: crypto.randomUUID(),
      }),
    });
    const payload = (await response.json()) as {
      message?: string;
      conversation?: Conversation;
    };
    if (!response.ok) {
      setError(payload.message ?? "Message could not be sent.");
      setInput(message);
    } else {
      setConversation(payload.conversation ?? null);
      await refreshList();
    }
    setBusy(false);
  }

  async function create() {
    if (!subject.trim() || !input.trim() || busy) return;
    setBusy(true);
    const response = await fetch("/api/support/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start",
        name: customerName,
        email: customerEmail,
        subject,
        category,
        message: input,
        clientMessageId: crypto.randomUUID(),
        channel: "app",
        context: { page: window.location.href },
      }),
    });
    const payload = (await response.json()) as {
      message?: string;
      conversation?: Conversation;
    };
    if (!response.ok || !payload.conversation) {
      setError(payload.message ?? "Conversation could not be created.");
    } else {
      setSelectedId(payload.conversation.id);
      setConversation(payload.conversation);
      setInput("");
      setSubject("");
      setNewOpen(false);
      await refreshList();
    }
    setBusy(false);
  }

  async function upload(file: File) {
    if (!selectedId || busy) return;
    setBusy(true);
    const form = new FormData();
    form.set("conversationId", selectedId);
    form.set("file", file);
    const response = await fetch("/api/support/attachments", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      setError(payload.message ?? "Upload failed.");
    } else {
      await refreshConversation();
      await refreshList();
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">
            Human support
          </p>
          <h1 className="mt-2 text-3xl font-bold">Your support inbox</h1>
          <p className="mt-2 text-sm app-muted">
            Continue conversations across browsers and keep every reply in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNewOpen(true);
            setConversation(null);
            setInput("");
          }}
          className="btn-primary px-4 py-2.5 text-xs"
        >
          <MessageSquarePlus size={15} /> New conversation
        </button>
      </div>
      <section className="mt-7 grid min-h-[620px] overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)] lg:grid-cols-[320px_1fr]">
        <aside className="border-r app-border">
          <div className="border-b app-border px-4 py-3 text-xs font-semibold">
            Conversations
          </div>
          <div className="max-h-[680px] overflow-y-auto">
            {conversations.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedId(item.id);
                  setNewOpen(false);
                  setConversation(null);
                }}
                className={`block w-full border-b app-border px-4 py-4 text-left ${
                  selectedId === item.id && !newOpen
                    ? "bg-brand-400/[0.07]"
                    : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <strong className="min-w-0 flex-1 truncate text-sm">
                    {item.subject}
                  </strong>
                  {item.customerUnreadCount > 0 && (
                    <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[9px] font-bold text-surface-950">
                      {item.customerUnreadCount}
                    </span>
                  )}
                </div>
                <p className="mt-2 truncate text-xs app-muted">
                  {item.messages[0]?.body}
                </p>
                <p className="mt-2 text-[9px] capitalize app-muted">
                  {item.status.replaceAll("_", " ")}
                </p>
              </button>
            ))}
            {!conversations.length && (
              <div className="px-5 py-12 text-center">
                <Inbox size={24} className="mx-auto text-brand-300" />
                <p className="mt-3 text-xs app-muted">No conversations yet.</p>
              </div>
            )}
          </div>
        </aside>
        {newOpen ? (
          <div className="p-6 sm:p-8">
            <h2 className="text-lg font-semibold">Start a conversation</h2>
            <div className="mt-5 max-w-2xl space-y-3">
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="app-input w-full py-3 text-sm">
                <option value="replay">Replay</option>
                <option value="charts">Charts and drawings</option>
                <option value="orders">Orders and positions</option>
                <option value="market_data">Market data</option>
                <option value="billing">Billing</option>
                <option value="account">Account</option>
                <option value="bug">Bug report</option>
                <option value="feature">Feature request</option>
                <option value="other">Other</option>
              </select>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" className="app-input w-full py-3 text-sm" />
              <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={9} placeholder="Describe how we can help" className="app-input w-full resize-none text-sm" />
              {error && <p role="alert" className="text-xs text-bear">{error}</p>}
              <button type="button" onClick={() => void create()} disabled={busy} className="btn-primary px-5 py-3 text-sm">
                <Send size={15} /> {busy ? "Sending…" : "Send to support"}
              </button>
            </div>
          </div>
        ) : conversation ? (
          <div className="flex min-h-0 flex-col">
            <header className="flex items-center gap-3 border-b app-border px-5 py-4">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-400/10 text-brand-300"><Headphones size={17} /></span>
              <div>
                <h2 className="font-semibold">{conversation.subject}</h2>
                <p className="mt-1 text-[10px] capitalize app-muted">{conversation.assignedAgentName || "Support queue"} · {conversation.status.replaceAll("_", " ")}</p>
              </div>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              {conversation.messages.map((message) => (
                <article key={message.id} className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${message.senderType === "customer" ? "ml-auto bg-brand-500 text-surface-950" : "mr-auto border border-brand-400/20 bg-brand-400/[0.08]"}`}>
                  <p className="text-[10px] font-semibold opacity-70">{message.senderName}</p>
                  <p className="mt-1 whitespace-pre-wrap leading-6">{message.body}</p>
                  {message.attachments.map((attachment) => (
                    <a key={attachment.id} href={`/api/support/attachments/${attachment.id}`} className="mt-2 block text-xs underline">{attachment.fileName}</a>
                  ))}
                  {message.senderType === "customer" && <p className="mt-1 flex justify-end text-[9px] opacity-60"><CheckCheck size={11} /> {message.readAt ? "Read" : "Delivered"}</p>}
                </article>
              ))}
            </div>
            <div className="border-t app-border p-4">
              {error && <p role="alert" className="mb-2 text-xs text-bear">{error}</p>}
              <div className="flex items-end gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary h-11 w-11 p-0" aria-label="Attach file"><Paperclip size={15} /></button>
                <input ref={fileRef} type="file" className="hidden" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
                <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={2} placeholder="Reply to support…" className="app-input min-w-0 flex-1 resize-none text-sm" />
                <button type="button" onClick={() => void send()} disabled={busy || !input.trim()} className="btn-primary h-11 px-4"><Send size={15} /></button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid place-items-center p-10 text-center">
            <div><Headphones size={30} className="mx-auto text-brand-300" /><p className="mt-4 text-sm app-muted">Loading conversation…</p></div>
          </div>
        )}
      </section>
    </div>
  );
}
