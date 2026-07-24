"use client";

import { useRef, useState } from "react";
import { ArrowUp, Loader2, Sparkles, Trash2 } from "lucide-react";

type Scope = "session" | "portfolio";
type Role = "user" | "model";
interface Message {
  role: Role;
  text: string;
}

/** Tiny, dependency-free markdown renderer for the assistant's replies. */
function RichText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1.5 ml-1 space-y-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
            <span>{inline(b)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) {
      bullets.push(line.replace(/^\s*[-*]\s+/, ""));
      return;
    }
    flush();
    if (/^#{1,6}\s+/.test(line)) {
      blocks.push(
        <p key={`h-${i}`} className="mt-2 text-xs font-semibold uppercase tracking-wide text-brand-300">
          {inline(line.replace(/^#{1,6}\s+/, ""))}
        </p>,
      );
    } else if (line.trim()) {
      blocks.push(
        <p key={`p-${i}`} className="my-1 leading-relaxed">
          {inline(line)}
        </p>,
      );
    }
  });
  flush();
  return <>{blocks}</>;
}

function inline(text: string): React.ReactNode {
  // Bold **…** only; everything else is plain text.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-[var(--app-text)]">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollDown = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setInput("");
    const history = messages.slice();
    setMessages((prev) => [...prev, { role: "user", text: q }, { role: "model", text: "" }]);
    setLoading(true);
    scrollDown();

    try {
      const response = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, sessionId, question: q, history }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        setMessages((prev) => prev.slice(0, -1)); // drop the empty model bubble
        setError(data?.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = prev.slice();
          next[next.length - 1] = { role: "model", text: acc };
          return next;
        });
        scrollDown();
      }
    } catch {
      setMessages((prev) => prev.slice(0, -1));
      setError("Connection interrupted. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <section className="panel flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b app-border p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-brand-400/25 bg-brand-400/10 text-brand-300">
            <Sparkles size={17} aria-hidden />
          </span>
          <div>
            <h3 className="font-semibold leading-tight">{title}</h3>
            <p className="text-xs app-muted">{subtitle ?? "Ask anything about your results"}</p>
          </div>
        </div>
        {!empty && (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border app-border px-2.5 py-1.5 text-xs app-muted transition-colors hover:text-brand-300"
          >
            <Trash2 size={13} /> Clear
          </button>
        )}
      </div>

      <div ref={scrollRef} className="max-h-[26rem] min-h-[10rem] flex-1 space-y-4 overflow-y-auto p-4">
        {empty ? (
          <div>
            <p className="text-sm app-muted">
              Your data stays grounded — answers are based only on this {scope === "session" ? "session's" : "account's"} real
              backtest results. Try one of these:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="rounded-full border border-brand-400/30 bg-brand-400/[0.06] px-3 py-1.5 text-left text-xs font-medium text-brand-200 transition-colors hover:bg-brand-400/[0.12]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-brand-500/90 px-3.5 py-2 text-sm text-surface-950"
                    : "max-w-[92%] rounded-2xl rounded-bl-sm border app-border bg-[var(--app-panel-2)]/60 px-3.5 py-2.5 text-sm"
                }
              >
                {m.role === "user" ? (
                  m.text
                ) : m.text ? (
                  <RichText text={m.text} />
                ) : (
                  <span className="flex items-center gap-2 app-muted">
                    <Loader2 size={14} className="animate-spin" /> Analysing…
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-lg border border-bear/30 bg-bear/10 px-3 py-2 text-xs text-bear">{error}</div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex items-end gap-2 border-t app-border p-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
          rows={1}
          placeholder="Ask about your performance…"
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2 text-sm outline-none transition-colors focus:border-brand-400/60"
          aria-label="Ask the AI a question about your results"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-500 text-surface-950 transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
        </button>
      </form>
      <p className="border-t app-border px-4 py-2 text-[10px] leading-tight app-muted">
        AI-generated analysis of your historical simulations. Not financial advice.
      </p>
    </section>
  );
}
