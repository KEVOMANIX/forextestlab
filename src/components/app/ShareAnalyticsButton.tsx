"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Share2, X } from "lucide-react";
type Share = { token: string; expiresAt: string };

export function ShareAnalyticsButton({ sessionId }: { sessionId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<Share | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const url = share && typeof window !== "undefined" ? `${window.location.origin}/share/analytics/${share.token}` : "";
  async function request(method: "GET" | "POST" | "DELETE") {
    setBusy(true); setError(""); setCopied(false);
    try {
      const response = await fetch(`/api/backtest/sessions/${encodeURIComponent(sessionId)}/share`, { method, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to share this report.");
      setShare(data.share); setLoaded(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to share this report."); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); }
    catch { setError("Copy the link from the field below."); }
  }
  return <>
    <button type="button" data-html2canvas-ignore onClick={() => { setOpen(true); setLoaded(false); void request("GET"); }} className="inline-flex h-9 items-center gap-2 rounded-lg border app-border px-3 text-xs font-semibold hover:bg-white/5"><Share2 size={14} /> Share</button>
    {open && createPortal(<dialog ref={node => { dialog.current = node; if (node && !node.open) node.showModal(); }} onClose={() => setOpen(false)} className="app-theme-surface m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border app-border bg-[var(--app-panel-solid)] p-6 text-[var(--app-text)] shadow-2xl backdrop:bg-black/60" aria-labelledby="share-analytics-title">
      <div className="flex items-center justify-between gap-4"><h2 id="share-analytics-title" className="text-lg font-semibold">Share analytics</h2><button type="button" onClick={() => dialog.current?.close()} aria-label="Close share dialog" className="p-2 app-muted"><X size={18} /></button></div>
      <p className="mt-3 text-sm app-muted">Anyone with the link can view your charts, balances, performance and closed trades from the latest saved session. Journal notes, account details and experimental trades are excluded.</p>
      <p className="mt-2 text-xs app-muted">Links expire after 30 days. You can revoke access here at any time. A new snapshot replaces the old link.</p>
      {error && <p role="alert" className="mt-4 text-sm text-loss">{error}</p>}
      {share && <div className="mt-5 space-y-3"><label className="block text-xs font-semibold">Report link<input readOnly value={url} onFocus={e => e.target.select()} className="mt-2 w-full rounded-lg border app-border bg-[var(--app-bg)] p-3 text-xs font-normal" /></label><p className="text-xs app-muted">Expires {new Date(share.expiresAt).toLocaleDateString()}</p><div className="flex gap-3"><button type="button" onClick={copy} className="rounded-lg bg-brand-400 px-4 py-2 text-sm font-semibold text-surface-950">{copied ? "Copied" : "Copy link"}</button><a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg border app-border px-4 py-2 text-sm">Preview report</a></div></div>}
      <div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={busy || !loaded} onClick={() => void request("POST")} className="rounded-lg border app-border px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy ? "Please wait…" : share ? "Create new snapshot" : "Create share link"}</button>{share && <button type="button" disabled={busy} onClick={() => void request("DELETE")} className="rounded-lg px-4 py-2 text-sm text-loss disabled:opacity-50">Revoke link</button>}{!loaded && !busy && <button onClick={() => void request("GET")} className="text-sm underline">Try again</button>}</div>
      <p aria-live="polite" className="sr-only">{copied ? "Link copied" : ""}</p>
    </dialog>, document.body)}
  </>;
}
