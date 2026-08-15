"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Role = "customer" | "agent";
type Presence = { actorId: string; name: string; role: Role };

type RealtimeOptions = {
  authHeaders?: Record<string, string>;
  conversationId: string;
  enabled?: boolean;
  onConversationChange?: (conversationId: string) => void;
  role: Role;
  visitorId?: string;
};

const RETRY_MS = 2_000;
const TYPING_THROTTLE_MS = 1_000;
const LOCAL_STOP_MS = 2_500;

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

/**
 * One authenticated, ephemeral stream carries typing presence and database
 * invalidation hints. Typing heartbeats use a short-lived in-memory capability,
 * so keystrokes never query or write Supabase.
 */
export function useSupportRealtime({
  authHeaders = {},
  conversationId,
  enabled = true,
  onConversationChange,
  role,
  visitorId = "",
}: RealtimeOptions) {
  const [participants, setParticipants] = useState<Presence[]>([]);
  const capabilityRef = useRef("");
  const lastPulseRef = useRef(0);
  const stopTimerRef = useRef<number | null>(null);
  const changeRef = useRef(onConversationChange);
  changeRef.current = onConversationChange;
  const authKey = JSON.stringify(
    Object.entries(authHeaders).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );

  const sendTyping = useCallback(async (typing: boolean) => {
    const token = capabilityRef.current;
    if (!token) return;
    try {
      await fetch("/api/support/realtime", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-support-realtime-token": token,
        },
        body: JSON.stringify({ action: "typing", typing }),
        cache: "no-store",
        keepalive: !typing,
      });
    } catch {
      // Presence is best effort. Message submission remains authoritative.
    }
  }, []);

  const stop = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    lastPulseRef.current = 0;
    void sendTyping(false);
  }, [sendTyping]);

  const pulse = useCallback(() => {
    const now = Date.now();
    if (now - lastPulseRef.current >= TYPING_THROTTLE_MS) {
      lastPulseRef.current = now;
      void sendTyping(true);
    }
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
    }
    stopTimerRef.current = window.setTimeout(stop, LOCAL_STOP_MS);
  }, [sendTyping, stop]);

  useEffect(() => {
    if (!enabled || !conversationId) {
      capabilityRef.current = "";
      setParticipants([]);
      return;
    }
    let active = true;
    const abort = new AbortController();
    const headers = Object.fromEntries(
      JSON.parse(authKey) as Array<[string, string]>,
    );

    const connect = async () => {
      while (active) {
        try {
          const sessionResponse = await fetch("/api/support/realtime", {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "connect",
              conversationId,
              role,
              visitorId,
            }),
            cache: "no-store",
            signal: abort.signal,
          });
          if (!sessionResponse.ok) throw new Error("Realtime unavailable");
          const session = (await sessionResponse.json()) as { token?: string };
          if (!session.token) throw new Error("Realtime unavailable");
          capabilityRef.current = session.token;

          const streamResponse = await fetch("/api/support/realtime", {
            headers: { "x-support-realtime-token": session.token },
            cache: "no-store",
            signal: abort.signal,
          });
          if (!streamResponse.ok || !streamResponse.body) {
            throw new Error("Realtime unavailable");
          }
          const reader = streamResponse.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (active) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replaceAll("\r", "");
            let boundary = buffer.indexOf("\n\n");
            while (boundary >= 0) {
              const block = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              let eventName = "message";
              const data: string[] = [];
              for (const line of block.split("\n")) {
                if (line.startsWith("event:")) eventName = line.slice(6).trim();
                if (line.startsWith("data:")) data.push(line.slice(5).trim());
              }
              if (data.length) {
                const payload = JSON.parse(data.join("\n")) as {
                  conversationId?: string;
                  participants?: Presence[];
                };
                if (eventName === "presence") {
                  setParticipants(payload.participants ?? []);
                } else if (
                  eventName === "conversation" &&
                  payload.conversationId
                ) {
                  changeRef.current?.(payload.conversationId);
                }
              }
              boundary = buffer.indexOf("\n\n");
            }
          }
        } catch (error) {
          if (!active || abort.signal.aborted) return;
          console.debug("Support realtime reconnecting", error);
        }
        capabilityRef.current = "";
        setParticipants([]);
        await wait(RETRY_MS);
      }
    };

    void connect();
    return () => {
      active = false;
      stop();
      capabilityRef.current = "";
      abort.abort();
      setParticipants([]);
    };
  }, [authKey, conversationId, enabled, role, stop, visitorId]);

  return { participants, pulse, stop };
}

export function TypingIndicator({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] app-muted">
      <span>{name} is typing</span>
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1 w-1 animate-typing-dot rounded-full bg-brand-300 motion-reduce:animate-none"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </span>
    </span>
  );
}
