"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUp, Loader2, Lock, MessageSquare, PanelLeft, Pin, PinOff, Plus, RotateCcw, Search, Sparkles, Square, Trash2, X } from "lucide-react";

import { CopyAnswer, RichText } from "./AiInsightsPanel";
import { ProLock } from "./ProLock";
import { useAiChat } from "./useAiChat";
import type { AnalystSessionCard } from "@/lib/ai/analyst";
import { THREADS_STORAGE_KEY, groupThreads, parseThreads, threadTitle, upsertThread, type AnalystThread } from "@/lib/ai/analyst-threads";
import type { Finding } from "@/lib/ai/findings";

export interface AnalystSessionOption {
  id: string;
  name: string;
}

const CATEGORY_DOT: Record<NonNullable<AnalystSessionCard["category"]>, string> = {
  Forex: "bg-brand-400",
  Metals: "bg-amber-300",
  Crypto: "bg-violet-400",
  Indices: "bg-sky-400",
  Stocks: "bg-slate-400",
};

function percent(value: number): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

function cardStats(card: AnalystSessionCard): string {
  return [
    percent(card.returnPercent),
    `PF ${card.profitFactor === "Not available" ? "n/a" : card.profitFactor}`,
    card.maxDrawdownPercent === "Not available" ? null : `DD ${card.maxDrawdownPercent}%`,
    `${card.trades.toLocaleString("en-US")} trade${card.trades === 1 ? "" : "s"}`,
  ].filter(Boolean).join(" · ");
}

function reviewQuestion(card: AnalystSessionCard): string {
  return `Review my "${card.name}" session: what worked, what cost me money, and what should I change next time?`;
}

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return <span className="block h-14" />;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${38 - ((value - min) / span) * 34}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={`block h-14 w-full ${positive ? "text-profit" : "text-loss"}`} aria-hidden>
      <polygon points={`0,40 ${points} 100,40`} fill="currentColor" opacity={0.12} />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function SessionCard({ card, onReview, locked }: { card: AnalystSessionCard; onReview: () => void; locked: boolean }) {
  const body = (
    <>
      {card.category && <span className="inline-flex items-center gap-1.5 rounded-full border app-border bg-[var(--app-panel-2)] px-2 py-px text-[11px] font-semibold"><span className={`h-1.5 w-1.5 rounded-full ${CATEGORY_DOT[card.category]}`} />{card.category}</span>}
      <span className="mt-2 block"><Sparkline values={card.curve} positive={card.returnPercent >= 0} /></span>
      <span className="mt-2 block truncate text-[15px] font-bold">{card.market} · {card.timeframe}</span>
      <span className="block truncate text-xs app-muted">{card.name}</span>
      <span className={`mt-1 block text-xs font-semibold ${card.returnPercent < 0 ? "text-loss" : ""}`}>{cardStats(card)}</span>
      <span className="block text-[11px] app-muted">{card.period}</span>
      <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-bold transition-colors group-hover:text-brand-300">{locked && <Lock size={12} aria-hidden />}Review this session <ArrowRight size={14} aria-hidden /></span>
    </>
  );
  const className = "group flex min-w-0 flex-col rounded-xl border app-border bg-[var(--app-panel)] p-3 text-left transition-colors hover:border-brand-400/45";
  return locked
    ? <ProLock feature="ai" className={className}>{body}</ProLock>
    : <button type="button" onClick={onReview} className={className}>{body}</button>;
}

function ThreadRow({ thread, active, sessionName, onOpen, onPin, onDelete }: { thread: AnalystThread; active: boolean; sessionName: string; onOpen: () => void; onPin: () => void; onDelete: () => void }) {
  return (
    <div className={`group relative flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${active ? "bg-[var(--app-panel-2)]" : "hover:bg-[var(--app-hover)]"}`}>
      <MessageSquare size={15} className="mt-0.5 shrink-0 app-muted" aria-hidden />
      <button type="button" onClick={onOpen} aria-current={active ? "true" : undefined} className="min-w-0 flex-1 text-left after:absolute after:inset-0">
        <span className="block truncate text-[13px] font-medium">{thread.title}</span>
        <span className="block truncate text-[11px] app-muted">{sessionName}</span>
      </button>
      <span className="relative z-10 flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button type="button" onClick={onPin} aria-label={thread.pinned ? "Unpin chat" : "Pin chat"} title={thread.pinned ? "Unpin" : "Pin"} className="grid h-6 w-6 place-items-center rounded-md app-muted hover:text-brand-300">{thread.pinned ? <PinOff size={13} aria-hidden /> : <Pin size={13} aria-hidden />}</button>
        <button type="button" onClick={onDelete} aria-label="Delete chat" title="Delete" className="grid h-6 w-6 place-items-center rounded-md app-muted hover:text-loss"><Trash2 size={13} aria-hidden /></button>
      </span>
    </div>
  );
}

export function AiAnalystView({
  locked,
  cards,
  sessions,
  findings,
}: {
  locked: boolean;
  cards: AnalystSessionCard[];
  sessions: AnalystSessionOption[];
  findings: Finding[];
}) {
  const [threads, setThreads] = useState<AnalystThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  /** The session a new chat will read; empty for all sessions. */
  const [draftSessionId, setDraftSessionId] = useState("");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [chatsOpen, setChatsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
  }, []);
  const chat = useAiChat({ onChunk: scrollDown });
  const { messages, loading, error, failed } = chat;

  const active = threads.find((thread) => thread.id === activeId) ?? null;
  const sessionId = active ? active.sessionId ?? "" : draftSessionId;
  const sessionName = useCallback((id: string | null) => (id ? sessions.find((session) => session.id === id)?.name ?? "A deleted session" : "All sessions"), [sessions]);

  useEffect(() => {
    try {
      setThreads(parseThreads(window.localStorage.getItem(THREADS_STORAGE_KEY)));
    } catch {
      // Storage can be blocked; the page still works without saved chats.
    }
  }, []);

  const saveThreads = useCallback((next: AnalystThread[]) => {
    setThreads(next);
    try {
      window.localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode and quota failures are not worth surfacing.
    }
  }, []);

  // Save the open conversation once an answer settles.
  useEffect(() => {
    if (loading || !activeId || !messages.length) return;
    const stored = threads.find((thread) => thread.id === activeId);
    if (!stored || (stored.messages.length === messages.length && stored.messages.at(-1)?.text === messages.at(-1)?.text)) return;
    saveThreads(upsertThread(threads, { ...stored, messages, updatedAt: Date.now() }));
  }, [activeId, loading, messages, saveThreads, threads]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (window.matchMedia("(min-width: 1024px)").matches) searchRef.current?.focus();
        else setChatsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ask = (question: string, targetSessionId = sessionId) => {
    const text = question.trim();
    if (!text || loading || locked) return;
    setInput("");
    let thread = active;
    if (!thread || (thread.sessionId ?? "") !== targetSessionId) {
      thread = { id: crypto.randomUUID(), title: threadTitle(text), sessionId: targetSessionId || null, pinned: false, updatedAt: Date.now(), messages: [] };
      saveThreads(upsertThread(threads, thread));
      setActiveId(thread.id);
    }
    const history = thread.id === activeId ? messages : [];
    void chat.ask(text, targetSessionId ? { scope: "session", sessionId: targetSessionId } : { scope: "portfolio" }, history);
  };

  const openThread = (thread: AnalystThread) => {
    chat.reset(thread.messages);
    setActiveId(thread.id);
    setChatsOpen(false);
    scrollDown();
  };
  const newChat = () => {
    chat.reset();
    setActiveId(null);
    setChatsOpen(false);
    inputRef.current?.focus();
  };
  const togglePin = (thread: AnalystThread) => saveThreads(threads.map((item) => (item.id === thread.id ? { ...item, pinned: !item.pinned } : item)));
  const deleteThread = (thread: AnalystThread) => {
    if (thread.id === activeId) newChat();
    saveThreads(threads.filter((item) => item.id !== thread.id));
  };

  const groups = useMemo(() => groupThreads(threads, query, Date.now()), [threads, query]);
  const conversation = Boolean(activeId) && messages.length > 0;

  const chatList = (mobile: boolean) => (
    <>
      <div className="flex items-center justify-between gap-2 px-1 pb-3">
        <p className="flex items-center gap-2 text-[15px] font-bold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand-300 to-brand-600 text-surface-950"><Sparkles size={14} aria-hidden /></span>AI Analyst</p>
        <button type="button" onClick={() => setChatsOpen(false)} aria-label="Close chats" className="grid h-8 w-8 place-items-center rounded-lg app-muted hover:text-[var(--app-text)] lg:hidden"><X size={16} aria-hidden /></button>
      </div>
      <button type="button" onClick={newChat} className="flex items-center gap-2 rounded-lg border border-brand-400/30 bg-brand-400/10 px-3 py-2 text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-400/15"><Plus size={15} aria-hidden />New chat</button>
      <label className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm app-muted focus-within:bg-[var(--app-panel-2)]">
        <Search size={15} aria-hidden />
        <input ref={mobile ? undefined : searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" aria-label="Search chats" className="min-w-0 flex-1 bg-transparent text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)]" />
        <kbd className="text-[10px] app-muted">Ctrl K</kbd>
      </label>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {([["Pinned", groups.pinned], ["Today", groups.today], ["Previous 7 days", groups.week], ["Earlier", groups.earlier]] as const).map(([label, list]) => (label === "Pinned" || list.length > 0) && (
          <div key={label} className="mt-3">
            <p className="px-2.5 pb-1 text-[11px] app-muted">{label}</p>
            {list.length
              ? list.map((thread) => <ThreadRow key={thread.id} thread={thread} active={thread.id === activeId} sessionName={sessionName(thread.sessionId)} onOpen={() => openThread(thread)} onPin={() => togglePin(thread)} onDelete={() => deleteThread(thread)} />)
              : <p className="px-2.5 text-xs app-muted">Pin a chat to keep it here.</p>}
          </div>
        ))}
        {!threads.length && <p className="mt-4 px-2.5 text-xs leading-5 app-muted">Your chats appear here. They are saved in this browser.</p>}
        {threads.length > 0 && query && !groups.pinned.length && !groups.today.length && !groups.week.length && !groups.earlier.length && <p className="mt-4 px-2.5 text-xs app-muted">No chats match “{query}”.</p>}
      </div>
    </>
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] lg:h-dvh">
      <aside aria-label="AI Analyst chats" className="hidden w-64 shrink-0 flex-col border-r app-border bg-[var(--app-sidebar)] p-3 lg:flex">{chatList(false)}</aside>
      {chatsOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <aside aria-label="AI Analyst chats" className="flex w-72 max-w-[85vw] flex-col border-r app-border bg-[var(--app-sidebar)] p-3">{chatList(true)}</aside>
          <button type="button" aria-label="Close chats" onClick={() => setChatsOpen(false)} className="flex-1 bg-black/50" />
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b app-border px-4 sm:px-6">
          <button type="button" onClick={() => setChatsOpen(true)} aria-label="Show chats" className="grid h-8 w-8 place-items-center rounded-lg border app-border app-muted lg:hidden"><PanelLeft size={15} aria-hidden /></button>
          <h1 className="flex min-w-0 items-center gap-2 text-[15px] font-bold">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-300 to-brand-600 text-surface-950"><Sparkles size={14} aria-hidden /></span>
            <span className="truncate">{active ? active.title : "Your AI Analyst"}</span>
            <span className="shrink-0 rounded border app-border px-1.5 text-[9px] font-bold tracking-[0.1em] app-muted">BETA</span>
          </h1>
          {(conversation || activeId) && <button type="button" onClick={newChat} className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-400/55 px-3 py-1.5 text-[13px] font-semibold text-brand-300 transition-colors hover:bg-brand-400/10"><Plus size={14} aria-hidden />New chat</button>}
        </header>

        <div ref={scrollRef} role={conversation ? "log" : undefined} aria-live={conversation ? "polite" : undefined} className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
          {conversation ? (
            <div className="mx-auto w-full max-w-3xl space-y-5 py-6">
              {messages.map((message, index) => message.role === "user" ? (
                <div key={index} className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[var(--app-panel-2)] px-4 py-2.5 text-sm">{message.text}</div></div>
              ) : (
                <div key={index} className="group/answer flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-300 to-brand-600 text-surface-950"><Sparkles size={14} aria-hidden /></span>
                  <div className="min-w-0 flex-1 text-sm leading-6">
                    {message.text
                      ? <><RichText text={message.text} />{!(loading && index === messages.length - 1) && <CopyAnswer text={message.text} />}</>
                      : <span className="flex items-center gap-2 app-muted"><Loader2 size={14} className="animate-spin" aria-hidden />Analysing…</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center py-8 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-brand-700 text-surface-950 shadow-[0_0_40px_rgba(45,212,191,0.35)] ring-4 ring-brand-400/15"><Sparkles size={28} aria-hidden /></span>
              <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-[28px]">Hi, I&apos;m your AI Analyst.</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 app-muted">{cards.length ? "Pick a session and I'll review it: what worked, what cost you, and what to change next time." : "Once you have a backtest with closed trades, I can review it for you. You can still ask me anything below."}</p>
              {cards.length > 0 ? (
                <>
                  <div className="mt-6 grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {cards.map((card) => <SessionCard key={card.id} card={card} locked={locked} onReview={() => ask(reviewQuestion(card), card.id)} />)}
                  </div>
                  <p className="mt-2.5 w-full text-left text-[11px] app-muted">From your saved sessions. Past results don&apos;t predict future returns.</p>
                </>
              ) : (
                <Link href="/app/backtest" className="btn-primary mt-5 px-4 py-2 text-sm">Start a backtest</Link>
              )}
              {!locked && findings.length > 0 && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {findings.map((finding) => <button key={finding.kind} type="button" onClick={() => ask(finding.question, "")} className="rounded-full border app-border px-3 py-1.5 text-xs app-muted transition-colors hover:border-brand-400/45 hover:text-[var(--app-text)]">{finding.title}</button>)}
                </div>
              )}
              {!locked && <button type="button" onClick={() => inputRef.current?.focus()} className="mt-5 text-sm font-semibold text-brand-300 hover:text-brand-200">Skip, I&apos;ll type my own</button>}
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pb-2 sm:px-6">
          {error && (
            <div className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center justify-between gap-2 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">
              <span role="alert">{error}</span>
              {failed && <button type="button" onClick={() => ask(failed)} className="inline-flex items-center gap-1.5 rounded-md border border-loss/40 px-2 py-1 font-semibold transition-colors hover:bg-loss/15"><RotateCcw size={12} aria-hidden />Retry</button>}
            </div>
          )}
          {locked ? (
            <ProLock feature="ai" className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-2xl border app-border bg-[var(--app-panel)] px-4 py-4 text-left text-sm app-muted transition-colors hover:border-brand-400/45">
              <span>Ask anything about your trades…</span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-brand-300"><Lock size={14} aria-hidden />Unlock with Pro</span>
            </ProLock>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); ask(input); }} className="mx-auto max-w-3xl rounded-2xl border app-border bg-[var(--app-panel)] px-3.5 pb-2.5 pt-3 transition-colors focus-within:border-brand-400/50">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    ask(input);
                  }
                }}
                rows={2}
                placeholder={conversation ? "Ask a follow-up…" : "Or ask anything about your trades…"}
                aria-label="Ask the AI Analyst a question"
                className="max-h-40 w-full resize-none bg-transparent text-sm outline-none placeholder:text-[var(--app-muted)]"
              />
              <div className="mt-1 flex items-center gap-3">
                {active ? (
                  <span className="truncate text-xs app-muted">Reading {sessionName(active.sessionId)}</span>
                ) : (
                  <label className="flex min-w-0 items-center gap-1.5 text-xs app-muted">
                    <span className="shrink-0">Reading</span>
                    <select value={draftSessionId} onChange={(event) => setDraftSessionId(event.target.value)} className="min-w-0 max-w-56 truncate rounded-md bg-transparent py-1 font-semibold text-[var(--app-text)] outline-none hover:bg-[var(--app-panel-2)]">
                      <option value="">All sessions</option>
                      {sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}
                    </select>
                  </label>
                )}
                {loading ? (
                  <button type="button" onClick={chat.stop} aria-label="Stop generating" title="Stop generating" className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full border app-border transition-colors hover:border-loss/50 hover:text-loss"><Square size={13} fill="currentColor" aria-hidden /></button>
                ) : (
                  <button type="submit" disabled={!input.trim()} aria-label="Send" className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--app-text)] text-[var(--app-bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"><ArrowUp size={16} aria-hidden /></button>
                )}
              </div>
            </form>
          )}
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] app-muted">AI can make mistakes. These are historical simulations, not financial advice.</p>
        </div>
      </section>
    </div>
  );
}
