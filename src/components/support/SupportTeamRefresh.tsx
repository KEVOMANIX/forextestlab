"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSupportRealtime } from "@/components/support/useSupportRealtime";

// Realtime events refresh immediately. This long interval is only a fallback
// for a process restart or a proxy that temporarily interrupted the stream.
const POLL_INTERVAL_MS = 60_000;
const NAVIGATION_GRACE_MS = 15_000;

/**
 * Keeps the team inbox current without the agent reloading it.
 *
 * A `router.refresh()` issued while a link navigation is still in flight
 * cancels that navigation, which made conversation cards, queue links and sort
 * links silently do nothing whenever a click landed near a poll tick. Any link
 * click therefore parks the poller until the URL has actually changed.
 */
export function SupportTeamRefresh() {
  const router = useRouter();
  const [connected, setConnected] = useState(true);
  const navigatingAtRef = useRef(0);
  const lastUrlRef = useRef("");

  const refresh = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    setConnected(navigator.onLine);
    if (window.location.href !== lastUrlRef.current) {
      lastUrlRef.current = window.location.href;
      navigatingAtRef.current = 0;
    }
    if (
      navigatingAtRef.current &&
      Date.now() - navigatingAtRef.current < NAVIGATION_GRACE_MS
    ) {
      return;
    }
    const active = document.activeElement;
    const editing =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement;
    if (navigator.onLine && !editing) router.refresh();
  }, [router]);

  useSupportRealtime({
    conversationId: "*",
    onConversationChange: refresh,
    role: "agent",
  });

  useEffect(() => {
    lastUrlRef.current = window.location.href;

    const onClick = (event: MouseEvent) => {
      const link =
        event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link) navigatingAtRef.current = Date.now();
    };

    const connection = () => setConnected(navigator.onLine);
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    document.addEventListener("click", onClick, true);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, [refresh]);

  return (
    <span
      title={connected ? "Live inbox" : "Offline"}
      className="inline-flex items-center gap-1.5 text-[11px] app-muted"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connected ? "bg-brand-400" : "bg-bear"
        }`}
      />
      <span className="hidden min-[1440px]:inline">
        {connected ? "Live" : "Offline"}
      </span>
    </span>
  );
}
