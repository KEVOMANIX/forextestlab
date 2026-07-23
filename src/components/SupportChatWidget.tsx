"use client";

import { Bot, MessageCircle, Send, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type ChatMessage = { id: number; from: "assistant" | "user"; text: string };

const QUICK_QUESTIONS = [
  "How does the free trial work?",
  "How do I resume a session?",
  "I need help with billing",
] as const;

const ANSWERS: Array<{ keywords: string[]; answer: string }> = [
  {
    keywords: ["trial", "free", "three", "month"],
    answer: "The free trial includes up to three EUR/USD replay sessions. Each session covers one month of historical data, with no payment required.",
  },
  {
    keywords: ["resume", "session", "continue", "saved"],
    answer: "Open your Dashboard or Sessions page, choose a saved session, and select Resume. Your replay progress and trades are saved automatically.",
  },
  {
    keywords: ["bill", "billing", "payment", "plan", "subscription", "paddle", "cancel"],
    answer: "You can review your plan and billing from Account → Billing. For payment failures, cancellations, or account-specific questions, our support team can help directly.",
  },
  {
    keywords: ["chart", "replay", "play", "speed", "candle", "trade", "buy", "sell"],
    answer: "Use the replay controls below the chart to play, pause, change speed, and select a step interval. Buy and Sell execute simulated trades immediately while the replay is paused or playing.",
  },
  {
    keywords: ["data", "pair", "market", "forex", "historical"],
    answer: "ForexTestLab uses historical market data for replay and simulated execution. Available pairs and date ranges depend on your plan and the data currently available for that market.",
  },
];

function answerQuestion(question: string): string {
  const normalized = question.toLowerCase();
  const match = ANSWERS.find((entry) => entry.keywords.some((keyword) => normalized.includes(keyword)));
  return match?.answer ?? "I don’t have a reliable answer for that yet. Our support team can review the details and help you directly.";
}

export function SupportChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, from: "assistant", text: "Hi! I can help with common ForexTestLab questions. What would you like to know?" },
  ]);

  function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    const nextId = messages.length + 1;
    setMessages((current) => [
      ...current,
      { id: nextId, from: "user", text: trimmed },
      { id: nextId + 1, from: "assistant", text: answerQuestion(trimmed) },
    ]);
    setInput("");
  }

  return (
    <>
      {open && (
        <section className="fixed bottom-24 right-4 z-[80] flex w-[min(calc(100vw-2rem),380px)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-surface-900 shadow-2xl shadow-black/40" aria-label="ForexTestLab support assistant">
          <header className="flex items-center justify-between border-b border-white/10 bg-[linear-gradient(135deg,rgba(34,195,160,.18),rgba(17,23,37,.7))] px-4 py-3.5">
            <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-400/15 text-brand-300"><Bot size={18} aria-hidden /></span><div><p className="text-sm font-semibold text-white">Support assistant</p><p className="mt-0.5 text-[11px] text-slate-400">Quick answers for common questions</p></div></div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close support assistant"><X size={17} aria-hidden /></button>
          </header>

          <div className="max-h-[min(48vh,390px)] space-y-3 overflow-y-auto p-4" aria-live="polite">
            {messages.map((message) => <div key={message.id} className={`flex ${message.from === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-5 ${message.from === "user" ? "rounded-br-md bg-brand-500 text-surface-950" : "rounded-bl-md bg-surface-800 text-slate-300"}`}>{message.text}</div></div>)}
            <div className="flex items-center gap-2 rounded-xl border border-brand-400/15 bg-brand-400/[0.05] px-3 py-2.5 text-[11px] text-slate-400"><Sparkles size={13} className="shrink-0 text-brand-300" aria-hidden /> Need something more specific? <Link href="/support" onClick={() => setOpen(false)} className="font-semibold text-brand-300 hover:text-brand-200">Contact support</Link></div>
          </div>

          <div className="border-t border-white/10 px-3 pb-3 pt-2.5"><div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">{QUICK_QUESTIONS.map((question) => <button key={question} type="button" onClick={() => ask(question)} className="shrink-0 rounded-full border border-white/10 bg-surface-800 px-2.5 py-1.5 text-[10px] font-medium text-slate-300 hover:border-brand-400/30 hover:text-brand-200">{question}</button>)}</div><form onSubmit={(event) => { event.preventDefault(); ask(input); }} className="flex items-center gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask a question…" aria-label="Ask support assistant a question" className="app-input min-w-0 flex-1 py-2.5 text-xs" /><button type="submit" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500 text-surface-950 hover:bg-brand-400" aria-label="Send question"><Send size={15} aria-hidden /></button></form></div>
        </section>
      )}

      <button type="button" onClick={() => setOpen((current) => !current)} className="fixed bottom-5 right-4 z-[80] inline-flex items-center gap-2 rounded-full border border-brand-300/30 bg-brand-500 px-4 py-3 text-xs font-bold text-surface-950 shadow-glow transition-transform hover:-translate-y-0.5" aria-expanded={open} aria-controls="support-assistant-panel"><MessageCircle size={17} aria-hidden /> Help</button>
    </>
  );
}
