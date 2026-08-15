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
import { primeSupportSound } from "@/lib/support-sound";

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
        onClick={() => {
          // Creating the audio context inside the click keeps later chimes
          // playable: browsers refuse audio that no gesture ever authorised.
          primeSupportSound();
          setOpen((current) => !current);
        }}
        className="group fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-[120] inline-flex animate-launcher-in items-center gap-2 rounded-full border border-brand-300/30 bg-brand-500 px-4 py-3 text-xs font-bold text-surface-950 shadow-glow transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-brand-400 active:scale-95 motion-reduce:animate-none motion-reduce:transition-none sm:px-4"
        aria-expanded={open}
        aria-controls="support-panel"
        aria-label={open ? "Close support chat" : "Open support chat"}
      >
        {/* An expanding halo only while a reply is waiting, so the animation
            means something instead of decorating the page permanently. */}
        {!open && unread > 0 && (
          <span
            aria-hidden
            className="absolute inset-0 -z-10 animate-halo-ping rounded-full bg-brand-400/45 motion-reduce:animate-none"
          />
        )}
        <span className="relative grid h-[17px] w-[17px] place-items-center">
          <MessageCircle
            size={17}
            aria-hidden
            className={`absolute transition-all duration-200 ${
              open ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
            }`}
          />
          <X
            size={17}
            aria-hidden
            className={`absolute transition-all duration-200 ${
              open ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
            }`}
          />
        </span>
        {open ? "Close" : "Help"}
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 animate-badge-pop place-items-center rounded-full bg-bear px-1 text-[10px] font-bold text-white motion-reduce:animate-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    </>
  );
}
