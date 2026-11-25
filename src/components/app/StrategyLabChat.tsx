"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Info, Loader2, Play, Send, Sparkles, X } from "lucide-react";

import { changedLines, type ResultSummary } from "@/lib/ai/pine-author";

export type RunOutcome = { trades: number; netPnl: number; profitFactor: number | null } | null;
type StepState = "active" | "done" | "error" | "info";
type Step = { text: string; state: StepState };
type Message = {
  id: string; role: "user" | "ai"; text: string; pending?: boolean;
  rules?: string[]; steps?: Step[]; changed?: number; errors?: string[];
  outcome?: RunOutcome; previous?: RunOutcome;
};
type Done = { ok: boolean; mode?: "answer" | "code"; message?: string; rules?: string[]; code?: string | null; checked?: boolean; errors?: string[]; fixes?: number; remaining?: number; error?: string };
type StreamEvent = ({ type: "step"; step: string; attempt?: number; count?: number; first?: string }) | ({ type: "done" } & Done) | { type: "error"; error: string; remaining?: number };

const STORE = (key: string) => `ftl:strategy-lab-ai:v2:${key}`;
const STARTERS = ["London breakout of the Asian range, stop at the other side, 2R target", "Buy when the 20 EMA crosses above the 50 EMA, 30 pip stop, 60 pip target", "Short when RSI(14) goes above 70 during New York hours"];
const FOLLOW_UPS = ["Explain this result", "Which hours lose the most?", "Add a trailing stop", "Only trade Tuesday to Thursday"];
const money = (value: number) => `${value < 0 ? "−" : "+"}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pf = (value: number | null) => (value === null ? "—" : value.toFixed(2));
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Marks running steps finished and adds the next one. */
function advance(steps: Step[], next?: Step, finish: StepState = "done"): Step[] {
  const settled = steps.map(step => (step.state === "active" ? { ...step, state: finish } : step));
  return next ? [...settled, next] : settled;
}

function stepFor(event: Extract<StreamEvent, { type: "step" }>, steps: Step[]): Step[] {
  switch (event.step) {
    case "reading": return [{ text: "Reading your request", state: "active" }];
    case "answering": return advance(steps, { text: "Answering your question", state: "active" });
    case "writing": return advance(steps, { text: "Writing the Pine code", state: "active" });
    case "checking": return advance(steps, { text: event.attempt && event.attempt > 1 ? "Checking the fixed code" : "Checking the code on sample prices", state: "active" });
    case "checked": return advance(steps.map(step => (step.state === "active" ? { ...step, text: "Checked on sample prices: no errors" } : step)));
    case "unchecked": return advance(steps, { text: "Couldn't check the code right now; it will be checked when the test runs", state: "info" });
    case "errors": return advance(steps.map(step => (step.state === "active" ? { ...step, text: `Found ${plural(event.count ?? 1, "error")}${event.first ? `: ${event.first}` : ""}` } : step)), undefined, "error");
    case "fixing": return advance(steps, { text: "Fixing the code", state: "active" });
    default: return steps;
  }
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "active") return <Loader2 size={12} className="mt-[3px] shrink-0 animate-spin text-[var(--app-accent-text)]" />;
  if (state === "error") return <AlertCircle size={12} className="mt-[3px] shrink-0 text-loss" />;
  if (state === "info") return <Info size={12} className="mt-[3px] shrink-0 app-muted" />;
  return <Check size={12} className="mt-[3px] shrink-0 text-[var(--app-accent-text)]" />;
}

function Outcome({ outcome, previous }: { outcome: NonNullable<RunOutcome>; previous?: RunOutcome }) {
  const net = <strong className={outcome.netPnl < 0 ? "text-loss" : "text-[var(--app-accent-text)]"}>{money(outcome.netPnl)}</strong>;
  if (!previous) return <p className="mt-2 rounded-md bg-[var(--app-panel-2)] px-2 py-1.5 font-mono text-[11.5px]">{outcome.trades} trades · PF {pf(outcome.profitFactor)} · {net}</p>;
  return <p className="mt-2 rounded-md bg-[var(--app-panel-2)] px-2 py-1.5 font-mono text-[11.5px]">Trades {previous.trades} → <strong>{outcome.trades}</strong> · PF {pf(previous.profitFactor)} → <strong>{pf(outcome.profitFactor)}</strong> · {money(previous.netPnl)} → {net}</p>;
}

export function StrategyLabChat({ storageKey, code, symbol, timeframe, summary, testing, autoRun, signedIn, onApply, onRun, onClose }: {
  storageKey: string; code: string; symbol: string; timeframe: "15m" | "1h" | "4h" | "1d"; summary: ResultSummary | null;
  testing: boolean; autoRun: boolean; signedIn: boolean;
  /** Puts the code in the editor (saving a version); runs it when `run` is true. */
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
    try { const saved = JSON.parse(localStorage.getItem(STORE(storageKey)) ?? "[]") as Message[]; setMessages(Array.isArray(saved) ? saved.filter(item => !item.pending).slice(-40) : []); } catch { setMessages([]); }
  }, [storageKey]);
  useEffect(() => {
    try { localStorage.setItem(STORE(storageKey), JSON.stringify(messages.filter(item => !item.pending).slice(-40))); } catch { /* chat history is a convenience */ }
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages, storageKey]);
  useEffect(() => { if (summary) lastOutcome.current = { trades: summary.trades, netPnl: summary.netPnl, profitFactor: summary.profitFactor }; }, [summary]);

  const update = (id: string, change: (message: Message) => Partial<Message>) => setMessages(current => current.map(item => (item.id === id ? { ...item, ...change(item) } : item)));
  const runFor = async (id: string, action: () => Promise<RunOutcome>) => {
    const previous = lastOutcome.current;
    update(id, item => ({ steps: advance(item.steps ?? [], { text: "Running the test", state: "active" }) }));
    const outcome = await action();
    if (outcome) {
      update(id, item => ({ outcome, previous, steps: advance(item.steps ?? []).map((step, index, all) => (index === all.length - 1 ? { ...step, text: "Ran the test" } : step)) }));
      lastOutcome.current = outcome;
    } else update(id, item => ({ steps: advance((item.steps ?? []).map(step => (step.state === "active" ? { ...step, text: "The test didn't finish. See Problems below the chart." } : step)), undefined, "error") }));
  };

  const finish = async (id: string, data: Done, prompt: string) => {
    if (typeof data.remaining === "number") setRemaining(data.remaining);
    const next = data.mode === "code" && data.code && data.code.trim() !== code.trim() ? data.code : null;
    const errors = data.errors ?? [];
    update(id, item => {
      let steps = advance(item.steps ?? []);
      if (data.mode !== "code") steps = [...steps, { text: "No code changed", state: "info" }];
      else if (!next) steps = [...steps, { text: "No code changes were needed", state: "info" }];
      else steps = [...steps, { text: `Updated the editor: ${plural(changedLines(code, next), "line")} changed, version saved`, state: errors.length ? "error" : "done" }];
      if (next && errors.length) steps = [...steps, { text: "Ask the AI to fix the errors, or edit the code yourself", state: "info" }];
      else if (next && !autoRun) steps = [...steps, { text: "Ready to test: press Run test", state: "info" }];
      return { pending: false, text: data.message ?? "", rules: data.rules ?? [], steps, changed: next ? changedLines(code, next) : undefined, errors };
    });
    if (!next) return;
    if (autoRun && !errors.length) await runFor(id, () => onApply(next, prompt.slice(0, 60), true));
    else await onApply(next, prompt.slice(0, 60), false);
  };

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || thinking) return;
    setDraft(""); setError(null);
    const history = messages.filter(item => !item.pending).slice(-10).map(item => ({ role: item.role === "user" ? "user" as const : "model" as const, text: item.role === "user" ? item.text : [item.text, ...(item.rules ?? []).map(rule => `- ${rule}`)].join("\n") }));
    const id = crypto.randomUUID();
    setMessages(current => [...current, { id: crypto.randomUUID(), role: "user", text: prompt }, { id, role: "ai", text: "", pending: true, steps: [{ text: "Sending", state: "active" }] }]);
    setThinking(true);
    const fail = (message: string) => { setError(message); setMessages(current => current.filter(item => item.id !== id)); };
    try {
      const response = await fetch("/api/strategy-tests/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, code, history, symbol, timeframe, summary }) });
      if (!response.body || !response.headers.get("content-type")?.includes("ndjson")) {
        const data = await response.json().catch(() => ({})) as Done;
        if (typeof data.remaining === "number") setRemaining(data.remaining);
        fail(data.error ?? "The AI couldn't answer. Try again.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", ended = false;
      for (;;) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = done ? "" : lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "step") update(id, item => ({ steps: stepFor(event, item.steps ?? []) }));
          else if (event.type === "error") { ended = true; if (typeof event.remaining === "number") setRemaining(event.remaining); fail(event.error); }
          else { ended = true; await finish(id, event, prompt); }
        }
        if (done) break;
      }
      if (!ended) fail("The answer was cut off. Try again.");
    } catch { fail("Connection lost. Try again."); }
    finally { setThinking(false); }
  };

  const busy = thinking || testing;
  return <div className="flex h-full min-h-0 flex-col bg-[var(--app-panel-solid)]">
    <div className="flex h-10 shrink-0 items-center gap-2 border-b app-border px-3 text-xs"><Sparkles size={14} className="text-[var(--app-accent-text)]" /><strong>AI strategy builder</strong>
      {messages.length > 0 && <button type="button" disabled={busy} onClick={() => setMessages([])} className="ml-auto rounded px-1.5 py-0.5 app-muted hover:text-[var(--app-text)] disabled:opacity-50">Clear</button>}
      {onClose && <button type="button" onClick={onClose} aria-label="Close AI" className={`${messages.length ? "" : "ml-auto"} grid size-7 place-items-center rounded-md hover:bg-[var(--app-panel-2)]`}><X size={14} /></button>}
    </div>
    <div ref={list} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-[13px] leading-5">
      {!messages.length && <div className="space-y-2">
        <p className="app-muted">Describe a strategy in plain words, or ask a question about your code or results. When you ask for a strategy or a change, the AI writes the Pine code, checks it, and {autoRun ? "runs the test" : "gets it ready to test"}. Questions are answered without touching your code.</p>
        {STARTERS.map(item => <button key={item} type="button" disabled={busy || !signedIn} onClick={() => void send(item)} className="block w-full rounded-lg border app-border px-3 py-2 text-left hover:border-[var(--app-accent)] disabled:opacity-50">{item}</button>)}
      </div>}
      {messages.map(item => item.role === "user"
        ? <div key={item.id} className="chat-user ml-8 rounded-[12px_12px_3px_12px] px-3 py-2">{item.text}</div>
        : <div key={item.id} className="chat-ai rounded-[12px_12px_12px_3px] p-3">
          {item.text && <p className="whitespace-pre-wrap">{item.text}</p>}
          {!!item.rules?.length && <ul className="mt-2 space-y-0.5">{item.rules.map(rule => { const guess = rule.startsWith("?"); return <li key={rule} className="flex gap-1.5"><span className={`font-bold ${guess ? "text-amber-400" : "text-[var(--chat-ai-accent)]"}`}>{guess ? "?" : "✓"}</span><span className={guess ? "app-muted" : ""}>{guess ? rule.replace(/^\?\s*/, "") : rule}</span></li>; })}</ul>}
          {!!item.steps?.length && <ol aria-label="What the AI did" className={`${item.text || item.rules?.length ? "mt-2.5 border-t app-border pt-2" : ""} space-y-1 text-[11.5px]`}>{item.steps.map((step, index) => <li key={index} className={`flex gap-1.5 ${step.state === "error" ? "text-loss" : step.state === "active" ? "" : "app-muted"}`}><StepIcon state={step.state} /><span>{step.text}</span></li>)}</ol>}
          {item.outcome && <Outcome outcome={item.outcome} previous={item.previous} />}
          {item.changed !== undefined && !item.outcome && !item.errors?.length && !item.steps?.some(step => step.state === "active") && <button type="button" disabled={busy} onClick={() => void runFor(item.id, onRun)} className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--app-accent)] px-2.5 text-[11.5px] font-bold text-[var(--app-accent-ink)] disabled:opacity-50"><Play size={12} />Run test</button>}
        </div>)}
      {error && <p role="alert" className="flex gap-1.5 text-loss"><AlertCircle size={14} className="mt-0.5 shrink-0" />{error}</p>}
    </div>
    <div className="shrink-0 border-t app-border p-2.5">
      {messages.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{FOLLOW_UPS.map(item => <button key={item} type="button" disabled={busy || !signedIn} onClick={() => void send(item)} className="rounded-full border app-border px-2.5 py-0.5 text-[11px] app-muted hover:border-[var(--app-accent)] hover:text-[var(--app-text)] disabled:opacity-50">{item}</button>)}</div>}
      {signedIn ? <form onSubmit={event => { event.preventDefault(); void send(draft); }} className="relative">
        <textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(draft); } }} rows={3} maxLength={2000} placeholder={messages.length ? "Ask a question or for a change…" : "Describe your strategy…"} aria-label="Message the AI" className="w-full resize-none rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2 pr-10 text-[13px] text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]" />
        <button type="submit" disabled={busy || !draft.trim()} aria-label="Send" className="absolute bottom-3 right-2 grid size-7 place-items-center rounded-md bg-[var(--app-accent)] text-[var(--app-accent-ink)] disabled:opacity-40"><Send size={13} /></button>
      </form> : <a href="/sign-in?next=%2Fapp%2Fstrategies" className="block rounded-lg border app-border px-3 py-2 text-center text-xs font-semibold hover:border-[var(--app-accent)]">Sign in to build strategies with AI</a>}
      {remaining !== null && <p className="mt-1 text-[10.5px] app-muted">{plural(remaining, "AI request")} left today</p>}
    </div>
  </div>;
}
