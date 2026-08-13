"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

export function SessionFeedback({ sessionId }: { sessionId: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (sent) return <section className="panel mt-6 flex items-center gap-3 p-5 text-sm"><CheckCircle2 className="text-brand-300" size={20} /><div><p className="font-semibold">Thank you for the feedback.</p><p className="mt-1 text-xs app-muted">It will help us improve the next release.</p></div></section>;
  return <section className="panel mt-6 p-5 sm:p-6"><h2 className="text-lg font-semibold">How was this backtest?</h2><p className="mt-1 text-xs app-muted">A quick rating helps us prioritize what to improve.</p><div className="mt-4 flex gap-2" aria-label="Rate this backtest">{[1,2,3,4,5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} out of 5`} className={`h-10 w-10 rounded-lg border text-sm font-bold ${rating === value ? "border-brand-400 bg-brand-400/15 text-brand-300" : "app-border app-muted"}`}>{value}</button>)}</div><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} rows={3} placeholder="What worked well, or what got in your way? (optional)" className="app-input mt-4 w-full resize-y" /><button type="button" disabled={!rating || busy} onClick={async () => { setBusy(true); const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, rating, comment }) }).catch(() => null); setBusy(false); if (response?.ok) setSent(true); }} className="btn-primary mt-3 px-4 py-2 text-xs disabled:opacity-40">{busy ? "Sending…" : "Send feedback"}</button></section>;
}
