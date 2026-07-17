"use client";

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
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-bear">{error}</p>}
      <button type="button" className="btn-secondary" onClick={signOut} disabled={busy}>
        Sign out
      </button>
      <div className="rounded-xl border border-bear/30 bg-bear/5 p-4">
        <h2 className="font-semibold text-bear">Delete account</h2>
        <button
          type="button"
          className="mt-4 rounded-lg bg-bear px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => setDeleteOpen(true)}
          disabled={busy}
        >
          Delete my account
        </button>
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
