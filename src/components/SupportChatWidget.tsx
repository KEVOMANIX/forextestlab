"use client";

import { MessageCircle, X } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  SUPPORT_ACTIVE_KEY,
  existingSupportVisitorId,
  type SupportChatSummary,
} from "@/lib/support-client";
import { playSupportChime, primeSupportSound } from "@/lib/support-sound";

/**
 * The panel is the bulk of the support chat, and almost nobody opens it, so it
 * is fetched on first click instead of shipping with every page.
 */
const SupportChatPanel = dynamic(
  () =>
    import("./support/SupportChatPanel").then((mod) => mod.SupportChatPanel),
  { ssr: false },
);

/**
 * Routes that own the whole viewport and have their own bottom-right chrome. A
 * floating launcher there would sit on top of the trading dock's account
 * read-out, so the widget stands down and those pages link to /app/support.
 */
const HIDDEN_ROUTES = ["/app/backtest", "/app/support", "/support-team"];

/**
 * A reply should reach the customer while they are reading something else, so
 * the watcher keeps running on a hidden tab — just more slowly, and only for
 * visitors who actually have a conversation open with support.
 */
const VISIBLE_POLL_MS = 15_000;
const HIDDEN_POLL_MS = 45_000;

export function SupportChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const openRef = useRef(open);
  openRef.current = open;
  const hidden = HIDDEN_ROUTES.some((route) => pathname?.startsWith(route));

  useEffect(() => {
    if (hidden) return;
    const visitorId = existingSupportVisitorId();
    if (!visitorId) return;

    let stopped = false;
    let timer = 0;
    let seen: number | null = null;
    const baseTitle = document.title;

    const announce = (total: number, summaries: SupportChatSummary[]) => {
      // The tab strip is the only surface a background reply can use without
      // asking permission, so the count goes in the title too.
      document.title = total > 0 ? `(${total}) ${baseTitle}` : baseTitle;
      if (seen === null || total <= seen) {
        seen = total;
        return;
      }
      seen = total;
      if (!openRef.current) playSupportChime("incoming");
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        document.visibilityState !== "visible"
      ) {
        const latest = summaries.find((item) => item.customerUnreadCount > 0);
        const notification = new Notification("ForexTestLab Support", {
          body:
            latest?.messages[0]?.body?.slice(0, 140) ?? "You have a new reply.",
          tag: "forextestlab-support",
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    };

    const check = async () => {
      // An unread reply needs a conversation to exist first: visitors who have
      // never written in are never polled. While the panel is open it is
      // already polling the thread and marking it read, so this stands down.
      if (openRef.current) return;
      if (!window.localStorage.getItem(SUPPORT_ACTIVE_KEY)) return;
      const response = await fetch(
        `/api/support/chat?visitorId=${encodeURIComponent(visitorId)}&list=1`,
        { cache: "no-store" },
      );
      if (!response.ok || stopped) return;
      const payload = (await response.json()) as {
        conversations?: SupportChatSummary[];
      };
      if (stopped) return;
      const summaries = payload.conversations ?? [];
      const total = summaries.reduce(
        (sum, item) => sum + item.customerUnreadCount,
        0,
      );
      setUnread(total);
      announce(total, summaries);
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => {
          void check().finally(schedule);
        },
        document.visibilityState === "visible"
          ? VISIBLE_POLL_MS
          : HIDDEN_POLL_MS,
      );
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
      schedule();
    };

    void check();
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      document.title = baseTitle;
    };
  }, [hidden]);

  const close = useCallback(() => setOpen(false), []);

  if (hidden) return null;

  return (
    <>
      {open && (
        <SupportChatPanel
          onClose={close}
          onUnread={(next) => {
            setUnread(next);
            if (next === 0)
              document.title = document.title.replace(/^\(\d+\)\s/, "");
          }}
        />
      )}
      <div className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-[120] animate-launcher-in motion-reduce:animate-none">
        <button
          type="button"
          onClick={() => {
            // Creating the audio context inside the click keeps later chimes
            // playable: browsers refuse audio that no gesture ever authorised.
            primeSupportSound();
            setOpen((current) => !current);
          }}
          className={`group relative isolate inline-flex items-center gap-2 overflow-visible rounded-full border border-brand-200/40 bg-[linear-gradient(110deg,#0c866d_0%,#12a888_25%,#4fd8ba_50%,#12a888_75%,#0c866d_100%)] bg-[length:250%_100%] px-4 py-3 text-xs font-bold text-surface-950 shadow-glow transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.03] active:scale-95 motion-reduce:animate-none motion-reduce:transition-none ${
            open ? "" : "animate-gradient-pan animate-help-breathe"
          }`}
          aria-expanded={open}
          aria-controls="support-panel"
          aria-label={open ? "Close support chat" : "Open support chat"}
        >
          {/* Layered motion, none of which moves the button's own box: a ring
              turning behind the pill, two staggered halos pushing outwards, and
              a highlight sweeping across the surface. All of it doubles in
              strength once a reply is actually waiting. */}
          {!open && (
            <>
              <span
                aria-hidden
                className="absolute -inset-[2px] -z-20 animate-ring-spin rounded-full bg-[conic-gradient(from_0deg,rgba(79,216,186,0)_0deg,rgba(143,233,211,0.95)_40deg,rgba(34,195,160,0)_140deg,rgba(79,216,186,0.7)_230deg,rgba(79,216,186,0)_330deg)] blur-[1.5px] motion-reduce:animate-none"
              />
              <span
                aria-hidden
                className={`absolute inset-0 -z-10 rounded-full motion-reduce:animate-none ${
                  unread > 0
                    ? "animate-halo-ping bg-brand-400/45"
                    : "animate-halo-idle bg-brand-400/40"
                }`}
              />
              <span
                aria-hidden
                className={`absolute inset-0 -z-10 rounded-full [animation-delay:1.6s] motion-reduce:animate-none ${
                  unread > 0
                    ? "animate-halo-ping bg-brand-400/35"
                    : "animate-halo-idle bg-brand-400/25"
                }`}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
              >
                <span className="absolute inset-y-0 left-0 w-1/2 animate-shine-sweep bg-gradient-to-r from-transparent via-white/45 to-transparent motion-reduce:animate-none" />
              </span>
            </>
          )}
          <span
            className={`relative z-10 grid h-[17px] w-[17px] place-items-center motion-reduce:animate-none ${
              !open && unread > 0
                ? "animate-nudge"
                : !open
                  ? "animate-launcher-float"
                  : ""
            }`}
          >
            <MessageCircle
              size={17}
              aria-hidden
              className={`absolute transition-all duration-200 ${
                open
                  ? "rotate-90 scale-0 opacity-0"
                  : "rotate-0 scale-100 opacity-100"
              }`}
            />
            <X
              size={17}
              aria-hidden
              className={`absolute transition-all duration-200 ${
                open
                  ? "rotate-0 scale-100 opacity-100"
                  : "-rotate-90 scale-0 opacity-0"
              }`}
            />
          </span>
          <span className="relative z-10">{open ? "Close" : "Help"}</span>
          {!open && unread > 0 && (
            <span className="absolute -right-1 -top-1 z-10 grid h-4 min-w-4 animate-badge-pop place-items-center rounded-full bg-bear px-1 text-[10px] font-bold text-white ring-2 ring-surface-950/40 motion-reduce:animate-none">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </div>
    </>
  );
}
