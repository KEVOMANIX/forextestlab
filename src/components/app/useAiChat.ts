"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatMessage } from "@/lib/ai/analyst-threads";

export type AiScope = "session" | "portfolio";

/** Where a question goes: one session, or every saved session. */
export interface AiTarget {
  scope: AiScope;
  sessionId?: string;
  /** A saved chat; the server then reads its history and saves the answer to it. */
  chatId?: string;
}

/**
 * One streaming conversation with the AI analyst. `ask` takes the target and
 * the history it should answer against, so a caller can start a fresh thread
 * and ask in the same click.
 */
export function useAiChat({ onChunk }: { onChunk?: () => void } = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The question that failed, kept so it can be retried without retyping. */
  const [failed, setFailed] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = useCallback(
    async (question: string, target: AiTarget, history: ChatMessage[]) => {
      const q = question.trim();
      if (!q || abortRef.current) return;
      setError(null);
      setFailed(null);
      setMessages([...history, { role: "user", text: q }, { role: "model", text: "" }]);
      setLoading(true);
      onChunkRef.current?.();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/ai/insights", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...target, question: q, history }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const data = await response.json().catch(() => ({}));
          // Drop both the empty answer and the question: the question comes
          // back on the retry button instead of being stranded in the thread.
          setMessages((prev) => prev.slice(0, -2));
          setError(data?.error || "Something went wrong. Please try again.");
          setFailed(q);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const next = prev.slice();
            next[next.length - 1] = { role: "model", text: acc };
            return next;
          });
          onChunkRef.current?.();
        }
        // A stop pressed before the first token would otherwise leave an empty
        // bubble sitting in the thread.
        if (!acc.trim()) setMessages((prev) => prev.slice(0, -1));
      } catch {
        if (controller.signal.aborted) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            return last && last.role === "model" && !last.text.trim()
              ? prev.slice(0, -1)
              : prev;
          });
        } else {
          setMessages((prev) => prev.slice(0, -2));
          setError("Connection interrupted. Please try again.");
          setFailed(q);
        }
      } finally {
        abortRef.current = null;
        setLoading(false);
      }
    },
    [],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback((next: ChatMessage[] = []) => {
    abortRef.current?.abort();
    setMessages(next);
    setError(null);
    setFailed(null);
  }, []);

  return { messages, setMessages, loading, error, failed, ask, stop, reset };
}
