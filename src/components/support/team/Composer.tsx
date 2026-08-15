"use client";

import { BookmarkPlus, MessageSquare, Send, StickyNote, Zap } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  addInternalNote,
  replyToConversation,
  saveReplyTemplate,
} from "@/app/support-team/actions";
import { Modal, PopoverMenu } from "./controls";

type SavedReply = { id: string; title: string; body: string };
type Result = { error: string; sent: number };

/**
 * One composer for both destinations. The mode toggle only decides which
 * existing Server Action receives the form, so replies and internal notes keep
 * their current server behaviour, audit trail and customer notification rules.
 */
export function Composer({
  conversationId,
  customerName,
  savedReplies,
  closed,
}: {
  conversationId: string;
  customerName: string;
  savedReplies: SavedReply[];
  closed: boolean;
}) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [value, setValue] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const note = mode === "note";

  const [state, submit, pending] = useActionState<Result, FormData>(
    async (previous, formData) => {
      try {
        if (String(formData.get("mode")) === "note") await addInternalNote(formData);
        else await replyToConversation(formData);
        return { error: "", sent: previous.sent + 1 };
      } catch (error) {
        return {
          error:
            error instanceof Error && error.message
              ? error.message
              : "That could not be sent. Please try again.",
          sent: previous.sent,
        };
      }
    },
    { error: "", sent: 0 },
  );

  useEffect(() => {
    if (state.sent > 0) setValue("");
  }, [state.sent]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [value]);

  const firstName = customerName.split(/\s+/)[0] || "the customer";

  if (closed) {
    return (
      <div className="shrink-0 border-t app-border px-6 py-5">
        <p className="mx-auto max-w-[800px] rounded-xl border app-border bg-[var(--app-panel-2)] px-4 py-3 text-center text-xs app-muted">
          This conversation is closed. Reopen it from the status control to reply.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="shrink-0 border-t app-border bg-[var(--app-panel)] px-4 py-4 sm:px-6">
        <form
          action={submit}
          className={`mx-auto max-w-[800px] rounded-xl border bg-[var(--app-panel-solid)] transition-colors ${
            note
              ? "border-amber-300/30 focus-within:border-amber-300/60"
              : "app-border focus-within:border-brand-400/60"
          }`}
        >
          <input type="hidden" name="conversationId" value={conversationId} />
          <input type="hidden" name="mode" value={mode} />

          <div className="flex items-center gap-1 border-b app-border px-2 py-1.5">
            <ModeButton
              active={!note}
              onClick={() => setMode("reply")}
              icon={<MessageSquare size={13} aria-hidden />}
              label="Reply"
              tone="brand"
            />
            <ModeButton
              active={note}
              onClick={() => setMode("note")}
              icon={<StickyNote size={13} aria-hidden />}
              label="Internal note"
              tone="amber"
            />
            <div className="ml-auto flex items-center gap-1">
              {savedReplies.length > 0 && (
                <PopoverMenu
                  label="Saved replies"
                  align="right"
                  width="w-72"
                  className="border-transparent"
                  icon={
                    <>
                      <Zap size={13} aria-hidden /> Saved replies
                    </>
                  }
                >
                  <div className="max-h-64 overflow-y-auto">
                    {savedReplies.map((reply) => (
                      <button
                        key={reply.id}
                        type="button"
                        onClick={() => {
                          setValue((current) =>
                            current ? `${current}\n\n${reply.body}` : reply.body,
                          );
                          textareaRef.current?.focus();
                        }}
                        className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.05]"
                      >
                        <span className="block truncate text-xs font-medium">
                          {reply.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] app-muted">
                          {reply.body}
                        </span>
                      </button>
                    ))}
                  </div>
                </PopoverMenu>
              )}
              <button
                type="button"
                onClick={() => setSaveOpen(true)}
                title="Save this text as a reusable reply"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs app-muted transition-colors hover:text-[var(--app-text)]"
              >
                <BookmarkPlus size={13} aria-hidden /> Save reply
              </button>
            </div>
          </div>

          <textarea
            ref={textareaRef}
            name="body"
            required
            maxLength={4_000}
            rows={3}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                if (value.trim()) event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={note ? "Add an internal note…" : `Reply to ${firstName}…`}
            className="w-full resize-none bg-transparent px-4 py-3 text-sm leading-6 text-[var(--app-text)] placeholder:app-muted focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <div className="flex items-center justify-between gap-3 px-3 pb-3">
            <p className="min-w-0 truncate text-[11px] app-muted">
              {state.error ? (
                <span role="alert" className="text-bear">
                  {state.error}
                </span>
              ) : note ? (
                "Only the support team sees internal notes"
              ) : (
                "Ctrl / ⌘ + Enter to send"
              )}
            </p>
            <button
              type="submit"
              disabled={pending || !value.trim()}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-40 ${
                note
                  ? "bg-amber-300 text-surface-950 hover:bg-amber-200"
                  : "bg-brand-500 text-surface-950 hover:bg-brand-400"
              }`}
            >
              {note ? <StickyNote size={14} aria-hidden /> : <Send size={14} aria-hidden />}
              {pending ? "Sending…" : note ? "Save note" : "Send reply"}
            </button>
          </div>
        </form>
      </div>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save a reply template">
        <form
          action={(formData) => {
            void saveReplyTemplate(formData);
            setSaveOpen(false);
          }}
          className="space-y-3"
        >
          <input
            name="title"
            required
            maxLength={100}
            placeholder="Template title"
            className="app-input w-full text-sm"
          />
          <textarea
            name="body"
            required
            maxLength={4_000}
            rows={6}
            defaultValue={value}
            placeholder="Reply text"
            className="app-input w-full resize-none text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSaveOpen(false)}
              className="rounded-lg px-3 py-2 text-xs app-muted hover:text-[var(--app-text)]"
            >
              Cancel
            </button>
            <button className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-semibold text-surface-950 hover:bg-brand-400">
              Save template
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone: "brand" | "amber";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? tone === "amber"
            ? "bg-amber-300/12 text-amber-200"
            : "bg-brand-400/12 text-brand-200"
          : "app-muted hover:text-[var(--app-text)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
