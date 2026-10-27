"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUp, BookOpenText, ChevronDown, ClipboardList, Loader2, Lock, Mic, MicOff, PanelLeft, PanelLeftClose, PanelLeftOpen, Pin, PinOff, Plus, RotateCcw, Search, Sparkles, Square, Trash2, X } from "lucide-react";

import { CopyAnswer, RichText } from "./AiInsightsPanel";
import { ProLock } from "./ProLock";
import { TradeLinkProvider, type TradeLinkResolver } from "./TradeFocusContext";
import { useAiChat } from "./useAiChat";
import { useSpeechInput } from "./useSpeechInput";
import type { AnalystSessionCard } from "@/lib/ai/analyst";
import { THREADS_STORAGE_KEY, groupThreads, threadTitle, type ChatSummary } from "@/lib/ai/analyst-threads";
import type { Finding } from "@/lib/ai/findings";
import { sessionRef } from "@/lib/ai/trade-query";

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

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
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

function ThreadRow({ thread, active, detail, onOpen, onPin, onDelete }: { thread: ChatSummary; active: boolean; detail: string; onOpen: () => void; onPin: () => void; onDelete: () => void }) {
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

/** The trader's own rules, given to the AI with every question. */
function TradingPlanDialog({ open, onClose, initialRules, maxLength, onSaved }: { open: boolean; onClose: () => void; initialRules: string; maxLength: number; onSaved: (rules: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rules, setRules] = useState(initialRules);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setRules(initialRules);
      setError(null);
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [open, initialRules]);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await requestJson<{ rules: string }>("/api/ai/plan", { method: "PUT", body: JSON.stringify({ rules }) });
      onSaved(data.rules);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your plan.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="trading-plan-title" className="w-[min(92vw,36rem)] rounded-2xl border app-border bg-[var(--app-panel-solid)] p-0 text-[var(--app-text)] shadow-2xl backdrop:bg-black/50">
      <div className="flex items-center justify-between border-b app-border px-5 py-4">
        <h2 id="trading-plan-title" className="text-[15px] font-semibold">Your trading plan</h2>
        <button type="button" onClick={onClose} aria-label="Close" className={iconButton}><X size={16} aria-hidden /></button>
      </div>
      <div className="px-5 py-4">
        <p className="text-[13px] leading-5 app-muted">Write the rules you trade by. The AI Analyst reads them with every question and tells you when your trades broke them.</p>
        <textarea value={rules} onChange={(event) => setRules(event.target.value.slice(0, maxLength))} rows={9} placeholder={"For example:\n- Risk 1% per trade, never more\n- Trade London and the New York open only\n- No new trades 30 minutes either side of high-impact news\n- Stop after 2 losses in a day"} aria-label="Your trading rules" className="mt-3 w-full resize-y rounded-xl border app-border bg-[var(--app-panel)] px-3.5 py-3 text-sm outline-none placeholder:text-[var(--app-muted)] focus:border-brand-400/60 focus-visible:ring-0 focus-visible:ring-offset-0" />
        <p className="mt-1 text-right text-[11px] app-muted">{rules.length.toLocaleString("en-US")} / {maxLength.toLocaleString("en-US")}</p>
        {error && <p role="alert" className="mt-2 text-xs text-loss">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t app-border px-5 py-3">
        <button type="button" onClick={onClose} className="rounded-lg border app-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-[var(--app-panel-2)]">Cancel</button>
        <button type="button" onClick={save} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">{saving ? "Saving…" : "Save plan"}</button>
      </div>
    </dialog>
  );
}

export function AiAnalystView({
  locked,
  firstName,
  cards,
  sessions,
  findings,
  initialChats,
  initialPlan,
  planMaxLength,
}: {
  locked: boolean;
  firstName: string | null;
  cards: AnalystSessionCard[];
  sessions: AnalystSessionOption[];
  findings: Finding[];
  initialChats: ChatSummary[];
  initialPlan: string;
  planMaxLength: number;
}) {
  const [chats, setChats] = useState<ChatSummary[]>(initialChats);
  const [activeId, setActiveId] = useState<string | null>(null);
  /** The session a new chat will read; empty for all sessions. */
  const [draftSessionId, setDraftSessionId] = useState("");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [chatsOpen, setChatsOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [plan, setPlan] = useState(initialPlan);
  const [planOpen, setPlanOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
  }, []);
  const chat = useAiChat({ onChunk: scrollDown });
  const { messages, loading, error, failed } = chat;
  const speech = useSpeechInput((text) => setInput((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text)));
  const busy = loading || starting;

  const active = chats.find((item) => item.id === activeId) ?? null;
  const sessionId = active ? active.sessionId ?? "" : draftSessionId;
  const sessionName = useCallback((id: string | null) => (id ? sessions.find((session) => session.id === id)?.name ?? "A deleted session" : "All sessions"), [sessions]);

  useEffect(() => {
    try {
      setPanelCollapsed(window.localStorage.getItem(PANEL_STORAGE_KEY) === "1");
    } catch {
      // Storage can be blocked; the panel just starts open.
    }
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Chats the first version of this page kept in the browser move to the account once.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THREADS_STORAGE_KEY);
    } catch {
      return;
    }
    if (!stored || locked) return;
    void fetch("/api/ai/chats/import", { method: "POST", body: stored })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { chats: ChatSummary[] }) => {
        setChats(data.chats);
        window.localStorage.removeItem(THREADS_STORAGE_KEY);
      })
      .catch(() => undefined);
  }, [locked]);

  // When an answer settles, the chat moves to the top of the list.
  const wasLoading = useRef(false);
  useEffect(() => {
    if (wasLoading.current && !loading && activeId) {
      const time = Date.now();
      setChats((current) => current.map((item) => (item.id === activeId ? { ...item, updatedAt: time } : item)));
    }
    wasLoading.current = loading;
  }, [activeId, loading]);

  const setCollapsed = (next: boolean) => {
    setPanelCollapsed(next);
    try {
      window.localStorage.setItem(PANEL_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Not worth surfacing; the panel just opens next time.
    }
  };

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

  const ask = async (question: string, targetSessionId = sessionId, title = threadTitle(question)) => {
    const text = question.trim();
    if (!text || busy || locked) return;
    speech.stop();
    setInput("");
    setPageError(null);
    let target = active;
    if (!target || (target.sessionId ?? "") !== targetSessionId) {
      setStarting(true);
      try {
        const data = await requestJson<{ chat: ChatSummary }>("/api/ai/chats", { method: "POST", body: JSON.stringify({ title, sessionId: targetSessionId || null }) });
        target = data.chat;
        setChats((current) => [data.chat, ...current]);
        setActiveId(data.chat.id);
      } catch (caught) {
        setInput(text);
        setPageError(caught instanceof Error ? caught.message : "Could not start a chat.");
        return;
      } finally {
        setStarting(false);
      }
    }
    const history = target.id === activeId ? messages : [];
    void chat.ask(text, targetSessionId ? { scope: "session", sessionId: targetSessionId, chatId: target.id } : { scope: "portfolio", chatId: target.id }, history);
  };

  const review = (card: AnalystSessionCard) => ask(
    `Review my "${card.name}" session: what worked, what cost me money, and what should I change next time?`,
    card.id,
    `Review · ${card.name}`,
  );

  const openThread = async (thread: ChatSummary) => {
    if (busy) return;
    setChatsOpen(false);
    setPageError(null);
    setActiveId(thread.id);
    chat.reset();
    setOpening(true);
    try {
      const data = await requestJson<{ chat: { messages: { role: "user" | "model"; text: string }[] } }>(`/api/ai/chats/${encodeURIComponent(thread.id)}`);
      chat.reset(data.chat.messages);
      scrollDown();
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : "Could not open that chat.");
    } finally {
      setOpening(false);
    }
  };
  const newChat = () => {
    chat.reset();
    setActiveId(null);
    setChatsOpen(false);
    setPageError(null);
    inputRef.current?.focus();
  };
  const togglePin = (thread: ChatSummary) => {
    setChats((current) => current.map((item) => (item.id === thread.id ? { ...item, pinned: !thread.pinned } : item)));
    void requestJson(`/api/ai/chats/${encodeURIComponent(thread.id)}`, { method: "PATCH", body: JSON.stringify({ pinned: !thread.pinned }) })
      .catch(() => setChats((current) => current.map((item) => (item.id === thread.id ? { ...item, pinned: thread.pinned } : item))));
  };
  const deleteThread = (thread: ChatSummary) => {
    if (thread.id === activeId) newChat();
    setChats((current) => current.filter((item) => item.id !== thread.id));
    void fetch(`/api/ai/chats/${encodeURIComponent(thread.id)}`, { method: "DELETE" });
  };

  // Cited trades open the analytics ledger on that trade: the session comes from
  // the citation, or from the chat when it is about one session.
  const tradeLink = useCallback<TradeLinkResolver>((tradeNumber, ref) => {
    const id = ref ? sessions.find((session) => sessionRef(session.id) === ref)?.id : active?.sessionId;
    if (!id || tradeNumber < 1) return null;
    return { href: `/app/analytics?session=${encodeURIComponent(id)}&trade=${tradeNumber}`, label: `Open trade ${tradeNumber} of ${sessionName(id)}` };
  }, [active?.sessionId, sessionName, sessions]);

  const groups = useMemo(() => groupThreads(chats, query, now), [chats, query, now]);
  const conversation = Boolean(activeId) && (messages.length > 0 || opening);
  const nothingFound = query.trim() !== "" && !groups.pinned.length && !groups.today.length && !groups.week.length && !groups.earlier.length;
  const shownError = pageError ?? error ?? speech.error;

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
      {!locked && (
        <button type="button" onClick={() => setPlanOpen(true)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm app-muted transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]">
          <ClipboardList size={15} aria-hidden /><span className="flex-1">Trading plan</span>
          <span className={`text-[11px] ${plan ? "text-brand-300" : ""}`}>{plan ? "Set" : "Add"}</span>
        </button>
      )}
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
        {([["Pinned", groups.pinned], ["Today", groups.today], ["Previous 7 days", groups.week], ["Earlier", groups.earlier]] as const).map(([label, list]) => list.length > 0 && (
          <div key={label} className="mt-3">
            <p className="px-2.5 pb-1 text-[11px] app-muted">{label}</p>
            {list.map((thread) => <ThreadRow key={thread.id} thread={thread} active={thread.id === activeId} detail={`${sessionName(thread.sessionId)} · ${ago(thread.updatedAt, now)}`} onOpen={() => void openThread(thread)} onPin={() => togglePin(thread)} onDelete={() => deleteThread(thread)} />)}
          </div>
        ))}
        {!chats.length && <p className="mt-4 px-2.5 text-xs leading-5 app-muted">Your chats appear here, saved to your account.</p>}
        {nothingFound && <p className="mt-4 px-2.5 text-xs app-muted">No chats match “{query}”.</p>}
      </div>
    </>
  );

  return (
    <TradeLinkProvider value={tradeLink}>
    <div className="flex h-[calc(100dvh-3.5rem)] lg:h-dvh">
      {panelCollapsed ? (
        <aside aria-label="AI Analyst chats" className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r app-border bg-[var(--app-sidebar)] py-3 lg:flex">
          <button type="button" onClick={() => setCollapsed(false)} aria-label="Expand chats" title="Expand chats" className={`${iconButton} border app-border`}><PanelLeftOpen size={15} aria-hidden /></button>
          <button type="button" onClick={newChat} aria-label="New chat" title="New chat" className={`${iconButton} mt-2`}><Plus size={16} aria-hidden /></button>
          <button type="button" onClick={focusSearch} aria-label="Search chats" title="Search chats" className={iconButton}><Search size={15} aria-hidden /></button>
          {!locked && <button type="button" onClick={() => setPlanOpen(true)} aria-label="Trading plan" title="Trading plan" className={iconButton}><ClipboardList size={15} aria-hidden /></button>}
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
              {opening && <p className="flex items-center gap-2 text-sm app-muted"><Loader2 size={14} className="animate-spin" aria-hidden />Opening chat…</p>}
              {messages.map((message, index) => message.role === "user" ? (
                <div key={index} className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[var(--app-panel-2)] px-4 py-2.5 text-sm">{message.text}</div></div>
              ) : (
                <div key={index} className="group/answer flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-300 to-brand-600 text-surface-950"><Sparkles size={13} aria-hidden /></span>
                  <div className="min-w-0 flex-1 text-sm leading-6">
                    {message.text
                      ? <><RichText text={message.text} />{!(loading && index === messages.length - 1) && <CopyAnswer text={message.text} />}</>
                      : <span className="flex items-center gap-2 app-muted"><Loader2 size={14} className="animate-spin" aria-hidden />Looking through your trades…</span>}
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
                    {cards.map((card) => <SessionCard key={card.id} card={card} locked={locked} onReview={() => void review(card)} />)}
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
              {findings.map((finding) => <button key={finding.kind} type="button" onClick={() => void ask(finding.question, "")} className="rounded-full border app-border bg-[var(--app-panel)] px-3 py-1 text-xs app-muted transition-colors hover:border-brand-400/45 hover:text-[var(--app-text)]">{finding.title}</button>)}
            </div>
          )}
          {shownError && (
            <div className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center justify-between gap-2 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">
              <span role="alert">{shownError}</span>
              {error && failed && <button type="button" onClick={() => void ask(failed)} className="inline-flex items-center gap-1.5 rounded-md border border-loss/40 px-2 py-1 font-semibold transition-colors hover:bg-loss/15"><RotateCcw size={12} aria-hidden />Retry</button>}
            </div>
          )}
          {locked ? (
            <ProLock feature="ai" className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-2xl border app-border bg-[var(--app-panel)] px-4 py-4 text-left text-sm app-muted transition-colors hover:border-brand-400/45">
              <span>Ask anything about your trades…</span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-brand-300"><Lock size={14} aria-hidden />Unlock with Pro</span>
            </ProLock>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); void ask(input); }} className="mx-auto max-w-3xl rounded-2xl border app-border bg-[var(--app-panel)] px-3.5 pb-2.5 pt-3 transition-colors focus-within:border-brand-400/50">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void ask(input);
                  }
                }}
                rows={2}
                placeholder={conversation ? "Ask a follow-up…" : "Or ask anything about your trades…"}
                aria-label="Ask the AI Analyst a question"
                className="max-h-40 w-full resize-none border-0 bg-transparent p-0 text-sm outline-none placeholder:text-[var(--app-muted)] focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {speech.listening && <p className="truncate text-xs text-brand-300" aria-live="polite">Listening…{speech.interim && <span className="app-muted"> {speech.interim}</span>}</p>}
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
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {speech.supported && (
                  <button type="button" onClick={() => { speech.clearError(); if (speech.listening) speech.stop(); else speech.start(); }} aria-pressed={speech.listening} aria-label={speech.listening ? "Stop voice input" : "Speak your question"} title={speech.listening ? "Stop voice input" : "Speak your question"} className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${speech.listening ? "animate-pulse bg-loss/15 text-loss" : "app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"}`}>{speech.listening ? <MicOff size={16} aria-hidden /> : <Mic size={16} aria-hidden />}</button>
                )}
                {loading ? (
                  <button type="button" onClick={chat.stop} aria-label="Stop generating" title="Stop generating" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border app-border transition-colors hover:border-loss/50 hover:text-loss"><Square size={13} fill="currentColor" aria-hidden /></button>
                ) : (
                  <button type="submit" disabled={!input.trim() || starting} aria-label="Send" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-surface-950 transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-[var(--app-panel-2)] disabled:text-[var(--app-muted)]">{starting ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ArrowUp size={16} aria-hidden />}</button>
                )}
                </span>
              </div>
            </form>
          )}
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] app-muted">AI can make mistakes. These are historical simulations, not financial advice.</p>
        </div>
      </section>
      {!locked && <TradingPlanDialog open={planOpen} onClose={() => setPlanOpen(false)} initialRules={plan} maxLength={planMaxLength} onSaved={setPlan} />}
    </div>
    </TradeLinkProvider>
  );
}
