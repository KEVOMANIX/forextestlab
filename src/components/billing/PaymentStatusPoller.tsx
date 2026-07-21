"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export function PaymentStatusPoller({ reference }: { reference?: string }) {
  const router = useRouter();
  const checkingRef = useRef(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("Waiting for Paddle to confirm your subscription.");
  const check = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const query = reference ? `?reference=${encodeURIComponent(reference)}` : "";
      const response = await fetch(`/api/billing/status${query}`, { cache: "no-store" });
      const payload = (await response.json()) as { status?: string; message?: string };
      if (payload.status === "success") {
        router.refresh();
        return;
      }
      if (payload.status === "failed") {
        router.replace(`/billing/failed${reference ? `?reference=${encodeURIComponent(reference)}` : ""}`);
        return;
      }
      setMessage(payload.message || "Payment confirmation is still pending.");
    } catch {
      setMessage("Confirmation is taking longer than expected. You can safely check again.");
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [reference, router]);
  useEffect(() => {
    const timer = window.setInterval(() => void check(), 5000);
    return () => window.clearInterval(timer);
  }, [check]);
  return <div><button type="button" onClick={() => void check()} disabled={checking} className="btn-secondary w-full"><RefreshCw size={15} className={checking ? "animate-spin" : ""} aria-hidden />{checking ? "Checking…" : "Check subscription status"}</button><p aria-live="polite" className="mt-3 text-xs text-slate-500">{message}</p></div>;
}
