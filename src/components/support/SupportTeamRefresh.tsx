"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function SupportTeamRefresh() {
  const router = useRouter();
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      setConnected(navigator.onLine);
      const active = document.activeElement;
      const editing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement;
      if (navigator.onLine && !editing) router.refresh();
    };
    const timer = window.setInterval(refresh, 5_000);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, [router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] app-muted">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connected ? "bg-brand-400" : "bg-bear"
        }`}
      />
      {connected ? "Live inbox" : "Offline"}
    </span>
  );
}
