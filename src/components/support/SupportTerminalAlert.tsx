"use client";

import { ArrowUpRight, Headset, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { existingSupportVisitorId, type SupportChatSummary } from "@/lib/support-client";
import { playSupportChime } from "@/lib/support-sound";

/**
 * The backtester owns the whole viewport and hides the floating launcher, so a
 * trader mid-replay would never learn that support had picked their question
 * up. This is the one thing worth interrupting a chart for: an agent joining,
 * or a reply landing. It stays quiet otherwise and disappears when dismissed.
 *
 * Polling is slow and conditional — one lookup on mount, and the interval only
 * starts for people who actually have a support conversation.
 */
const VISIBLE_POLL_MS = 30_000;
const HIDDEN_POLL_MS = 90_000;

type Alert = { kind: "joined" | "reply"; agent: string; preview: string };

export function SupportTerminalAlert() {
  const [alert, setAlert] = useState<Alert | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const seenUnread = useRef<number | null>(null);
  const seenAgents = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer = 0;

    const check = async () => {
      const visitorId = existingSupportVisitorId();
      const response = await fetch(
        `/api/support/chat?list=1${visitorId ? `&visitorId=${encodeURIComponent(visitorId)}` : ""}`,
        { cache: "no-store" },
      );
      if (!response.ok || stopped) return false;
      const payload = (await response.json()) as {
        conversations?: (SupportChatSummary & { assignedAgentName?: string | null })[];
      };
      const conversations = payload.conversations ?? [];
      if (stopped) return conversations.length > 0;

      const unread = conversations.reduce(
        (total, item) => total + item.customerUnreadCount,
        0,
      );
      const agents = new Map(
        conversations.map((item) => [item.id, item.assignedAgentName ?? ""]),
      );

      if (seenAgents.current) {
        for (const [id, agent] of agents) {
          const before = seenAgents.current.get(id);
          if (agent && before !== undefined && before !== agent) {
            setDismissed(false);
            setAlert({ kind: "joined", agent, preview: "" });
            playSupportChime("incoming");
          }
        }
      }
      if (seenUnread.current !== null && unread > seenUnread.current) {
        const latest = conversations.find((item) => item.customerUnreadCount > 0);
        setDismissed(false);
        setAlert({
          kind: "reply",
          agent: latest?.assignedAgentName || "Support",
          preview: latest?.messages[0]?.body?.slice(0, 90) ?? "",
        });
        playSupportChime("incoming");
      }
      seenAgents.current = agents;
      seenUnread.current = unread;
      return conversations.length > 0;
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => {
          void check().then((keepGoing) => {
            if (keepGoing && !stopped) schedule();
          });
        },
        document.visibilityState === "visible" ? VISIBLE_POLL_MS : HIDDEN_POLL_MS,
      );
    };

    // Nothing to watch, nothing to poll: a trader who has never contacted
    // support pays for exactly one request.
    void check().then((hasConversations) => {
      if (hasConversations && !stopped) schedule();
    });
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!alert || dismissed) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-14 z-[92] flex justify-end">
      <div className="pointer-events-auto flex w-[min(20rem,calc(100vw-1.5rem))] animate-fade-up items-start gap-3 rounded-xl border border-brand-400/25 bg-[var(--app-panel-solid)] p-3 shadow-2xl shadow-black/50 motion-reduce:animate-none">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-400/15 text-brand-200">
          <Headset size={15} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">
            {alert.kind === "joined"
              ? `${alert.agent} joined your support chat`
              : `New reply from ${alert.agent}`}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] app-muted">
            {alert.preview || "They are looking at your question now."}
          </p>
          <Link
            href="/app/support"
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-300 hover:text-brand-200"
          >
            Open support <ArrowUpRight size={12} aria-hidden />
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss support alert"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md app-muted transition-colors hover:bg-white/[0.06] hover:text-[var(--app-text)]"
        >
          <X size={13} aria-hidden />
        </button>
      </div>
    </div>
  );
}
