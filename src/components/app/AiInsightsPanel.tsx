"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Copy,
  Lightbulb,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";

import { useTradeFocus, useTradeLink } from "@/components/app/TradeFocusContext";
import { parseAnswer, type AnswerChart, type InlineToken } from "@/lib/ai/answer-markdown";
import type { ChatMessage } from "@/lib/ai/analyst-threads";
import { useAiChat, type AiScope } from "./useAiChat";

type Scope = AiScope;
type Message = ChatMessage;

/** Conversations survive a reload; an analysis is too expensive to lose. */
const STORAGE_PREFIX = "ftl.ai.thread.";
const MAX_STORED_MESSAGES = 40;

function storageKey(scope: Scope, sessionId?: string) {
  return `${STORAGE_PREFIX}${scope}:${sessionId ?? "all"}`;
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

/** Renders the parsed answer. The grammar itself lives in lib/ai/answer-markdown. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseAnswer(text).map((block, index) => {
        switch (block.type) {
          case "heading":
            return (
              <p
                key={index}
                className="mt-2 text-xs font-semibold uppercase tracking-wide text-brand-300"
              >
                <Inline tokens={block.content} />
              </p>
            );
          case "bullets":
            return (
              <ul key={index} className="my-1.5 ml-1 space-y-1">
                {block.items.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
                    <span>
                      <Inline tokens={item} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "ordered":
            return (
              <ol key={index} className="my-1.5 ml-1 space-y-1">
                {block.items.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 font-mono text-xs text-brand-300">
                      {i + 1}.
                    </span>
                    <span>
                      <Inline tokens={item} />
                    </span>
                  </li>
                ))}
              </ol>
            );
          case "table":
            return (
              <div key={index} className="my-2 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b app-border">
                      {block.head.map((cell, i) => (
                        <th key={i} className="py-1.5 pr-3 font-semibold app-muted">
                          <Inline tokens={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, i) => (
                      <tr key={i} className="border-b app-border/50 last:border-0">
                        {row.map((cell, j) => (
                          <td key={j} className="py-1.5 pr-3 align-top">
                            <Inline tokens={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "chart":
            return <AnswerBarChart key={index} chart={block.chart} />;
          default:
            return (
              <p key={index} className="my-1 leading-relaxed">
                <Inline tokens={block.content} />
              </p>
            );
        }
      })}
    </>
  );
}

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, index) => {
        if (token.type === "bold") {
          return (
            <strong key={index} className="font-semibold text-[var(--app-text)]">
              {token.text}
            </strong>
          );
        }
        if (token.type === "citation") {
          return <TradeCitation key={index} number={token.tradeNumber} sessionRef={token.sessionRef} />;
        }
        return <span key={index}>{token.text}</span>;
      })}
    </>
  );
}

const CITATION_CLASS = "mx-0.5 inline-flex items-center rounded border border-brand-400/35 bg-brand-400/10 px-1 font-mono text-[0.95em] leading-snug text-brand-200 transition-colors hover:bg-brand-400/20";

function TradeCitation({ number, sessionRef }: { number: number; sessionRef?: string }) {
  const focus = useTradeFocus();
  const link = useTradeLink()?.(number, sessionRef);
  if (!focus && link) {
    return <Link href={link.href} title={link.label} className={CITATION_CLASS}>#{number}</Link>;
  }
  // Outside a session report, or pointing at a trade that does not exist, the
  // citation stays plain text rather than becoming a link to nowhere.
  if (!focus || number < 1 || number > focus.tradeCount) {
    return <span className="font-mono">#{number}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => focus.focusTrade(number)}
      title={`Show trade ${number} in the ledger`}
      className={CITATION_CLASS}
    >
      #{number}
    </button>
  );
}

function chartValue(value: number, unit: string): string {
  const amount = Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const sign = value < 0 ? "−" : "";
  if (unit === "$") return `${sign}$${amount}`;
  if (unit === "%") return `${sign}${amount}%`;
  return unit ? `${sign}${amount} ${unit}` : `${sign}${amount}`;
}

/** A bar per row, growing right for gains and left for losses from a shared zero line. */
function AnswerBarChart({ chart }: { chart: AnswerChart | null }) {
  if (!chart) {
    return <p className="my-2 flex items-center gap-2 text-xs app-muted"><Loader2 size={12} className="animate-spin" aria-hidden />Drawing a chart…</p>;
  }
  const max = Math.max(...chart.data.map((row) => Math.abs(row.value)), 1e-9);
  const hasNegative = chart.data.some((row) => row.value < 0);
  return (
    <figure className="my-3 rounded-xl border app-border bg-[var(--app-panel)]/60 p-3">
      {chart.title && <figcaption className="mb-2 text-xs font-semibold">{chart.title}</figcaption>}
      <div className="space-y-1.5" role="list">
        {chart.data.map((row, index) => {
          const width = `${(Math.abs(row.value) / max) * (hasNegative ? 50 : 100)}%`;
          const negative = row.value < 0;
          return (
            <div key={index} role="listitem" className="grid grid-cols-[minmax(4rem,8rem)_1fr_auto] items-center gap-2 text-xs">
              <span className="truncate app-muted" title={row.label}>{row.label}</span>
              <span className="relative h-3.5">
                {hasNegative && <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--app-border)]" aria-hidden />}
                <span
                  className={`absolute inset-y-0.5 rounded-sm ${negative ? "bg-loss/80" : "bg-profit/80"}`}
                  style={hasNegative ? (negative ? { right: "50%", width } : { left: "50%", width }) : { left: 0, width }}
                  aria-hidden
                />
              </span>
              <span className={`w-20 text-right font-mono ${negative ? "text-loss" : ""}`}>{chartValue(row.value, chart.unit)}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

export function AiInsightsPanel({
  scope,
  sessionId,
  suggestions,
  title = "AI insights",
  subtitle,
}: {
  scope: Scope;
  sessionId?: string;
  suggestions: readonly string[];
  title?: string;
  subtitle?: string;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [restored, setRestored] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const key = storageKey(scope, sessionId);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  const chat = useAiChat({ onChunk: scrollDown });
  const { messages, setMessages, loading, error, failed } = chat;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setMessages(parsed as Message[]);
      }
    } catch {
      // A corrupt thread is not worth failing the panel over.
    }
    setRestored(true);
  }, [key, setMessages]);

  useEffect(() => {
    if (!restored || loading) return;
    try {
      if (messages.length) {
        window.localStorage.setItem(
          key,
          JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)),
        );
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Private mode and quota failures are not worth surfacing.
    }
  }, [key, messages, loading, restored]);

  const ask = useCallback(
    (question: string) => {
      if (!question.trim() || loading) return;
      setInput("");
      setShowSuggestions(false);
      void chat.ask(question, { scope, sessionId }, messages);
    },
    [chat, loading, messages, scope, sessionId],
  );

  const empty = messages.length === 0;
  const showSuggestionRow = empty || showSuggestions;

  return (
    <section className="panel flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b app-border p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-brand-400/25 bg-brand-400/10 text-brand-300">
            <Sparkles size={17} aria-hidden />
          </span>
          <div>
            <h3 className="font-semibold leading-tight">{title}</h3>
            <p className="text-xs app-muted">
              {subtitle ?? "Ask anything about your results"}
            </p>
          </div>
        </div>
        {!empty && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowSuggestions((current) => !current)}
              aria-pressed={showSuggestions}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                showSuggestions
                  ? "border-brand-400/40 bg-brand-400/10 text-brand-200"
                  : "app-border app-muted hover:text-brand-300"
              }`}
            >
              <Lightbulb size={13} aria-hidden /> Ideas
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirmClear) {
                  setConfirmClear(true);
                  return;
                }
                chat.reset();
                setConfirmClear(false);
              }}
              onBlur={() => setConfirmClear(false)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                confirmClear
                  ? "border-loss/40 bg-loss/10 text-loss"
                  : "app-border app-muted hover:text-brand-300"
              }`}
            >
              <Trash2 size={13} aria-hidden />{" "}
              {confirmClear ? "Clear it?" : "Clear"}
            </button>
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label={`${title} conversation`}
        className="max-h-[34rem] min-h-[12rem] flex-1 overflow-y-auto p-4"
      >
        <div className="mx-auto w-full max-w-[52rem] space-y-4">
        {empty && (
          <p className="text-sm app-muted">
            Your data stays grounded — answers are based only on this{" "}
            {scope === "session" ? "session's" : "account's"} real backtest
            results. Try one of these:
          </p>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user" ? "flex justify-end" : "flex justify-start"
            }
          >
            {message.role === "user" ? (
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-500/90 px-3.5 py-2 text-sm text-surface-950">
                {message.text}
              </div>
            ) : (
              <div className="group/answer w-full max-w-[92%] rounded-2xl rounded-bl-sm border app-border bg-[var(--app-panel-2)]/60 px-3.5 py-2.5 text-sm">
                {message.text ? (
                  <>
                    <RichText text={message.text} />
                    {!(loading && index === messages.length - 1) && (
                      <CopyAnswer text={message.text} />
                    )}
                  </>
                ) : (
                  <span className="flex items-center gap-2 app-muted">
                    <Loader2 size={14} className="animate-spin" /> Analysing…
                  </span>
                )}
              </div>
            )}
          </div>
        ))}

        {showSuggestionRow && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => ask(suggestion)}
                disabled={loading}
                className="rounded-full border border-brand-400/30 bg-brand-400/[0.06] px-3 py-1.5 text-left text-xs font-medium text-brand-200 transition-colors hover:bg-brand-400/[0.12] disabled:opacity-40"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">
          <span role="alert">{error}</span>
          {failed && (
            <button
              type="button"
              onClick={() => ask(failed)}
              className="inline-flex items-center gap-1.5 rounded-md border border-loss/40 px-2 py-1 font-semibold transition-colors hover:bg-loss/15"
            >
              <RotateCcw size={12} aria-hidden /> Retry
            </button>
          )}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
        className="border-t app-border p-3"
      >
        <div className="mx-auto flex w-full max-w-[52rem] items-end gap-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              ask(input);
            }
          }}
          rows={1}
          placeholder="Ask about your performance…   (Shift + Enter for a new line)"
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2 text-sm outline-none transition-colors focus:border-brand-400/60"
          aria-label="Ask the AI a question about your results"
        />
        {loading ? (
          <button
            type="button"
            onClick={chat.stop}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border app-border text-[var(--app-text)] transition-colors hover:border-loss/50 hover:text-loss"
            aria-label="Stop generating"
            title="Stop generating"
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-500 text-surface-950 transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            <ArrowUp size={16} />
          </button>
        )}
        </div>
      </form>
      <p className="border-t app-border px-4 py-2 text-[11px] leading-tight app-muted">
        <span className="mx-auto block w-full max-w-[52rem]">
          AI-generated analysis of your historical simulations. Not financial
          advice.
        </span>
      </p>
    </section>
  );
}

export function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
      }}
      className="mt-2 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] app-muted opacity-0 transition-opacity hover:text-brand-300 focus-visible:opacity-100 group-hover/answer:opacity-100"
    >
      {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
