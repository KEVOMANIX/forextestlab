"use client";

import { initializePaddle } from "@paddle/paddle-js";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";

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
      const payload = (await response.json()) as {
        clientToken?: string;
        environment?: "sandbox" | "production";
        priceId?: string;
        userId?: string;
        email?: string;
        productKey?: string;
        error?: string;
      };
      if (!response.ok || !payload.clientToken || !payload.priceId || !payload.userId || !payload.email) {
        throw new Error(payload.error || "Checkout could not be opened.");
      }
      const paddle = await initializePaddle({
        token: payload.clientToken,
        environment: payload.environment,
        eventCallback: (event) => {
          if (event.name === "checkout.closed") setBusy(false);
          if (event.name === "checkout.error" || event.name === "checkout.payment.error") {
            setError("Payment could not be completed. Please check your details and try again.");
            setBusy(false);
          }
        },
      });
      if (!paddle) throw new Error("Paddle checkout could not be initialized.");
      paddle.Checkout.open({
        items: [{ priceId: payload.priceId, quantity: 1 }],
        customer: { email: payload.email },
        customData: { userId: payload.userId, productKey: payload.productKey },
        settings: {
          variant: "one-page",
          theme: "dark",
          allowLogout: false,
          successUrl: `${window.location.origin}/billing/success`,
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout could not be opened.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={beginCheckout} disabled={!ready || busy} className="btn-primary mt-5 w-full">
        {busy ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Opening secure checkout…</> : ready ? <>Continue to payment <ArrowRight size={15} aria-hidden /></> : "Paddle sandbox setup pending"}
      </button>
      {error && <p role="alert" className="mt-3 text-center text-xs text-bear">{error}</p>}
      {!ready && <p className="mt-3 text-center text-[10px] leading-relaxed app-muted">Add the Paddle client token and sandbox price IDs to activate checkout.</p>}
    </div>
  );
}
