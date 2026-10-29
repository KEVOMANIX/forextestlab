"use client";

import { Check, Loader2, LogOut, MonitorSmartphone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { ConfirmModal } from "@/components/ConfirmModal";

/** Sign out here, or end every other device's session and stay signed in. */
export function SessionActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<"here" | "others" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [othersDone, setOthersDone] = useState(false);

  async function signOut(scope: "local" | "others") {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    setBusy(scope === "local" ? "here" : "others");
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut({ scope });
    if (scope === "local") {
      router.replace("/");
      router.refresh();
      return;
    }
    if (signOutError) setError("Other devices could not be signed out. Please try again.");
    else setOthersDone(true);
    setBusy(null);
  }

  return (
    <div className="divide-y divide-[var(--app-border)]">
      <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <MonitorSmartphone size={17} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />
          <div><p className="text-sm font-medium">Other devices</p><p className="text-xs app-muted">Sign out of every other browser and device. You stay signed in here.</p></div>
        </div>
        <button type="button" className="btn-secondary h-9 shrink-0 px-4 text-xs" onClick={() => void signOut("others")} disabled={busy !== null || othersDone}>
          {busy === "others" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : othersDone ? <Check size={15} aria-hidden /> : <LogOut size={15} aria-hidden />}
          {othersDone ? "Signed out" : "Sign out all"}
        </button>
      </div>
      <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <LogOut size={17} className="mt-0.5 shrink-0 app-muted" aria-hidden />
          <div><p className="text-sm font-medium">This device</p><p className="text-xs app-muted">End your session in this browser.</p></div>
        </div>
        <button type="button" className="btn-secondary h-9 shrink-0 px-4 text-xs" onClick={() => void signOut("local")} disabled={busy !== null}>
          {busy === "here" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <LogOut size={15} aria-hidden />}
          Sign out
        </button>
      </div>
      {error && <p role="alert" className="pt-3 text-sm text-loss">{error}</p>}
    </div>
  );
}

export function DeleteAccountSection() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/account", { method: "DELETE" });
    const data = (await response.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      setError(data.error ?? "Account deletion failed.");
      setBusy(false);
      return;
    }
    const supabase = createBrowserSupabaseClient();
    await supabase?.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <section className="border-t app-border pt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-loss">Delete account</h2>
          <p className="mt-1 text-sm app-muted">Permanently remove your profile, sessions, trades and notes. This cannot be undone.</p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-loss/10 px-4 text-xs font-semibold text-loss transition-colors hover:bg-loss/20 disabled:opacity-50"
          onClick={() => setDeleteOpen(true)}
          disabled={busy}
        >
          <Trash2 size={15} aria-hidden />
          Delete account
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-loss">{error}</p>}
      <ConfirmModal
        open={deleteOpen}
        title="Delete account?"
        message="Your profile, sessions, trades, notes, and results will be permanently deleted. This cannot be undone."
        confirmLabel="Delete account"
        danger
        busy={busy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void deleteAccount()}
      />
    </section>
  );
}
