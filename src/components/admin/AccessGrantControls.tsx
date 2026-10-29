"use client";

import { Loader2, ShieldPlus } from "lucide-react";
import { useActionState, useState } from "react";

import { grantManualAccess, revokeManualAccess } from "@/app/admin/actions";

/** What a grant or revoke did, shown under the buttons. */
export type AccessResult = { ok: boolean; message: string } | null;

/** Grant or revoke dated Pro access for one account, with the outcome shown in place. */
export function AccessGrantControls({ userId, activeGrant }: { userId: string; activeGrant: boolean }) {
  const [granted, grant, granting] = useActionState(grantManualAccess, null);
  const [revoked, revoke, revoking] = useActionState(revokeManualAccess, null);
  const [last, setLast] = useState<"grant" | "revoke">("grant");
  const result = granting || revoking ? null : last === "grant" ? granted : revoked;
  const busy = granting || revoking;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <form action={grant} onSubmit={() => setLast("grant")} className="flex gap-1.5">
          <input type="hidden" name="userId" value={userId} />
          <select name="days" aria-label="Grant length" className="app-input py-1.5 text-xs">
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
          <button disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-surface-950 disabled:opacity-60">
            {granting ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <ShieldPlus size={13} aria-hidden />}
            {granting ? "Granting…" : activeGrant ? "Extend" : "Grant"}
          </button>
        </form>
        {activeGrant && (
          <form action={revoke} onSubmit={() => setLast("revoke")}>
            <input type="hidden" name="userId" value={userId} />
            <button disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-loss/25 px-2.5 py-1.5 text-xs font-semibold text-loss disabled:opacity-60">
              {revoking && <Loader2 size={13} className="animate-spin" aria-hidden />}
              {revoking ? "Revoking…" : "Revoke grant"}
            </button>
          </form>
        )}
      </div>
      <p aria-live="polite" className={`mt-1.5 min-h-4 text-xs ${result ? (result.ok ? "text-[var(--app-accent-text)]" : "text-loss") : ""}`}>
        {result?.message}
      </p>
    </div>
  );
}
