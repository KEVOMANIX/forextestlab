import { MessagesSquare, Paperclip } from "lucide-react";

import { ScrollToLatest } from "@/components/support/ScrollToLatest";
import { formatNewYorkDateTime } from "@/lib/date-time";
import { EmailHtmlFrame } from "./EmailHtmlFrame";
import { cleanMessageBody, formatBytes, initials, shortAgo } from "./format";

/** Plain text with web links made clickable. */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>\]\[)"']+)/g);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all text-sky-300 underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

function hasEmailHtml(metadataJson: string | null) {
  try {
    return Boolean((JSON.parse(metadataJson ?? "{}") as { resendEmailId?: unknown }).resendEmailId);
  } catch {
    return false;
  }
}

export type ThreadMessage = {
  id: string;
  senderType: string;
  senderName: string;
  visibility: string;
  body: string;
  createdAt: Date;
  deletedAt: Date | null;
  metadataJson: string | null;
  attachments: Array<{ id: string; fileName: string; size: number }>;
};

export function MessageThread({
  conversationId,
  subject,
  customerEmail,
  messages,
  now,
}: {
  conversationId: string;
  subject?: string;
  customerEmail?: string | null;
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

  // Gmail-style: every message is a full-width row; older ones fold to a
  // one-line preview and the newest stays open. Clicking a row toggles it.
  const lastIndex = messages.length - 1;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col">
        {subject && (
          <h1 className="px-3 pb-4 pt-5 text-xl font-normal sm:pl-[68px] sm:text-[22px]">{subject}</h1>
        )}
        {messages.map((message, index) => {
          const internal = message.visibility === "internal";
          const fromCustomer = message.senderType === "customer";
          const system = message.senderType === "system";
          const name = internal ? `Internal note · ${message.senderName}` : message.senderName;
          const avatarTone = internal
            ? "bg-amber-400 text-surface-950"
            : fromCustomer
              ? "bg-[#c0502b] text-white"
              : system
                ? "bg-slate-500 text-white"
                : "bg-brand-500 text-surface-950";
          const body = message.deletedAt ? "This message was deleted." : cleanMessageBody(message.body);
          const showEmail =
            fromCustomer && customerEmail && message.senderName !== customerEmail;
          const text = (
            <p
              className={`whitespace-pre-wrap break-words text-[14px] leading-6 ${
                message.deletedAt ? "italic app-muted" : ""
              }`}
            >
              <Linked text={body} />
            </p>
          );
          return (
            <div key={message.id}>
            {index === lastIndex && (
              <ScrollToLatest marker={`${conversationId}:${messages.length}`} block="start" />
            )}
            <details
              open={index === lastIndex || undefined}
              className={`group border-b app-border ${
                internal ? "rounded-lg border-l-[3px] border-l-amber-300/70 bg-amber-300/[0.06]" : ""
              }`}
            >
              <summary className="flex cursor-pointer list-none items-start gap-3 px-3 py-3 [&::-webkit-details-marker]:hidden">
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${avatarTone}`}
                >
                  {initials(message.senderName || "?")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-3">
                    <span className="min-w-0 truncate">
                      <strong className={`text-sm font-semibold ${internal ? "text-amber-200" : ""}`}>
                        {name}
                      </strong>
                      {showEmail && (
                        <span className="ml-1.5 text-xs app-muted">&lt;{customerEmail}&gt;</span>
                      )}
                    </span>
                    <span className="ml-auto shrink-0 text-xs app-muted">
                      {formatNewYorkDateTime(message.createdAt)}
                      <span className="hidden sm:inline"> ({shortAgo(message.createdAt, now)} ago)</span>
                    </span>
                  </span>
                  <span className="block truncate text-[13px] app-muted group-open:hidden">
                    {body.replace(/\s+/g, " ")}
                  </span>
                  <span className="hidden text-xs app-muted group-open:block">
                    {internal ? "Only the support team can see this" : fromCustomer ? "to support" : "to customer"}
                  </span>
                </span>
              </summary>
              <div className="pb-5 pl-3 pr-4 sm:pl-[68px]">
                {fromCustomer && !message.deletedAt && hasEmailHtml(message.metadataJson) ? (
                  <EmailHtmlFrame messageId={message.id}>{text}</EmailHtmlFrame>
                ) : (
                  text
                )}
                {!message.deletedAt &&
                  message.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={`/api/support/attachments/${attachment.id}`}
                      className="mt-3 flex max-w-sm items-center gap-2 rounded-lg border app-border px-3 py-2 text-[12px] transition-colors hover:border-brand-400/40"
                    >
                      <Paperclip size={13} aria-hidden className="shrink-0 app-muted" />
                      <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
                      <span className="shrink-0 app-muted">{formatBytes(attachment.size)}</span>
                    </a>
                  ))}
              </div>
            </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
