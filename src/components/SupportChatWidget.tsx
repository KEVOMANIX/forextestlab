"use client";

import { MessageCircle, X } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  SUPPORT_ACTIVE_KEY,
  existingSupportVisitorId,
  type SupportChatSummary,
} from "@/lib/support-client";

/**
 * The panel is the bulk of the support chat, and almost nobody opens it, so it
 * is fetched on first click instead of shipping with every page.
 */
const SupportChatPanel = dynamic(
  () => import("./support/SupportChatPanel").then((mod) => mod.SupportChatPanel),
  { ssr: false },
);

/**
 * Routes that own the whole viewport and have their own bottom-right chrome. A
 * floating launcher there would sit on top of the trading dock's account
 * read-out, so the widget stands down and those pages link to /app/support.
 */
const HIDDEN_ROUTES = ["/app/backtest", "/app/support", "/support-team"];

export function SupportChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const hidden = HIDDEN_ROUTES.some((route) => pathname?.startsWith(route));

  useEffect(() => {
    // One lookup per page load, and only for visitors who have actually
    // written in — an unread reply needs a conversation to exist first. Agents
    // replying also send email, so there is no polling loop behind this badge.
    if (hidden) return;
    const visitorId = existingSupportVisitorId();
    if (!visitorId || !window.localStorage.getItem(SUPPORT_ACTIVE_KEY)) return;
    let active = true;
    void (async () => {
      const response = await fetch(
        `/api/support/chat?visitorId=${encodeURIComponent(visitorId)}&list=1`,
        { cache: "no-store" },
      );
      if (!response.ok || !active) return;
      const payload = (await response.json()) as {
        conversations?: SupportChatSummary[];
      };
      if (!active) return;
      setUnread(
        (payload.conversations ?? []).reduce(
          (total, item) => total + item.customerUnreadCount,
          0,
        ),
      );
    })();
    return () => {
      active = false;
    };
  }, [hidden]);

  const close = useCallback(() => setOpen(false), []);

  if (hidden) return null;

  return (
    <>
      {open && <SupportChatPanel onClose={close} onUnread={setUnread} />}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-5 right-4 z-[120] inline-flex items-center gap-2 rounded-full border border-brand-300/30 bg-brand-500 px-4 py-3 text-xs font-bold text-surface-950 shadow-glow transition-transform hover:-translate-y-0.5"
        aria-expanded={open}
        aria-controls="support-panel"
      >
        {open ? (
          <>
            <X size={17} aria-hidden /> Close
          </>
        ) : (
          <>
            <MessageCircle size={17} aria-hidden /> Help
          </>
        )}
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bear px-1 text-[8px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    </>
  );
}
