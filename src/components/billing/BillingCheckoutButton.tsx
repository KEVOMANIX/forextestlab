"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import type { CheckoutProductKey } from "@/lib/billing/catalog";

export function BillingCheckoutButton({ productKey, ready }: { productKey: CheckoutProductKey; ready: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function beginCheckout() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey }),
      });
      const payload = (await response.json()) as { ok?: boolean; authorizationUrl?: string; error?: string };
      if (!response.ok || !payload.authorizationUrl) throw new Error(payload.error || "Checkout could not be opened.");
      window.location.assign(payload.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout could not be opened.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={beginCheckout} disabled={!ready || busy} className="btn-primary mt-5 w-full">
        {busy ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Opening Paystack…</> : ready ? <>Continue to Paystack <ArrowRight size={15} aria-hidden /></> : "Paystack approval pending"}
      </button>
      {error && <p role="alert" className="mt-3 text-center text-xs text-bear">{error}</p>}
      {!ready && <p className="mt-3 text-center text-[10px] leading-relaxed app-muted">This option activates as soon as its approved Paystack configuration is added.</p>}
    </div>
  );
}
