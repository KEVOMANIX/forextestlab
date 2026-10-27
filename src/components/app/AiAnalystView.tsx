"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUp, BookOpenText, ChevronDown, Loader2, Lock, PanelLeft, PanelLeftClose, PanelLeftOpen, Pin, PinOff, Plus, RotateCcw, Search, Sparkles, Square, Trash2, X } from "lucide-react";

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

/** Per-viewer convenience: whether the chats panel was left collapsed. */
const PANEL_STORAGE_KEY = "ftl.ai.analyst.panelCollapsed";

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

function ago(time: number, now: number): string {
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A session's own name, unless it only repeats the market the card already shows. */
function customName(card: AnalystSessionCard): string | null {
  const firstMarket = card.market.split(" +")[0]!;
  return card.name.startsWith(firstMarket) ? null : card.name;
}

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  const gradient = useId();
  if (values.length < 2) return <span className="block h-14" />;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${38 - ((value - min) / span) * 34}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={`block h-14 w-full ${positive ? "text-profit" : "text-loss"}`} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity={0.28} />
          <stop offset="1" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,40 ${points} 100,40`} fill={`url(#${gradient})`} />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.7} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <span className="min-w-0"><span className="block text-[10.5px] app-muted">{label}</span><span className={`block truncate text-[13px] font-bold ${tone}`}>{value}</span></span>;
}

function SessionCard({ card, onReview, locked }: { card: AnalystSessionCard; onReview: () => void; locked: boolean }) {
  const name = customName(card);
  const positive = card.returnPercent >= 0;
  const body = (
    <>
      {card.category && <span className="inline-flex items-center gap-1.5 self-start rounded-full border app-border bg-[var(--app-panel-2)] px-2 py-px text-[11px] font-semibold"><span className={`h-1.5 w-1.5 rounded-full ${CATEGORY_DOT[card.category]}`} />{card.category}</span>}
      <span className="mt-2 block"><Sparkline values={card.curve} positive={positive} /></span>
      <span className="mt-2 block truncate text-[15px] font-bold" title={name ?? undefined}>{card.market} · {name ?? card.timeframe}</span>
      <span className="block truncate text-[11.5px] app-muted">{name ? `${card.timeframe} · ` : ""}{card.period}</span>
      <span className="mt-2.5 grid grid-cols-3 gap-2 border-t app-border pt-2.5">
        <Stat label="Return" value={percent(card.returnPercent)} tone={positive ? "text-profit" : "text-loss"} />
        <Stat label="Profit factor" value={card.profitFactor === "Not available" ? "n/a" : card.profitFactor} />
        <Stat label="Trades" value={card.trades.toLocaleString("en-US")} />
      </span>
      <span className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-bold text-brand-300 transition-colors group-hover:text-brand-200">{locked && <Lock size={12} aria-hidden />}Review this session <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
    </>
  );
  const className = "group flex min-w-0 flex-col rounded-xl border app-border bg-[var(--app-panel)] p-3 text-left transition-colors hover:border-brand-400/45";
  return locked
    ? <ProLock feature="ai" className={className}>{body}</ProLock>
    : <button type="button" onClick={onReview} className={className}>{body}</button>;
}

function ThreadRow({ thread, active, detail, onOpen, onPin, onDelete }: { thread: AnalystThread; active: boolean; detail: string; onOpen: () => void; onPin: () => void; onDelete: () => void }) {
  return (
    <div className={`group relative flex items-start gap-2 rounded-lg px-2.5 py-2 transition-colors ${active ? "bg-[var(--app-panel-2)]" : "hover:bg-[var(--app-hover)]"}`}>
      <button type="button" onClick={onOpen} aria-current={active ? "true" : undefined} className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:rounded-lg">
        <span className="block truncate text-[13px] font-medium">{thread.title}</span>
        <span className="block truncate text-[11px] app-muted">{detail}</span>
      </button>
      <span className="relative z-10 flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button type="button" onClick={onPin} aria-label={thread.pinned ? "Unpin chat" : "Pin chat"} title={thread.pinned ? "Unpin" : "Pin"} className="grid h-6 w-6 place-items-center rounded-md app-muted hover:text-brand-300">{thread.pinned ? <PinOff size={13} aria-hidden /> : <Pin size={13} aria-hidden />}</button>
        <button type="button" onClick={onDelete} aria-label="Delete chat" title="Delete" className="grid h-6 w-6 place-items-center rounded-md app-muted hover:text-loss"><Trash2 size={13} aria-hidden /></button>
      </span>
    </div>
  );
}

const iconButton = "grid h-8 w-8 shrink-0 place-items-center rounded-lg app-muted transition-colors hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]";

export function AiAnalystView({
  locked,
  firstName,
  cards,
  sessions,
  findings,
}: {
  locked: boolean;
  firstName: string | null;
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
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
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
      setPanelCollapsed(window.localStorage.getItem(PANEL_STORAGE_KEY) === "1");
    } catch {
      // Storage can be blocked; the page still works without saved chats.
    }
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const saveThreads = useCallback((next: AnalystThread[]) => {
    setThreads(next);
    try {
      window.localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode and quota failures are not worth surfacing.
    }
  }, []);

  const setCollapsed = (next: boolean) => {
    setPanelCollapsed(next);
    try {
      window.localStorage.setItem(PANEL_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Not worth surfacing; the panel just opens next time.
    }
  };

  // Save the open conversation once an answer settles.
  useEffect(() => {
    if (loading || !activeId || !messages.length) return;
    const stored = threads.find((thread) => thread.id === activeId);
    if (!stored || (stored.messages.length === messages.length && stored.messages.at(-1)?.text === messages.at(-1)?.text)) return;
    saveThreads(upsertThread(threads, { ...stored, messages, updatedAt: Date.now() }));
  }, [activeId, loading, messages, saveThreads, threads]);

  const focusSearch = useCallback(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setPanelCollapsed(false);
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setChatsOpen(true);
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusSearch]);

  const ask = (question: string, targetSessionId = sessionId, title = threadTitle(question)) => {
    const text = question.trim();
    if (!text || loading || locked) return;
    setInput("");
    let thread = active;
    if (!thread || (thread.sessionId ?? "") !== targetSessionId) {
      thread = { id: crypto.randomUUID(), title, sessionId: targetSessionId || null, pinned: false, updatedAt: Date.now(), messages: [] };
      saveThreads(upsertThread(threads, thread));
      setActiveId(thread.id);
    }
    const history = thread.id === activeId ? messages : [];
    void chat.ask(text, targetSessionId ? { scope: "session", sessionId: targetSessionId } : { scope: "portfolio" }, history);
  };

  const review = (card: AnalystSessionCard) => ask(
    `Review my "${card.name}" session: what worked, what cost me money, and what should I change next time?`,
    card.id,
    `Review · ${card.name}`,
  );

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

  const groups = useMemo(() => groupThreads(threads, query, now), [threads, query, now]);
  const conversation = Boolean(activeId) && messages.length > 0;
  const nothingFound = query.trim() !== "" && !groups.pinned.length && !groups.today.length && !groups.week.length && !groups.earlier.length;

  const chatList = (mobile: boolean) => (
    <>
      <div className="flex items-center gap-2">
        <button type="button" onClick={newChat} className="flex flex-1 items-center gap-2 rounded-lg border border-brand-400/30 bg-brand-400/10 px-3 py-2 text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-400/15"><Plus size={15} aria-hidden />New chat</button>
        {mobile
          ? <button type="button" onClick={() => setChatsOpen(false)} aria-label="Close chats" className={iconButton}><X size={16} aria-hidden /></button>
          : <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse chats" title="Collapse chats" className={`${iconButton} border app-border`}><PanelLeftClose size={15} aria-hidden /></button>}
      </div>
      <label className="mt-1.5 flex items-center gap-2 rounded-lg px-3 py-2 text-sm app-muted focus-within:bg-[var(--app-panel-2)]">
        <Search size={15} aria-hidden />
        <input ref={mobile ? undefined : searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" aria-label="Search chats" className="min-w-0 flex-1 bg-transparent text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)] focus-visible:ring-0 focus-visible:ring-offset-0" />
        <kbd className="rounded border app-border px-1 font-sans text-[10px] app-muted">Ctrl K</kbd>
      </label>
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
        {([["Pinned", groups.pinned], ["Today", groups.today], ["Previous 7 days", groups.week], ["Earlier", groups.earlier]] as const).map(([label, list]) => list.length > 0 && (
          <div key={label} className="mt-3">
            <p className="px-2.5 pb-1 text-[11px] app-muted">{label}</p>
            {list.map((thread) => <ThreadRow key={thread.id} thread={thread} active={thread.id === activeId} detail={`${sessionName(thread.sessionId)} · ${ago(thread.updatedAt, now)}`} onOpen={() => openThread(thread)} onPin={() => togglePin(thread)} onDelete={() => deleteThread(thread)} />)}
          </div>
        ))}
        {!threads.length && <p className="mt-4 px-2.5 text-xs leading-5 app-muted">Your chats appear here. They are saved in this browser.</p>}
        {nothingFound && <p className="mt-4 px-2.5 text-xs app-muted">No chats match “{query}”.</p>}
      </div>
    </>
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] lg:h-dvh">
      {panelCollapsed ? (
        <aside aria-label="AI Analyst chats" className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r app-border bg-[var(--app-sidebar)] py-3 lg:flex">
          <button type="button" onClick={() => setCollapsed(false)} aria-label="Expand chats" title="Expand chats" className={`${iconButton} border app-border`}><PanelLeftOpen size={15} aria-hidden /></button>
          <button type="button" onClick={newChat} aria-label="New chat" title="New chat" className={`${iconButton} mt-2`}><Plus size={16} aria-hidden /></button>
          <button type="button" onClick={focusSearch} aria-label="Search chats" title="Search chats" className={iconButton}><Search size={15} aria-hidden /></button>
        </aside>
      ) : (
        <aside aria-label="AI Analyst chats" className="hidden w-64 shrink-0 flex-col border-r app-border bg-[var(--app-sidebar)] p-3 lg:flex">{chatList(false)}</aside>
      )}
      {chatsOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <aside aria-label="AI Analyst chats" className="flex w-72 max-w-[85vw] flex-col border-r app-border bg-[var(--app-sidebar)] p-3">{chatList(true)}</aside>
          <button type="button" aria-label="Close chats" onClick={() => setChatsOpen(false)} className="flex-1 bg-black/50" />
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b app-border px-4 sm:px-6">
          <button type="button" onClick={() => setChatsOpen(true)} aria-label="Show chats" className={`${iconButton} border app-border lg:hidden`}><PanelLeft size={15} aria-hidden /></button>
          <h1 className="min-w-0 truncate text-[15px] font-bold">{active ? active.title : "New chat"}</h1>
          {active && <span className="hidden min-w-0 items-center gap-1.5 truncate rounded-full border app-border bg-[var(--app-panel)] px-2.5 py-0.5 text-xs app-muted sm:inline-flex"><BookOpenText size={12} className="shrink-0" aria-hidden /><span className="truncate">{sessionName(active.sessionId)}</span></span>}
        </header>

        <div ref={scrollRef} role={conversation ? "log" : undefined} aria-live={conversation ? "polite" : undefined} className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
          {conversation ? (
            <div className="mx-auto w-full max-w-3xl space-y-5 py-6">
              {messages.map((message, index) => message.role === "user" ? (
                <div key={index} className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[var(--app-panel-2)] px-4 py-2.5 text-sm">{message.text}</div></div>
              ) : (
                <div key={index} className="group/answer flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-300 to-brand-600 text-surface-950"><Sparkles size={13} aria-hidden /></span>
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
              <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-brand-200 via-brand-500 to-brand-800 text-surface-950 shadow-[0_0_44px_rgba(45,212,191,0.3)] ring-[5px] ring-brand-400/15"><Sparkles size={28} aria-hidden /></span>
              <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-[28px]">Hi{firstName ? ` ${firstName}` : ""}, I&apos;m your AI Analyst.</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 app-muted">{cards.length ? "Pick a session and I'll review it: what worked, what cost you, and what to change next time." : "Once you have a backtest with closed trades, I can review it for you. You can still ask me anything below."}</p>
              {cards.length > 0 ? (
                <>
                  <div className="mt-6 grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {cards.map((card) => <SessionCard key={card.id} card={card} locked={locked} onReview={() => review(card)} />)}
                  </div>
                  <p className="mt-2.5 w-full text-left text-[11px] app-muted">From your saved sessions. Past results don&apos;t predict future returns.</p>
                </>
              ) : (
                <Link href="/app/backtest" className="btn-primary mt-5 px-4 py-2 text-sm">Start a backtest</Link>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pb-3 sm:px-6">
          {!conversation && !locked && findings.length > 0 && (
            <div className="mx-auto mb-2.5 flex max-w-3xl flex-wrap justify-center gap-2">
              {findings.map((finding) => <button key={finding.kind} type="button" onClick={() => ask(finding.question, "")} className="rounded-full border app-border bg-[var(--app-panel)] px-3 py-1 text-xs app-muted transition-colors hover:border-brand-400/45 hover:text-[var(--app-text)]">{finding.title}</button>)}
            </div>
          )}
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
                className="max-h-40 w-full resize-none border-0 bg-transparent p-0 text-sm outline-none placeholder:text-[var(--app-muted)] focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <div className="mt-1.5 flex items-center gap-3">
                {active ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-full border border-brand-400/35 bg-brand-400/[0.08] px-2.5 py-1 text-xs font-medium text-brand-300"><BookOpenText size={12} className="shrink-0" aria-hidden /><span className="truncate">{sessionName(active.sessionId)}</span></span>
                ) : (
                  <label className="relative inline-flex min-w-0 items-center rounded-full border border-brand-400/35 bg-brand-400/[0.08] text-xs font-medium text-brand-300 focus-within:border-brand-400/70">
                    <BookOpenText size={12} className="pointer-events-none absolute left-2.5" aria-hidden />
                    <select value={draftSessionId} onChange={(event) => setDraftSessionId(event.target.value)} aria-label="What the AI reads" className="min-w-0 max-w-56 appearance-none truncate rounded-full bg-transparent py-1 pl-7 pr-7 outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
                      <option value="">All sessions</option>
                      {sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute right-2.5" aria-hidden />
                  </label>
                )}
                {loading ? (
                  <button type="button" onClick={chat.stop} aria-label="Stop generating" title="Stop generating" className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full border app-border transition-colors hover:border-loss/50 hover:text-loss"><Square size={13} fill="currentColor" aria-hidden /></button>
                ) : (
                  <button type="submit" disabled={!input.trim()} aria-label="Send" className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-surface-950 transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-[var(--app-panel-2)] disabled:text-[var(--app-muted)]"><ArrowUp size={16} aria-hidden /></button>
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
