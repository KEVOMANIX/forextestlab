"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { LauncherButton } from "@/components/support/LauncherButton";
import {
  SUPPORT_ACTIVE_KEY,
  existingSupportVisitorId,
  isLauncherHidden,
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
  const hidden = isLauncherHidden(pathname);

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
      <div className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-[120] animate-launcher-in motion-reduce:animate-none">
        <LauncherButton
          open={open}
          unread={unread}
          onClick={() => {
            // Creating the audio context inside the click keeps later chimes
            // playable: browsers refuse audio that no gesture ever authorised.
            primeSupportSound();
            setOpen((current) => !current);
          }}
        />
      </div>
    </>
  );
}
