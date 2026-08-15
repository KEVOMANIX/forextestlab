import { ChevronRight, Tag as TagIcon } from "lucide-react";
import Link from "next/link";

import {
  addConversationTag,
  assignConversation,
  snoozeConversation,
  updateConversation,
} from "@/app/support-team/actions";
import { formatNewYorkDate, formatNewYorkDateTime } from "@/lib/date-time";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
} from "@/lib/support";
import { AutoSubmitSelect, CopyValue } from "./controls";
import { initials } from "./format";

const NOT_AVAILABLE = "Not available";

type Session = {
  id: string;
  symbol: string;
  timeframe: string;
  status: string;
  updatedAt: Date;
};

/**
 * Everything an agent occasionally needs but does not read while typing. The
 * raw context payload is rendered as labelled rows; only genuinely unknown keys
 * fall through to the collapsed section, and never as a JSON dump on open.
 */
export function DetailsPanel({
  conversation,
  customer,
  context,
  agents,
  linkedSession,
  readOnly,
}: {
  conversation: {
    id: string;
    status: string;
    priority: string;
    category: string;
    channel: string;
    createdAt: Date;
    satisfactionScore: number | null;
    customerName: string | null;
    customerEmail: string | null;
    linkedSessionId: string | null;
    assignedAgentId: string | null;
    tags: Array<{ tag: { id: string; name: string } }>;
  };
  customer: {
    email: string;
    displayName: string | null;
    billingPlan: string;
    billingStatus: string;
    createdAt: Date;
    sessions: Session[];
  } | null;
  context: Record<string, unknown> | null;
  agents: Array<{ id: string; displayName: string }>;
  linkedSession: Session | null;
  readOnly: boolean;
}) {
  const name = customer?.displayName || conversation.customerName || "Guest";
  const email = customer?.email || conversation.customerEmail || NOT_AVAILABLE;
  const known = new Set(["page", "browser", "symbol", "timeframe", "sessionId"]);
  const extra = Object.entries(context ?? {}).filter(([key]) => !known.has(key));
  const page = typeof context?.page === "string" ? context.page : "";
  const browser = typeof context?.browser === "string" ? context.browser : "";
  const sessionId =
    conversation.linkedSessionId ||
    (typeof context?.sessionId === "string" ? context.sessionId : "");
  const symbol =
    linkedSession?.symbol ??
    (typeof context?.symbol === "string" ? context.symbol : "");
  const timeframe =
    linkedSession?.timeframe ??
    (typeof context?.timeframe === "string" ? context.timeframe : "");

  return (
    <div className="space-y-7">
      <section>
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/[0.06] text-sm font-semibold">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-[11px] app-muted" title={email}>
              {email}
            </p>
          </div>
        </div>
        <dl className="mt-4 space-y-2.5">
          <Row label="Plan">
            {customer
              ? `${customer.billingPlan} · ${customer.billingStatus}`
              : "Guest (no account)"}
          </Row>
          <Row label="Channel">{conversation.channel || NOT_AVAILABLE}</Row>
          <Row label="Customer since">
            {customer ? formatNewYorkDate(customer.createdAt) : NOT_AVAILABLE}
          </Row>
          <Row label="First contact">
            {formatNewYorkDateTime(conversation.createdAt)}
          </Row>
          <Row label="CSAT">
            {conversation.satisfactionScore
              ? `${conversation.satisfactionScore} / 5`
              : "Not rated"}
          </Row>
        </dl>
      </section>

      <section className="border-t app-border pt-5">
        <Heading>Conversation</Heading>
        {readOnly ? (
          <p className="mt-3 text-[11px] app-muted">
            Your support role is read-only, so these controls are unavailable.
          </p>
        ) : (
          <>
            <form action={updateConversation} className="mt-3 space-y-2.5">
              <input type="hidden" name="conversationId" value={conversation.id} />
              <Labelled label="Status">
                <AutoSubmitSelect
                  name="status"
                  label="Status"
                  defaultValue={conversation.status}
                  options={SUPPORT_STATUSES}
                  className="w-full"
                />
              </Labelled>
              <Labelled label="Priority">
                <AutoSubmitSelect
                  name="priority"
                  label="Priority"
                  defaultValue={conversation.priority}
                  options={SUPPORT_PRIORITIES}
                  className="w-full"
                />
              </Labelled>
              <Labelled label="Category">
                <AutoSubmitSelect
                  name="category"
                  label="Category"
                  defaultValue={conversation.category}
                  options={SUPPORT_CATEGORIES}
                  className="w-full"
                />
              </Labelled>
            </form>
            <form action={assignConversation} className="mt-2.5">
              <input type="hidden" name="conversationId" value={conversation.id} />
              <Labelled label="Assignee">
                <span className="relative flex w-full items-center rounded-lg border app-border bg-[var(--app-panel-2)] px-2.5">
                  <select
                    name="agentId"
                    aria-label="Assignee"
                    defaultValue={conversation.assignedAgentId ?? ""}
                    className="w-full appearance-none bg-transparent py-1.5 text-xs text-[var(--app-text)] focus:outline-none"
                  >
                    <option value="" className="bg-[var(--app-panel-solid)]">
                      Unassigned
                    </option>
                    {agents.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                        className="bg-[var(--app-panel-solid)]"
                      >
                        {item.displayName}
                      </option>
                    ))}
                  </select>
                  <button className="shrink-0 text-[11px] font-semibold text-brand-300">
                    Save
                  </button>
                </span>
              </Labelled>
            </form>
            <form action={snoozeConversation} className="mt-2.5">
              <input type="hidden" name="conversationId" value={conversation.id} />
              <Labelled label="Snooze">
                <span className="flex w-full gap-2">
                  <select
                    name="minutes"
                    aria-label="Snooze duration"
                    className="app-input min-w-0 flex-1 py-1.5 text-xs"
                  >
                    <option value="60">1 hour</option>
                    <option value="240">4 hours</option>
                    <option value="1440">Tomorrow</option>
                    <option value="10080">1 week</option>
                  </select>
                  <button className="rounded-lg border app-border px-3 text-xs app-muted transition-colors hover:text-[var(--app-text)]">
                    Snooze
                  </button>
                </span>
              </Labelled>
            </form>
          </>
        )}
      </section>

      <section className="border-t app-border pt-5">
        <Heading>Tags</Heading>
        {conversation.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {conversation.tags.map(({ tag }) => (
              <span
                key={tag.id}
                className="rounded-full bg-brand-400/10 px-2.5 py-1 text-[11px] text-brand-200"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
        {!readOnly && (
          <form action={addConversationTag} className="mt-3 flex gap-2">
            <input type="hidden" name="conversationId" value={conversation.id} />
            <input
              name="tag"
              required
              maxLength={40}
              placeholder="Add a tag"
              className="app-input min-w-0 flex-1 py-1.5 text-xs"
            />
            <button
              aria-label="Add tag"
              className="rounded-lg border app-border px-3 app-muted transition-colors hover:text-[var(--app-text)]"
            >
              <TagIcon size={13} aria-hidden />
            </button>
          </form>
        )}
        {!conversation.tags.length && readOnly && (
          <p className="mt-3 text-[11px] app-muted">No tags</p>
        )}
      </section>

      <section className="border-t app-border pt-5">
        <Heading>ForexTestLab context</Heading>
        <dl className="mt-3 space-y-2.5">
          <Row label="Current page">
            {page ? <CopyValue value={page} display={shortenUrl(page)} /> : NOT_AVAILABLE}
          </Row>
          <Row label="Session ID">
            {sessionId ? (
              <CopyValue value={sessionId} display={`${sessionId.slice(0, 10)}…`} />
            ) : (
              NOT_AVAILABLE
            )}
          </Row>
          <Row label="Symbol">{symbol || NOT_AVAILABLE}</Row>
          <Row label="Timeframe">{timeframe || NOT_AVAILABLE}</Row>
          <Row label="Session state">
            <span className="capitalize">{linkedSession?.status || NOT_AVAILABLE}</span>
          </Row>
          <Row label="Browser">
            {browser ? (
              <span className="truncate" title={browser}>
                {shortenAgent(browser)}
              </span>
            ) : (
              NOT_AVAILABLE
            )}
          </Row>
        </dl>
        {extra.length > 0 && (
          <details className="group mt-3">
            <summary className="cursor-pointer list-none text-[11px] app-muted transition-colors hover:text-[var(--app-text)]">
              Additional context ({extra.length})
            </summary>
            <dl className="mt-2.5 space-y-2.5">
              {extra.map(([key, value]) => (
                <Row key={key} label={key}>
                  <span className="truncate">{stringify(value)}</span>
                </Row>
              ))}
            </dl>
          </details>
        )}
      </section>

      <section className="border-t app-border pt-5">
        <Heading>Related sessions</Heading>
        {customer?.sessions.length ? (
          <div className="mt-3 space-y-1.5">
            {customer.sessions.map((session) => (
              <Link
                key={session.id}
                href={`/admin/sessions?session=${session.id}`}
                className="flex items-center gap-2 rounded-lg border app-border px-3 py-2 text-[11px] transition-colors hover:border-brand-400/40"
              >
                <span className="min-w-0 flex-1 truncate">
                  {session.symbol} · {session.timeframe}
                </span>
                <span className="shrink-0 capitalize app-muted">{session.status}</span>
                <ChevronRight size={13} aria-hidden className="shrink-0 app-muted" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[11px] app-muted">
            No backtest sessions for this customer.
          </p>
        )}
      </section>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold">{children}</h3>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px]">
      <dt className="shrink-0 app-muted">{label}</dt>
      <dd className="flex min-w-0 justify-end text-right">{children}</dd>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-[11px] app-muted">{label}</span>
      <span className="min-w-0 flex-1 max-w-[190px]">{children}</span>
    </label>
  );
}

function shortenUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || url.hostname;
  } catch {
    return value;
  }
}

/** User agents are unreadable in full; show the recognisable part. */
function shortenAgent(value: string) {
  const browser = /(Firefox|Edg|Chrome|Safari)\/[\d.]+/.exec(value)?.[0] ?? "";
  const platform = /\(([^)]+)\)/.exec(value)?.[1]?.split(";")[0] ?? "";
  const label = [browser.replace("Edg", "Edge"), platform].filter(Boolean).join(" · ");
  return label || value.slice(0, 40);
}

function stringify(value: unknown) {
  if (value === null || value === undefined) return NOT_AVAILABLE;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value).slice(0, 120);
}
