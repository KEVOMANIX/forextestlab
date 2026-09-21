"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createFeedbackDraft, feedbackCampaignDetails, searchFeedbackUsers, sendFeedbackBatch, setFeedbackCampaignStatus } from "@/app/admin/feedback-actions";
import { FEEDBACK_BODY, FEEDBACK_SUBJECT } from "@/lib/feedback-email";

type Campaign = Awaited<ReturnType<typeof feedbackCampaignDetails>>;
type User = Awaited<ReturnType<typeof searchFeedbackUsers>>[number];

export function FeedbackEmails({ campaigns, userCount }: {
  campaigns: { id: string; subject: string; status: string; createdAt: string }[]; userCount: number;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(FEEDBACK_SUBJECT);
  const [body, setBody] = useState(FEEDBACK_BODY);
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<Record<string, User>>({});
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const draftId = useRef<string | null>(null);
  const active = useRef(false);

  useEffect(() => {
    if (audience !== "selected") return;
    let canceled = false;
    const timer = setTimeout(() => {
      void searchFeedbackUsers(query, page).then((rows) => { if (!canceled) setUsers(rows); }).catch(() => { if (!canceled) setError("Could not load users."); });
    }, 250);
    return () => { canceled = true; clearTimeout(timer); };
  }, [audience, query, page]);

  useEffect(() => () => { active.current = false; }, []);

  async function review() {
    setBusy(true); setError("");
    try {
      draftId.current ??= crypto.randomUUID();
      const id = await createFeedbackDraft({ id: draftId.current, subject, body, audience, userIds: Object.keys(selected) });
      setCampaign(await feedbackCampaignDetails(id)); router.refresh();
    } catch { setError("Could not prepare the draft. Check the message and recipients, then try again."); }
    finally { setBusy(false); }
  }

  async function open(id: string) {
    setBusy(true); setError("");
    try { setCampaign(await feedbackCampaignDetails(id)); }
    catch { setError("Could not load this campaign."); }
    finally { setBusy(false); }
  }

  async function send() {
    if (!campaign || active.current) return;
    active.current = true; setRunning(true); setError("");
    try {
      await setFeedbackCampaignStatus(campaign.id, "sending");
      while (active.current) {
        await sendFeedbackBatch(campaign.id);
        const next = await feedbackCampaignDetails(campaign.id);
        setCampaign(next);
        if (next.status !== "sending") break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      router.refresh();
    } catch { setError("Sending interrupted. Refresh this campaign to check progress before resuming."); }
    finally { active.current = false; setRunning(false); }
  }

  async function pause() {
    active.current = false;
    if (!campaign) return;
    try { await setFeedbackCampaignStatus(campaign.id, "paused"); setCampaign(await feedbackCampaignDetails(campaign.id)); }
    catch { setError("Could not pause. Refresh to check the campaign status."); }
  }

  const total = campaign ? Object.values(campaign.counts).reduce((sum, count) => sum + count, 0) : 0;
  const processed = total - (campaign?.counts.pending ?? 0);

  return <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
    <section className="panel min-w-0 p-5">
      {error && <p role="alert" className="mb-4 rounded-lg border border-loss/30 p-3 text-sm text-loss">{error}</p>}
      {!campaign ? <div className="space-y-5">
        <label className="block text-sm font-semibold">Subject<input className="app-input mt-2 w-full" value={subject} maxLength={160} onChange={(e) => { draftId.current = null; setSubject(e.target.value); }} /></label>
        <label className="block text-sm font-semibold">Message<textarea className="app-input mt-2 w-full text-sm leading-6" rows={14} value={body} maxLength={8000} onChange={(e) => { draftId.current = null; setBody(e.target.value); }} /></label>
        <p className="text-xs app-muted">Each email adds the recipient’s name, ForexTestLab branding, a reply-to address, and an unsubscribe link.</p>
        <fieldset className="space-y-3"><legend className="mb-2 text-sm font-semibold">Recipients</legend>
          <label className="mr-5 inline-flex items-center gap-2 text-sm"><input type="radio" name="audience" checked={audience === "all"} onChange={() => { draftId.current = null; setAudience("all"); }} />All registered users ({userCount})</label>
          <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="audience" checked={audience === "selected"} onChange={() => { draftId.current = null; setAudience("selected"); }} />Selected users</label>
          <p className="text-xs app-muted">Unsubscribed and invalid addresses are excluded. The exact audience is saved when you create the preview.</p>
          {audience === "selected" && <div className="space-y-3">
            <input aria-label="Search users" placeholder="Search name or email" className="app-input w-full" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
            <p className="text-xs app-muted">{Object.keys(selected).length} selected across all pages</p>
            <div className="max-h-64 space-y-2 overflow-y-auto">{users.map((user) => <label key={user.id} className="flex items-center gap-3 rounded border app-border p-2 text-xs"><input type="checkbox" checked={Boolean(selected[user.id])} onChange={(e) => { draftId.current = null; setSelected((previous) => { const next = { ...previous }; if (e.target.checked) next[user.id] = user; else delete next[user.id]; return next; }); }} /><span>{user.displayName || user.email}<span className="ml-2 app-muted">{user.email}</span></span></label>)}</div>
            <div className="flex gap-3"><button type="button" className="btn-secondary text-xs" disabled={!page} onClick={() => setPage(page - 1)}>Previous</button><button type="button" className="btn-secondary text-xs" disabled={users.length < 50} onClick={() => setPage(page + 1)}>Next</button></div>
          </div>}
        </fieldset>
        <button type="button" className="btn-primary" disabled={busy || !subject.trim() || !body.trim() || (audience === "selected" && !Object.keys(selected).length)} onClick={() => void review()}>{busy ? "Preparing…" : "Save draft and preview"}</button>
      </div> : <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{campaign.subject}</h2><p className="mt-1 text-xs app-muted">{total} recipients · {campaign.status}</p></div><button type="button" disabled={running || busy} className="btn-secondary text-xs" onClick={() => { setCampaign(null); draftId.current = null; }}>New draft</button></div>
        <iframe title="Email preview" sandbox="" srcDoc={campaign.previewHtml} className="h-[560px] w-full rounded-xl border app-border bg-white" />
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><p>Sent to provider <strong>{campaign.counts.sent ?? 0}</strong></p><p>Pending <strong>{campaign.counts.pending ?? 0}</strong></p><p>Skipped <strong>{campaign.counts.skipped ?? 0}</strong></p><p>Unconfirmed <strong>{(campaign.counts.unconfirmed ?? 0) + (campaign.counts.sending ?? 0)}</strong></p></div>
        <progress className="h-2 w-full accent-brand-400" value={processed} max={total || 1} aria-label="Campaign progress" />
        <p className="text-xs app-muted">Sent means accepted by the email provider, not confirmed inbox delivery. Unconfirmed attempts are not automatically retried to avoid duplicates.</p>
        {campaign.status === "paused" && (campaign.counts.unconfirmed ?? 0) > 0 && <p role="status" className="rounded-lg border border-amber-400/30 p-3 text-sm text-amber-200">Sending paused after an unconfirmed attempt. Check your email provider before resuming the remaining recipients.</p>}
        <details className="rounded-lg border app-border p-3"><summary className="cursor-pointer text-sm">Review recipient addresses and status (first {campaign.recipients.length})</summary><div className="mt-3 max-h-64 space-y-2 overflow-auto">{campaign.recipients.map((r) => <div key={r.email} className="flex justify-between gap-3 text-xs"><span>{r.email}</span><span>{r.status}</span></div>)}</div></details>
        {(campaign.counts.pending ?? 0) > 0 && <div className="space-y-3"><p className="text-sm">Keep this page open while sending. You can pause and resume later.</p><div className="flex gap-3">{running ? <button type="button" className="btn-secondary" onClick={() => void pause()}>Pause sending</button> : <button type="button" className="btn-primary" disabled={busy} onClick={() => void send()}>{campaign.status === "draft" ? `Send to ${campaign.counts.pending} recipients` : `Resume ${campaign.counts.pending} remaining`}</button>}<button type="button" className="btn-secondary" disabled={running || busy} onClick={() => void open(campaign.id)}>Refresh status</button></div></div>}
      </div>}
    </section>
    <aside className="panel h-fit p-4"><h2 className="font-semibold">Recent campaigns</h2><div className="mt-4 space-y-2">{campaigns.map((c) => <button type="button" disabled={running || busy} key={c.id} onClick={() => void open(c.id)} className="block w-full rounded-lg border app-border p-3 text-left text-sm hover:bg-white/5"><span className="block font-semibold">{c.subject}</span><span className="mt-1 block text-xs app-muted">{c.status} · {new Date(c.createdAt).toLocaleDateString()}</span></button>)}{!campaigns.length && <p className="text-xs app-muted">No campaigns yet.</p>}</div></aside>
  </div>;
}
