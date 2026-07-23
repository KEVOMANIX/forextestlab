import { FileClock, ShieldCheck } from "lucide-react";

import {
  AdminPageHeader,
  AdminStat,
  AdminTable,
  adminTd,
  adminTh,
} from "@/components/admin/AdminUI";
import { prisma } from "@/lib/db";
import { formatNewYorkDateTime } from "@/lib/date-time";
import { requireAdmin } from "@/lib/admin";

export default async function AdminAuditPage() {
  await requireAdmin("/admin/audit");
  const [events, total] = await prisma.$transaction([
    prisma.adminAuditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.adminAuditEvent.count(),
  ]);
  return (
    <>
      <AdminPageHeader eyebrow="Security" title="Admin audit log" description="An immutable operational record of privileged changes made through this console." />
      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <AdminStat label="Recorded actions" value={String(total)} detail="Across all administrators" icon={FileClock} />
        <AdminStat label="Retention" value="Persistent" detail="Newest 200 actions shown" icon={ShieldCheck} tone="text-accent-400" />
      </section>
      <section className="panel mt-6 p-4 sm:p-5">
        <AdminTable label="Admin audit events">
          <thead><tr><th className={adminTh}>Action</th><th className={adminTh}>Administrator</th><th className={adminTh}>Target</th><th className={adminTh}>Details</th><th className={adminTh}>Time</th></tr></thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td className={`${adminTd} font-semibold capitalize`}>{event.action.replaceAll(".", " ")}</td>
                <td className={adminTd}><p className="text-xs">{event.actorEmail}</p><p className="mt-1 font-mono text-[10px] app-muted">{event.actorUserId.slice(0, 12)}…</p></td>
                <td className={adminTd}><p className="capitalize">{event.targetType.replaceAll("_", " ")}</p><p className="mt-1 font-mono text-[10px] app-muted">{event.targetId ?? "—"}</p></td>
                <td className={`${adminTd} max-w-sm truncate font-mono text-[10px] app-muted`}>{event.metadataJson ?? "—"}</td>
                <td className={`${adminTd} text-xs app-muted`}>{formatNewYorkDateTime(event.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      </section>
    </>
  );
}
