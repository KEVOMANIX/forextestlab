"use client";

import { Check, X } from "lucide-react";

export interface TradeNotification {
  id: string;
  title: string;
  detail: string;
  tone: "long" | "short" | "closed";
}

export function TradeNotifications({ notifications, onDismiss }: { notifications: TradeNotification[]; onDismiss: (id: string) => void }) {
  return (
    <div className="pointer-events-none absolute bottom-12 left-3 z-50 flex w-[min(330px,calc(100vw-24px))] flex-col gap-2" aria-live="polite">
      {notifications.map((notification) => (
        <article key={notification.id} className="pointer-events-auto flex overflow-hidden rounded-xl border app-border bg-[var(--app-panel)]/97 shadow-2xl backdrop-blur">
          <div className={`w-2 shrink-0 ${notification.tone === "long" ? "bg-brand-500" : notification.tone === "short" ? "bg-bear" : "bg-blue-500"}`} />
          <div className="flex min-w-0 flex-1 gap-2 p-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-brand-400/50 text-brand-300"><Check size={12} /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{notification.title}</p>
              <p className="mt-1 text-xs leading-5 app-muted">{notification.detail}</p>
            </div>
            <button type="button" onClick={() => onDismiss(notification.id)} className="grid h-6 w-6 shrink-0 place-items-center rounded app-muted hover:bg-white/[0.06]" aria-label="Dismiss notification"><X size={13} /></button>
          </div>
        </article>
      ))}
    </div>
  );
}
