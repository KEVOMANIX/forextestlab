"use client";

import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/**
 * Sign out and come straight back to the staff sign-in page.
 *
 * The whole point of the denied state is that the visitor is signed in as the
 * wrong person, so returning them to the marketing home page — what the
 * account page's sign-out does — would make them navigate back here by hand.
 */
export function SwitchAccountButton({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function switchAccount() {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    router.replace(returnTo);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={switchAccount}
      disabled={busy}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-bold text-surface-950 transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <LogOut size={15} aria-hidden />}
      Switch account
    </button>
  );
}
