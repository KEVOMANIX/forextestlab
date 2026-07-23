"use client";

import { Loader2, LogOut, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { ConfirmModal } from "@/components/ConfirmModal";

export function AccountActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function signOut() {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

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
    <div>
      {error && <p role="alert" className="mb-4 rounded-lg border border-bear/25 bg-bear/5 px-4 py-3 text-sm text-bear">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="panel-2 flex flex-col justify-between p-5">
          <div>
            <span className="grid h-9 w-9 place-items-center rounded-lg border app-border app-muted">
              <LogOut size={16} aria-hidden />
            </span>
            <h3 className="mt-4 font-semibold">Sign out</h3>
            <p className="mt-1.5 text-sm leading-relaxed app-muted">
              End your session securely on this device.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary mt-5 h-10 w-full px-4 py-2 text-xs"
            onClick={signOut}
            disabled={busy}
          >
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <LogOut size={15} aria-hidden />}
            Sign out
          </button>
        </div>

        <div className="rounded-lg border border-bear/25 bg-bear/[0.04] p-5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-bear/10 text-bear">
            <Trash2 size={16} aria-hidden />
          </span>
          <h3 className="mt-4 font-semibold text-bear">Delete account</h3>
          <p className="mt-1.5 text-sm leading-relaxed app-muted">
            Permanently remove your profile, sessions, trades, and notes.
          </p>
        <button
          type="button"
          className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-bear/35 px-4 text-xs font-semibold text-bear transition-colors hover:bg-bear/10 disabled:opacity-50"
          onClick={() => setDeleteOpen(true)}
          disabled={busy}
        >
          <Trash2 size={15} aria-hidden />
          Delete account
        </button>
        </div>
      </div>
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
    </div>
  );
}
