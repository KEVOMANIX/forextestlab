import { MessagesSquare, Paperclip } from "lucide-react";

import { ScrollToLatest } from "@/components/support/ScrollToLatest";
import { formatNewYorkDateTime } from "@/lib/date-time";
import { dayKey, formatBytes } from "./format";

export type ThreadMessage = {
  id: string;
  senderType: string;
  senderName: string;
  visibility: string;
  body: string;
  createdAt: Date;
  deletedAt: Date | null;
  attachments: Array<{ id: string; fileName: string; size: number }>;
};

const GROUP_WINDOW_MS = 5 * 60_000;

function dayLabel(value: Date, now: number) {
  const today = new Date(now);
  const days = Math.round(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())) /
      86_400_000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return value.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: days > 300 ? "numeric" : undefined,
  });
}

export function MessageThread({
  conversationId,
  messages,
  now,
}: {
  conversationId: string;
  messages: ThreadMessage[];
  now: number;
}) {
  if (!messages.length) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
        <div>
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/[0.05]">
            <MessagesSquare size={20} aria-hidden className="app-muted" />
          </span>
          <p className="mt-3 text-sm font-medium">No messages in this conversation</p>
          <p className="mt-1 text-xs app-muted">
            Nothing has been sent yet. Your reply below will start the thread.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-[800px] flex-col gap-1">
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const newDay =
            !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
          const internal = message.visibility === "internal";
          const fromCustomer = message.senderType === "customer";
          // Consecutive messages from the same voice read as one turn, so only
          // the first of a run carries the name and timestamp.
          const grouped =
            !newDay &&
            !!previous &&
            previous.senderType === message.senderType &&
            (previous.visibility === "internal") === internal &&
            message.createdAt.getTime() - previous.createdAt.getTime() <
              GROUP_WINDOW_MS;

          return (
            <div key={message.id}>
              {newDay && (
                <div className="my-5 flex items-center gap-3 first:mt-0">
                  <span className="h-px flex-1 bg-[var(--app-border)]" />
                  <span className="text-[11px] app-muted">
                    {dayLabel(message.createdAt, now)}
                  </span>
                  <span className="h-px flex-1 bg-[var(--app-border)]" />
                </div>
              )}
              <div
                className={`flex ${grouped ? "mt-1" : "mt-4"} ${
                  internal ? "justify-center" : fromCustomer ? "justify-start" : "justify-end"
                }`}
              >
                <article
                  className={`rounded-[13px] px-4 py-3 ${
                    internal
                      ? "w-full border border-amber-300/25 bg-amber-300/[0.07]"
                      : fromCustomer
                        ? "max-w-[68%] border app-border bg-[var(--app-panel-solid)]"
                        : "max-w-[68%] border border-brand-400/25 bg-brand-500/[0.12]"
                  }`}
                >
                  {!grouped && (
                    <div className="mb-1.5 flex items-baseline justify-between gap-4">
                      <strong
                        className={`text-[11px] font-semibold ${
                          internal
                            ? "text-amber-200"
                            : fromCustomer
                              ? "app-muted"
                              : "text-brand-200"
                        }`}
                      >
                        {internal
                          ? `Internal note · ${message.senderName}`
                          : message.senderName}
                      </strong>
                      <span className="shrink-0 text-[11px] app-muted">
                        {formatNewYorkDateTime(message.createdAt)}
                      </span>
                    </div>
                  )}
                  <p
                    className={`whitespace-pre-wrap break-words text-sm leading-[1.55] ${
                      message.deletedAt ? "italic app-muted" : ""
                    }`}
                  >
                    {message.deletedAt ? "This message was deleted." : message.body}
                  </p>
                  {!message.deletedAt &&
                    message.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={`/api/support/attachments/${attachment.id}`}
                        className="mt-2 flex items-center gap-2 rounded-lg border app-border px-3 py-2 text-[11px] transition-colors hover:border-brand-400/40"
                      >
                        <Paperclip size={12} aria-hidden className="shrink-0 app-muted" />
                        <span className="min-w-0 flex-1 truncate">
                          {attachment.fileName}
                        </span>
                        <span className="shrink-0 app-muted">
                          {formatBytes(attachment.size)}
                        </span>
                      </a>
                    ))}
                </article>
              </div>
            </div>
          );
        })}
        <ScrollToLatest marker={`${conversationId}:${messages.length}`} />
      </div>
    </div>
  );
}
