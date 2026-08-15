"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 5_000;
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

  useEffect(() => {
    const navigatingSince = { at: 0 };
    let lastUrl = window.location.href;

    const onClick = (event: MouseEvent) => {
      const link =
        event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link) navigatingSince.at = Date.now();
    };

    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      setConnected(navigator.onLine);
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        navigatingSince.at = 0;
      }
      if (
        navigatingSince.at &&
        Date.now() - navigatingSince.at < NAVIGATION_GRACE_MS
      ) {
        return;
      }
      const active = document.activeElement;
      const editing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement;
      if (navigator.onLine && !editing) router.refresh();
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
  }, [router]);

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
