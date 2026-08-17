"use client";

import { Loader2, PenLine, Search, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Modal } from "@/components/support/team/controls";
import {
  searchOutboundRecipients,
  startOutboundConversation,
} from "@/app/support-team/actions";
import { SUPPORT_PRIORITIES } from "@/lib/support-client";

type Recipient = { id: string; email: string; displayName: string | null };

/**
 * Starting a conversation the customer did not.
 *
 * The inbox could only ever react: a thread began with a complaint, and there
 * was no way to tell a customer their session had been restored, or to follow
 * up a bug they reported a week ago. The recipient is chosen from real accounts
 * because that is what makes the message reachable — the widget finds a
 * conversation by the customer's user id.
 */
export function NewConversation() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Recipient[]>([]);
  const [searching, setSearching] = useState(false);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounced, and every response checked against the query that is current by
  // the time it lands: a slow lookup for "sa" must not overwrite the results
  // for "sarah@".
  useEffect(() => {
    if (recipient) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchOutboundRecipients(term)
        .then((found) => {
          if (!cancelled) setResults(found);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, recipient]);

  function reset() {
    setQuery("");
    setResults([]);
    setRecipient(null);
    setSubject("");
    setBody("");
    setPriority("normal");
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function send() {
    if (!recipient || !body.trim()) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("userId", recipient.id);
    form.set("subject", subject);
    form.set("body", body);
    form.set("priority", priority);
    try {
      const result = await startOutboundConversation(form);
      if (!result.ok) {
        setError(result.message ?? "The message could not be sent.");
        setBusy(false);
        return;
      }
      close();
      setBusy(false);
      if (result.conversationId) {
        router.push(`/support-team?conversation=${result.conversationId}`);
      }
      router.refresh();
    } catch {
      setError("The message could not be sent. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          window.setTimeout(() => searchRef.current?.focus(), 50);
        }}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-2.5 text-[11px] font-bold text-surface-950 transition-colors hover:bg-brand-400"
      >
        <PenLine size={13} aria-hidden /> New
      </button>

      <Modal open={open} onClose={close} title="Message a customer">
        {recipient ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--app-panel-2)] px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">
                  {recipient.displayName ?? recipient.email.split("@")[0]}
                </span>
                <span className="block truncate font-mono text-[11px] app-muted">
                  {recipient.email}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setRecipient(null)}
                className="shrink-0 text-[11px] font-semibold text-brand-300 hover:underline"
              >
                Change
              </button>
            </div>

            <label className="block">
              <span className="text-[11px] font-semibold app-muted">Subject</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={160}
                placeholder="Message from support"
                className="mt-1 h-9 w-full rounded-lg border app-border bg-[var(--app-panel-2)] px-3 text-xs outline-none focus-visible:border-brand-400"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold app-muted">Message</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={6}
                maxLength={8000}
                placeholder="Write the message the customer will see in their support panel."
                className="mt-1 w-full resize-y rounded-lg border app-border bg-[var(--app-panel-2)] px-3 py-2 text-xs leading-5 outline-none focus-visible:border-brand-400"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold app-muted">Priority</span>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className="mt-1 h-9 w-full rounded-lg border app-border bg-[var(--app-panel-2)] px-2 text-xs capitalize outline-none focus-visible:border-brand-400"
              >
                {SUPPORT_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            {error && <p className="text-[11px] font-semibold text-bear">{error}</p>}

            <p className="text-[11px] leading-5 app-muted">
              This opens a conversation in the customer&apos;s support panel and
              emails them a notification. It will not appear in the inbox as
              waiting for a reply.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={close}
                className="h-9 rounded-lg px-3 text-xs font-semibold app-muted hover:text-[var(--app-text)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={send}
                disabled={busy || !body.trim()}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-xs font-bold text-surface-950 transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy && <Loader2 size={13} className="animate-spin" aria-hidden />}
                Send message
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label className="block">
              <span className="text-[11px] font-semibold app-muted">
                Who are you contacting?
              </span>
              <span className="relative mt-1 block">
                <Search
                  size={14}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 app-muted"
                />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by name or email"
                  className="h-9 w-full rounded-lg border app-border bg-[var(--app-panel-2)] pl-9 pr-3 text-xs outline-none focus-visible:border-brand-400"
                />
              </span>
            </label>

            <div className="mt-3 min-h-[9rem]">
              {query.trim().length < 2 ? (
                <p className="py-10 text-center text-[11px] app-muted">
                  Type at least two characters to search accounts.
                </p>
              ) : searching ? (
                <p className="flex items-center justify-center gap-2 py-10 text-[11px] app-muted">
                  <Loader2 size={13} className="animate-spin" aria-hidden /> Searching
                </p>
              ) : results.length === 0 ? (
                <p className="py-10 text-center text-[11px] app-muted">
                  No account matches “{query.trim()}”. Only registered accounts can
                  be messaged here.
                </p>
              ) : (
                <ul className="divide-y app-border">
                  {results.map((found) => (
                    <li key={found.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setRecipient(found);
                          setError(null);
                        }}
                        className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-400/15 text-brand-200">
                          <UserRound size={14} aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold">
                            {found.displayName ?? found.email.split("@")[0]}
                          </span>
                          <span className="block truncate font-mono text-[11px] app-muted">
                            {found.email}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
