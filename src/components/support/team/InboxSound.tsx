"use client";

import { Bell, BellOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  isSupportMuted,
  playSupportChime,
  primeSupportSound,
  setSupportMuted,
} from "@/lib/support-sound";

/**
 * Chimes when the queue gains an unread customer message. The count comes from
 * the server render that the live poller already refreshes, so nothing extra
 * is fetched to notice a new arrival.
 */
export function InboxSound({ unread }: { unread: number }) {
  const [muted, setMuted] = useState(false);
  const previous = useRef<number | null>(null);

  useEffect(() => setMuted(isSupportMuted()), []);

  useEffect(() => {
    if (previous.current !== null && unread > previous.current) {
      playSupportChime("incoming");
    }
    previous.current = unread;
  }, [unread]);

  return (
    <button
      type="button"
      onClick={() => {
        primeSupportSound();
        const next = !muted;
        setMuted(next);
        setSupportMuted(next);
        if (!next) playSupportChime("sent");
      }}
      aria-pressed={muted}
      aria-label={muted ? "Turn new message sound on" : "Turn new message sound off"}
      title={muted ? "New message sound off" : "New message sound on"}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg app-muted transition-colors hover:bg-white/[0.06] hover:text-[var(--app-text)]"
    >
      {muted ? <BellOff size={14} aria-hidden /> : <Bell size={14} aria-hidden />}
    </button>
  );
}
