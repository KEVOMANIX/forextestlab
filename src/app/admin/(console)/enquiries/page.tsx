import { Mail, MessageSquareText } from "lucide-react";

import { replyToSupportConversation, resolveSupportConversation, updateEnquiryStatus } from "@/app/admin/actions";
import { AdminPageHeader, AdminStat, AdminStatus } from "@/components/admin/AdminUI";
import { prisma } from "@/lib/db";
import { formatNewYorkDateTime } from "@/lib/date-time";
import { requireAdmin } from "@/lib/admin";

export default async function AdminEnquiriesPage() {
  await requireAdmin("/admin/enquiries");
  const [messages, open, resolved, liveChats] = await prisma.$transaction([
    prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.contactMessage.count({ where: { status: { not: "resolved" } } }),
    prisma.contactMessage.count({ where: { status: "resolved" } }),
    prisma.supportConversation.findMany({ where: { status: { not: "resolved" } }, include: { messages: { orderBy: { createdAt: "asc" } } }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  return (
    <>
      <AdminPageHeader eyebrow="Support" title="Contact enquiries" description="Messages submitted through the public contact form are retained here alongside their email-delivery state." />
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <AdminStat label="Open" value={String(open)} detail="Awaiting or in progress" icon={Mail} tone={open ? "text-amber-300" : "text-brand-300"} />
        <AdminStat label="Resolved" value={String(resolved)} detail="Completed enquiries" icon={MessageSquareText} />
        <AdminStat label="Total retained" value={String(messages.length)} detail="Latest 100 submissions" icon={MessageSquareText} tone="text-accent-400" />
      </section>
      <section className="mt-10">
        <AdminPageHeader eyebrow="Live support" title="Active conversations" description="Join a customer conversation, send a reply, or resolve the chat when the issue is handled." />
        <div className="mt-5 space-y-4">
          {liveChats.length ? liveChats.map((chat) => (
            <article key={chat.id} className="panel p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><AdminStatus value={chat.status} /><h2 className="mt-2 text-lg font-semibold">{chat.customerName || "Customer"}</h2><p className="text-xs app-muted">{chat.customerEmail || "Guest visitor"} · {formatNewYorkDateTime(chat.updatedAt)}</p></div><span className="text-xs text-brand-300">{chat.assignedAgentName ? `${chat.assignedAgentName} joined` : "Waiting for an agent"}</span></div>
              <div className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-xl bg-[var(--app-panel-2)]/65 p-3">{chat.messages.map((item) => <div key={item.id} className={`rounded-lg px-3 py-2 text-sm ${item.senderType === "agent" ? "ml-5 border border-brand-400/20 bg-brand-400/10" : "mr-5 bg-surface-900/70"}`}><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{item.senderName}</p><p className="whitespace-pre-wrap leading-5">{item.body}</p></div>)}</div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row"><form action={replyToSupportConversation} className="flex min-w-0 flex-1 gap-2"><input type="hidden" name="conversationId" value={chat.id} /><input name="body" required maxLength={2000} placeholder="Reply as support…" className="app-input min-w-0 flex-1 py-2 text-sm" /><button className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-surface-950">Send</button></form><form action={resolveSupportConversation}><input type="hidden" name="conversationId" value={chat.id} /><button className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-brand-400/30">Resolve</button></form></div>
            </article>
          )) : <div className="panel px-5 py-10 text-center text-sm app-muted">No active live chats.</div>}
        </div>
      </section>
      <section className="mt-6 space-y-3">
        {messages.length ? messages.map((message) => (
          <article key={message.id} className="panel p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><AdminStatus value={message.status} /><AdminStatus value={message.deliveryStatus} /></div>
                <h2 className="mt-3 text-lg font-semibold">{message.subject}</h2>
                <p className="mt-1 text-xs app-muted">{message.name} · <a href={`mailto:${message.email}`} className="text-brand-300">{message.email}</a> · {formatNewYorkDateTime(message.createdAt)}</p>
              </div>
              <form action={updateEnquiryStatus} className="flex shrink-0 gap-2">
                <input type="hidden" name="enquiryId" value={message.id} />
                <select name="status" defaultValue={message.status} className="app-input py-2 text-xs"><option value="open">Open</option><option value="in-progress">In progress</option><option value="resolved">Resolved</option></select>
                <button className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-surface-950">Save</button>
              </form>
            </div>
            <p className="mt-5 whitespace-pre-wrap rounded-xl bg-[var(--app-panel-2)]/65 p-4 text-sm leading-6">{message.message}</p>
          </article>
        )) : <div className="panel px-5 py-16 text-center"><Mail size={24} className="mx-auto text-brand-300" aria-hidden /><h2 className="mt-4 font-semibold">No enquiries recorded yet</h2><p className="mt-2 text-sm app-muted">New contact-form submissions will appear here.</p></div>}
      </section>
    </>
  );
}
