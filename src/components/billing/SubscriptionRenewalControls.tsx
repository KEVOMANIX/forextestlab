"use client";

import { CalendarClock, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmModal } from "@/components/ConfirmModal";

export function SubscriptionRenewalControls({
  autoRenew,
  nextPaymentLabel,
}: {
  autoRenew: boolean;
  nextPaymentLabel: string | null;
}) {
  const router = useRouter();
  const [renewing, setRenewing] = useState(autoRenew);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeRenewal(action: "cancel" | "renew") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/renewal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as {
        autoRenew?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok || typeof payload.autoRenew !== "boolean") {
        throw new Error(payload.error || "Your renewal preference could not be updated.");
      }
      setRenewing(payload.autoRenew);
      setMessage(payload.message ?? null);
      setConfirmOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your renewal preference could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rounded-xl border app-border bg-[var(--app-panel-2)]/45 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${renewing ? "bg-brand-400/10 text-brand-300" : "bg-amber-400/10 text-amber-300"}`}>
              {renewing ? <RefreshCw size={18} aria-hidden /> : <CalendarClock size={18} aria-hidden />}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">Automatic renewal</h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${renewing ? "bg-brand-400/10 text-brand-300" : "bg-amber-400/10 text-amber-300"}`}>
                  {renewing ? "On" : "Off"}
                </span>
              </div>
              <p className="mt-1 text-sm app-muted">
                {renewing
                  ? nextPaymentLabel
                    ? `Your plan renews on ${nextPaymentLabel}.`
                    : "Your plan will renew automatically."
                  : nextPaymentLabel
                    ? `Your access continues until ${nextPaymentLabel}.`
                    : "Your plan will not renew at the end of the billing period."}
              </p>
            </div>
          </div>
          {renewing ? (
            <button
              type="button"
              className="btn-secondary shrink-0 px-4 py-2 text-xs"
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
            >
              Cancel plan
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary shrink-0 px-4 py-2 text-xs"
              onClick={() => changeRenewal("renew")}
              disabled={busy}
            >
              {busy ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={14} /> Keep auto-renewal</>}
            </button>
          )}
        </div>
        {message && <p role="status" className="mt-4 rounded-lg border border-brand-400/25 bg-brand-400/[0.07] px-3 py-2 text-xs text-brand-300">{message}</p>}
        {error && <p role="alert" className="mt-4 rounded-lg border border-bear/30 bg-bear/10 px-3 py-2 text-xs text-bear">{error}</p>}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Turn off automatic renewal?"
        message={`Your plan will remain active${nextPaymentLabel ? ` until ${nextPaymentLabel}` : " until the end of the current billing period"}. You can turn renewal back on before then.`}
        confirmLabel="Turn off renewal"
        danger
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => changeRenewal("cancel")}
      />
    </>
  );
}
