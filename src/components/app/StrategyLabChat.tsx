"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Play, Send, Sparkles, X } from "lucide-react";

import { changedLines, type ResultSummary } from "@/lib/ai/pine-author";

export type RunOutcome = { trades: number; netPnl: number; profitFactor: number | null } | null;
type Message = {
  id: string; role: "user" | "ai"; text: string;
  rules?: string[]; changed?: number; checked?: boolean; errors?: string[];
  outcome?: RunOutcome; previous?: RunOutcome; failed?: boolean;
};

const STORE = (key: string) => `ftl:strategy-lab-ai:v1:${key}`;
const STARTERS = ["London breakout of the Asian range, stop at the other side, 2R target", "Buy when the 20 EMA crosses above the 50 EMA, 30 pip stop, 60 pip target", "Short when RSI(14) goes above 70 during New York hours"];
const FOLLOW_UPS = ["Explain this result", "Add a trailing stop", "Only trade Tuesday to Thursday", "Which hours lose the most?"];
const money = (value: number) => `${value < 0 ? "−" : "+"}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pf = (value: number | null) => (value === null ? "—" : value.toFixed(2));

function Outcome({ outcome, previous }: { outcome: NonNullable<RunOutcome>; previous?: RunOutcome }) {
  if (!previous) return <p className="mt-1.5 font-mono text-[11.5px]">{outcome.trades} trades · PF {pf(outcome.profitFactor)} · <span className={outcome.netPnl < 0 ? "text-loss" : "text-[var(--app-accent-text)]"}>{money(outcome.netPnl)}</span></p>;
  return <p className="mt-1.5 font-mono text-[11.5px]">Trades {previous.trades} → <strong>{outcome.trades}</strong> · PF {pf(previous.profitFactor)} → <strong>{pf(outcome.profitFactor)}</strong> · {money(previous.netPnl)} → <strong className={outcome.netPnl < 0 ? "text-loss" : "text-[var(--app-accent-text)]"}>{money(outcome.netPnl)}</strong></p>;
}

export function StrategyLabChat({ storageKey, code, symbol, timeframe, summary, testing, autoRun, signedIn, onApply, onRun, onClose }: {
  storageKey: string; code: string; symbol: string; timeframe: "15m" | "1h" | "4h" | "1d"; summary: ResultSummary | null;
  testing: boolean; autoRun: boolean; signedIn: boolean;
  /** Puts the code in the editor (saving a version); runs it when autoRun is on. */
  onApply: (code: string, label: string, run: boolean) => Promise<RunOutcome>;
  onRun: () => Promise<RunOutcome>;
  onClose?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastOutcome = useRef<RunOutcome>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(STORE(storageKey)) ?? "[]") as Message[]; setMessages(Array.isArray(saved) ? saved.slice(-40) : []); } catch { setMessages([]); }
  }, [storageKey]);
  useEffect(() => {
    try { localStorage.setItem(STORE(storageKey), JSON.stringify(messages.slice(-40))); } catch { /* chat history is a convenience */ }
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages, storageKey]);
  useEffect(() => { if (summary) lastOutcome.current = { trades: summary.trades, netPnl: summary.netPnl, profitFactor: summary.profitFactor }; }, [summary]);

  const patch = (id: string, change: Partial<Message>) => setMessages(current => current.map(item => (item.id === id ? { ...item, ...change } : item)));
  const runFor = async (id: string, action: () => Promise<RunOutcome>) => {
    const previous = lastOutcome.current;
    const outcome = await action();
    if (outcome) { patch(id, { outcome, previous }); lastOutcome.current = outcome; }
  };

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || thinking) return;
    setDraft(""); setError(null);
    const history = messages.slice(-10).map(item => ({ role: item.role === "user" ? "user" as const : "model" as const, text: item.role === "user" ? item.text : [item.text, ...(item.rules ?? []).map(rule => `- ${rule}`)].join("\n") }));
    setMessages(current => [...current, { id: crypto.randomUUID(), role: "user", text: prompt }]);
    setThinking(true);
    try {
      const response = await fetch("/api/strategy-tests/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, code, history, symbol, timeframe, summary }) });
      const data = await response.json() as { ok: boolean; message?: string; rules?: string[]; code?: string | null; checked?: boolean; errors?: string[]; remaining?: number; error?: string };
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      if (!response.ok || !data.ok) { setError(data.error ?? "The AI couldn't answer. Try again."); return; }
      const id = crypto.randomUUID();
      const next = data.code && data.code.trim() !== code.trim() ? data.code : null;
      setMessages(current => [...current, { id, role: "ai", text: data.message ?? "", rules: data.rules ?? [], checked: data.checked, errors: data.errors ?? [], changed: next ? changedLines(code, next) : undefined }]);
      if (next) await runFor(id, () => onApply(next, prompt.slice(0, 60), autoRun && !data.errors?.length));
    } catch { setError("Connection lost. Try again."); }
    finally { setThinking(false); }
  };

  const busy = thinking || testing;
  return <div className="flex h-full min-h-0 flex-col bg-[var(--app-panel-solid)]">
    <div className="flex h-10 shrink-0 items-center gap-2 border-b app-border px-3 text-xs"><Sparkles size={14} className="text-[var(--app-accent-text)]" /><strong>AI strategy builder</strong>
      {messages.length > 0 && <button type="button" onClick={() => setMessages([])} className="ml-auto rounded px-1.5 py-0.5 app-muted hover:text-[var(--app-text)]">Clear</button>}
      {onClose && <button type="button" onClick={onClose} aria-label="Close AI" className={`${messages.length ? "" : "ml-auto"} grid size-7 place-items-center rounded-md hover:bg-[var(--app-panel-2)]`}><X size={14} /></button>}
    </div>
    <div ref={list} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 text-[12.5px] leading-5">
      {!messages.length && <div className="space-y-2">
        <p className="app-muted">Describe a strategy in plain words. The AI writes the Pine code, checks it, and {autoRun ? "runs the test" : "gets it ready to test"}. Then ask for changes or an explanation.</p>
        {STARTERS.map(item => <button key={item} type="button" disabled={busy || !signedIn} onClick={() => void send(item)} className="block w-full rounded-lg border app-border px-3 py-2 text-left hover:border-[var(--app-accent)] disabled:opacity-50">{item}</button>)}
      </div>}
      {messages.map(item => item.role === "user"
        ? <div key={item.id} className="ml-6 rounded-[10px_10px_2px_10px] border app-border bg-[var(--app-panel-2)] px-3 py-2">{item.text}</div>
        : <div key={item.id} className="rounded-lg border app-border bg-[var(--app-bg,transparent)] p-2.5">
          {item.text && <p className="whitespace-pre-wrap">{item.text}</p>}
          {!!item.rules?.length && <ul className="mt-1.5 space-y-0.5">{item.rules.map(rule => { const guess = rule.startsWith("?"); return <li key={rule} className="flex gap-1.5"><span className={`font-bold ${guess ? "text-amber-400" : "text-[var(--app-accent-text)]"}`}>{guess ? "?" : "✓"}</span><span className={guess ? "app-muted" : ""}>{guess ? rule.replace(/^\?\s*/, "") : rule}</span></li>; })}</ul>}
          {item.changed !== undefined && <p className="mt-2 flex items-center gap-1.5 text-[11.5px]">
            {item.errors?.length ? <><AlertCircle size={13} className="text-loss" /><span className="text-loss">Code has {item.errors.length} {item.errors.length === 1 ? "error" : "errors"}. See Problems after a run, or ask the AI to fix it.</span></>
              : <><span className="size-1.5 rounded-full bg-[var(--app-accent)]" /><span className="app-muted">Changed {item.changed} {item.changed === 1 ? "line" : "lines"}{item.checked ? " · checked, no errors" : ""}</span></>}
          </p>}
          {item.outcome && <Outcome outcome={item.outcome} previous={item.previous} />}
          {item.changed !== undefined && !item.outcome && !item.errors?.length && <button type="button" disabled={busy} onClick={() => void runFor(item.id, onRun)} className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--app-accent)] px-2.5 text-[11.5px] font-bold text-[var(--app-accent-ink)] disabled:opacity-50">{testing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}{testing ? "Running…" : "Run test"}</button>}
        </div>)}
      {thinking && <p className="flex items-center gap-2 app-muted"><Loader2 size={13} className="animate-spin" />Writing and checking the code…</p>}
      {error && <p role="alert" className="flex gap-1.5 text-loss"><AlertCircle size={14} className="mt-0.5 shrink-0" />{error}</p>}
    </div>
    <div className="shrink-0 border-t app-border p-2.5">
      {messages.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{FOLLOW_UPS.map(item => <button key={item} type="button" disabled={busy || !signedIn} onClick={() => void send(item)} className="rounded-full border app-border px-2.5 py-0.5 text-[11px] app-muted hover:border-[var(--app-accent)] hover:text-[var(--app-text)] disabled:opacity-50">{item}</button>)}</div>}
      {signedIn ? <form onSubmit={event => { event.preventDefault(); void send(draft); }} className="relative">
        <textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(draft); } }} rows={3} maxLength={2000} placeholder={messages.length ? "Ask for a change…" : "Describe your strategy…"} aria-label="Message the AI" className="w-full resize-none rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2 pr-10 text-[12.5px] text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]" />
        <button type="submit" disabled={busy || !draft.trim()} aria-label="Send" className="absolute bottom-3 right-2 grid size-7 place-items-center rounded-md bg-[var(--app-accent)] text-[var(--app-accent-ink)] disabled:opacity-40"><Send size={13} /></button>
      </form> : <a href="/sign-in?next=%2Fapp%2Fstrategies" className="block rounded-lg border app-border px-3 py-2 text-center text-xs font-semibold hover:border-[var(--app-accent)]">Sign in to build strategies with AI</a>}
      {remaining !== null && <p className="mt-1 text-[10.5px] app-muted">{remaining} AI {remaining === 1 ? "request" : "requests"} left today</p>}
    </div>
  </div>;
}
