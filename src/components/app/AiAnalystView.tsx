"use client";

import { useState } from "react";
import { FlaskConical, Lightbulb, MessagesSquare, Sparkles, TrendingDown, TrendingUp, Scale } from "lucide-react";

import { AiInsightsPanel } from "./AiInsightsPanel";
import { ProPeek } from "./ProLock";
import type { Finding } from "@/lib/ai/findings";

export interface AnalystSession {
  id: string;
  name: string;
}

type Tab = "insights" | "chat";

const KIND = {
  leak: { label: "Leak", icon: TrendingDown, tone: "text-loss" },
  strength: { label: "Strength", icon: TrendingUp, tone: "text-profit" },
  habit: { label: "Habit", icon: Scale, tone: "text-amber-300" },
} as const;

const SAMPLE_FINDINGS: Finding[] = [
  { kind: "leak", title: "New York session trades cost you $356", text: "9 trades, 2 won.", question: "" },
  { kind: "strength", title: "London session trades are working", text: "+$198 over 14 trades, 64% won.", question: "" },
  { kind: "habit", title: "Your losses outweigh your wins", text: "Average win $42, average loss $61.", question: "" },
];

function FindingCard({ finding, onDiscuss }: { finding: Finding; onDiscuss?: () => void }) {
  const kind = KIND[finding.kind];
  const Icon = kind.icon;
  return (
    <article className="flex flex-col rounded-xl border app-border bg-[var(--app-panel-2)]/55 p-4">
      <p className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${kind.tone}`}><Icon size={13} aria-hidden />{kind.label}</p>
      <h3 className="mt-1.5 text-sm font-semibold leading-5">{finding.title}</h3>
      <p className="mt-1 flex-1 text-xs leading-5 app-muted">{finding.text}</p>
      {onDiscuss && <button type="button" onClick={onDiscuss} className="mt-3 self-start text-xs font-semibold text-brand-300 transition-colors hover:text-brand-200">Discuss →</button>}
    </article>
  );
}

export function AiAnalystView({
  locked,
  sessions,
  findings,
  sessionSuggestions,
  portfolioSuggestions,
}: {
  locked: boolean;
  sessions: AnalystSession[];
  findings: Finding[];
  sessionSuggestions: readonly string[];
  portfolioSuggestions: readonly string[];
}) {
  const [tab, setTab] = useState<Tab>("insights");
  /** Empty means all sessions. */
  const [sessionId, setSessionId] = useState("");
  const [queued, setQueued] = useState<{ id: number; text: string }>();

  const discuss = (finding: Finding) => {
    setSessionId("");
    setQueued({ id: Date.now(), text: finding.question });
  };

  const tabClass = (on: boolean) => `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${on ? "bg-[var(--app-panel-2)] text-[var(--app-text)]" : "app-muted hover:text-[var(--app-text)]"}`;

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Your trades, explained</p>
          <h1 className="mt-1.5 flex items-center gap-3 text-3xl font-bold tracking-tight">AI Analyst</h1>
        </div>
        {!locked && sessions.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="app-muted">Looking at</span>
            <select
              value={sessionId}
              onChange={(event) => {
                setQueued(undefined);
                setSessionId(event.target.value);
              }}
              className="min-h-10 max-w-64 rounded-lg border app-border bg-[var(--app-panel-2)] px-3 text-sm outline-none focus:border-brand-400/60"
            >
              <option value="">All sessions</option>
              {sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}
            </select>
          </label>
        )}
      </header>

      <nav aria-label="AI Analyst sections" className="mt-5 flex flex-wrap gap-1 border-b app-border pb-2">
        <button type="button" onClick={() => setTab("insights")} aria-pressed={tab === "insights"} className={tabClass(tab === "insights")}><Lightbulb size={15} aria-hidden />Insights</button>
        <button type="button" onClick={() => setTab("chat")} aria-pressed={tab === "chat"} className={tabClass(tab === "chat")}><MessagesSquare size={15} aria-hidden />Chat</button>
        <button type="button" disabled title="Coming soon" className={`${tabClass(false)} cursor-not-allowed opacity-70`}><FlaskConical size={15} aria-hidden />Automated tests<span className="rounded border border-amber-300/40 px-1 text-[9px] font-bold tracking-[0.08em] text-amber-300">SOON</span></button>
      </nav>

      {locked ? (
        <ProPeek feature="ai" title="Your own trading analyst" text="It reads your trades, finds what costs you money and answers your questions about them." className="mt-5 rounded-xl">
          <div className="grid gap-3 md:grid-cols-3">{SAMPLE_FINDINGS.map((finding) => <FindingCard key={finding.title} finding={finding} />)}</div>
          <div className="mt-4 space-y-3 rounded-xl border app-border p-4 text-sm">
            <div className="ml-auto w-fit rounded-2xl rounded-br-sm bg-brand-500/90 px-3.5 py-2 text-surface-950">Why do my New York session trades lose money?</div>
            <div className="max-w-[80%] rounded-2xl rounded-bl-sm border app-border bg-[var(--app-panel-2)]/60 px-3.5 py-2.5">Seven of your nine New York trades hit the stop inside the first hour. Your London trades on the same pairs are up $198, so try stopping new entries after the London close.</div>
            <div className="h-10 rounded-lg border app-border bg-[var(--app-panel-2)]" />
          </div>
        </ProPeek>
      ) : (
        <div className="mt-5 space-y-4">
          {tab === "insights" && (findings.length ? (
            <section aria-label="Findings across all sessions">
              <p className="mb-2 flex items-center gap-1.5 text-xs app-muted"><Sparkles size={13} className="text-brand-300" aria-hidden />From your trades across all sessions</p>
              <div className="grid gap-3 md:grid-cols-3">{findings.map((finding) => <FindingCard key={finding.kind} finding={finding} onDiscuss={() => discuss(finding)} />)}</div>
            </section>
          ) : (
            <p className="rounded-xl border border-dashed app-border px-4 py-3 text-sm app-muted">Findings appear here once you have at least 5 closed trades. You can still ask the AI anything below.</p>
          ))}
          <AiInsightsPanel
            key={sessionId || "all"}
            scope={sessionId ? "session" : "portfolio"}
            sessionId={sessionId || undefined}
            suggestions={sessionId ? sessionSuggestions : portfolioSuggestions}
            title="AI Analyst"
            subtitle={sessionId ? `Reading “${sessions.find((session) => session.id === sessionId)?.name ?? "this session"}”` : "Reading all your saved sessions"}
            queued={queued}
          />
        </div>
      )}
    </div>
  );
}
