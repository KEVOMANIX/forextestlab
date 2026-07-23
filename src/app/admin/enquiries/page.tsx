import { Mail, MessageSquareText } from "lucide-react";

import { updateEnquiryStatus } from "@/app/admin/actions";
import { AdminPageHeader, AdminStat, AdminStatus } from "@/components/admin/AdminUI";
import { prisma } from "@/lib/db";
import { formatNewYorkDateTime } from "@/lib/date-time";
import { requireAdmin } from "@/lib/admin";

export default async function AdminEnquiriesPage() {
  await requireAdmin("/admin/enquiries");
  const [messages, open, resolved] = await prisma.$transaction([
    prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.contactMessage.count({ where: { status: { not: "resolved" } } }),
    prisma.contactMessage.count({ where: { status: "resolved" } }),
  ]);
  return (
    <>
      <AdminPageHeader eyebrow="Support" title="Contact enquiries" description="Messages submitted through the public contact form are retained here alongside their email-delivery state." />
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <AdminStat label="Open" value={String(open)} detail="Awaiting or in progress" icon={Mail} tone={open ? "text-amber-300" : "text-brand-300"} />
        <AdminStat label="Resolved" value={String(resolved)} detail="Completed enquiries" icon={MessageSquareText} />
        <AdminStat label="Total retained" value={String(messages.length)} detail="Latest 100 submissions" icon={MessageSquareText} tone="text-accent-400" />
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
