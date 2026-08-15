import { ArrowLeft, CheckCircle2, Download, MoreHorizontal, UserPlus } from "lucide-react";
import Link from "next/link";

import { assignConversation, snoozeConversation, updateConversation } from "@/app/support-team/actions";
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES } from "@/lib/support";
import { AutoSubmitSelect, DetailsDrawer, PopoverMenu } from "./controls";
import { initials, priorityTone, statusTone } from "./format";

export function ConversationHeader({
  conversation,
  agentId,
  backHref,
  readOnly,
  details,
}: {
  conversation: {
    id: string;
    subject: string;
    status: string;
    priority: string;
    category: string;
    channel: string;
    customerName: string | null;
    customerEmail: string | null;
    assignedAgentId: string | null;
    assignedAgentName: string | null;
  };
  agentId: string;
  backHref: string;
  readOnly: boolean;
  details: React.ReactNode;
}) {
  const tone = statusTone(conversation.status);
  // Replies are refused while a colleague owns the conversation, so the way
  // out of that refusal belongs next to their name.
  const heldByOther =
    !!conversation.assignedAgentId && conversation.assignedAgentId !== agentId;
  const finished =
    conversation.status === "resolved" || conversation.status === "closed";
  const meta = [
    conversation.customerName,
    conversation.customerEmail,
    conversation.category.replaceAll("_", " "),
    conversation.channel,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <header className="flex h-[68px] shrink-0 items-center gap-3 border-b app-border bg-[var(--app-panel)] px-4 sm:px-5">
      <Link
        href={backHref}
        aria-label="Back to inbox"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg app-muted transition-colors hover:bg-white/[0.06] hover:text-[var(--app-text)] lg:hidden"
      >
        <ArrowLeft size={16} aria-hidden />
      </Link>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold">{conversation.subject}</h1>
        <p className="mt-0.5 truncate text-[11px] app-muted" title={meta}>
          {meta}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {conversation.assignedAgentName ? (
          <span
            className={`hidden items-center gap-2 rounded-lg border px-2.5 py-1.5 xl:inline-flex ${
              heldByOther ? "border-amber-300/30" : "app-border"
            }`}
            title={`Assigned to ${conversation.assignedAgentName}`}
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-400/15 text-[10px] font-semibold text-brand-200">
              {initials(conversation.assignedAgentName)}
            </span>
            <span className="max-w-[110px] truncate text-xs app-muted">
              {conversation.assignedAgentName}
            </span>
          </span>
        ) : (
          !readOnly && (
            <form action={assignConversation}>
              <input type="hidden" name="conversationId" value={conversation.id} />
              <input type="hidden" name="agentId" value="self" />
              <button className="inline-flex items-center gap-1.5 rounded-lg border app-border px-2.5 py-1.5 text-xs font-medium app-muted transition-colors hover:text-[var(--app-text)]">
                <UserPlus size={13} aria-hidden /> Join
              </button>
            </form>
          )
        )}

        {heldByOther && !readOnly && (
          <form action={assignConversation}>
            <input type="hidden" name="conversationId" value={conversation.id} />
            <input type="hidden" name="agentId" value="self" />
            <button
              title={`Reassign this conversation from ${conversation.assignedAgentName} to you`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/30 px-2.5 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-300/10"
            >
              <UserPlus size={13} aria-hidden /> Take over
            </button>
          </form>
        )}

        {!readOnly && (
          <form action={updateConversation} className="hidden xl:block">
            <input type="hidden" name="conversationId" value={conversation.id} />
            <AutoSubmitSelect
              name="status"
              label="Status"
              defaultValue={conversation.status}
              options={SUPPORT_STATUSES}
              dot={tone.dot}
            />
          </form>
        )}

        {!readOnly && (
          <form action={updateConversation} className="hidden xl:block">
            <input type="hidden" name="conversationId" value={conversation.id} />
            <AutoSubmitSelect
              name="priority"
              label="Priority"
              defaultValue={conversation.priority}
              options={SUPPORT_PRIORITIES}
              className={priorityTone(conversation.priority)}
            />
          </form>
        )}

        {!readOnly && !finished && (
          <form action={updateConversation}>
            <input type="hidden" name="conversationId" value={conversation.id} />
            <input type="hidden" name="status" value="resolved" />
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-surface-950 transition-colors hover:bg-brand-400">
              <CheckCircle2 size={14} aria-hidden /> Resolve
            </button>
          </form>
        )}

        <PopoverMenu
          label="More actions"
          align="right"
          width="w-56"
          icon={<MoreHorizontal size={15} aria-hidden />}
        >
          <a
            href={`/api/support/export?conversationId=${conversation.id}`}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-white/[0.05]"
          >
            <Download size={13} aria-hidden /> Export transcript
          </a>
          {!readOnly && (
            <>
              <form action={snoozeConversation}>
                <input type="hidden" name="conversationId" value={conversation.id} />
                <p className="mt-1 px-2.5 pb-1 pt-2 text-[11px] app-muted">Snooze until</p>
                {[
                  ["60", "In 1 hour"],
                  ["240", "In 4 hours"],
                  ["1440", "Tomorrow"],
                  ["10080", "Next week"],
                ].map(([minutes, label]) => (
                  <button
                    key={minutes}
                    name="minutes"
                    value={minutes}
                    className="block w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-white/[0.05]"
                  >
                    {label}
                  </button>
                ))}
              </form>
              <form action={updateConversation} className="mt-1 border-t app-border pt-1">
                <input type="hidden" name="conversationId" value={conversation.id} />
                <button
                  name="status"
                  value={finished ? "open" : "closed"}
                  className="block w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-white/[0.05]"
                >
                  {finished ? "Reopen conversation" : "Close conversation"}
                </button>
              </form>
            </>
          )}
        </PopoverMenu>

        <DetailsDrawer title="Conversation details">{details}</DetailsDrawer>
      </div>
    </header>
  );
}
