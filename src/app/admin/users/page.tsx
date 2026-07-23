import { Search, ShieldPlus } from "lucide-react";

import {
  AdminPageHeader,
  AdminStatus,
  AdminTable,
  adminTd,
  adminTh,
} from "@/components/admin/AdminUI";
import { grantManualAccess, revokeManualAccess } from "@/app/admin/actions";
import { prisma } from "@/lib/db";
import { formatNewYorkDateTime } from "@/lib/date-time";
import { requireAdmin } from "@/lib/admin";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  await requireAdmin("/admin/users");
  const q = searchParams.q?.trim().slice(0, 120) ?? "";
  const users = await prisma.userProfile.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { displayName: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      _count: { select: { sessions: true, billingSubscriptions: true, billingPayments: true } },
    },
  });

  return (
    <>
      <AdminPageHeader
        eyebrow="Accounts"
        title="Users"
        description="Inspect account activity and grant time-limited manual access without changing a Paddle subscription."
      >
        <form className="relative w-full sm:w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 app-muted" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Search name or email" className="app-input w-full pl-9" />
        </form>
      </AdminPageHeader>

      <section className="panel mt-6 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-semibold">{users.length} account{users.length === 1 ? "" : "s"} shown</p>
          <p className="text-xs app-muted">Newest first · maximum 100</p>
        </div>
        <AdminTable label="User accounts">
          <thead><tr><th className={adminTh}>User</th><th className={adminTh}>Billing</th><th className={adminTh}>Activity</th><th className={adminTh}>Manual access</th><th className={adminTh}>Joined</th></tr></thead>
          <tbody>
            {users.map((profile) => (
              <tr key={profile.id}>
                <td className={adminTd}><p className="font-semibold">{profile.displayName || "Unnamed user"}</p><p className="mt-1 text-xs app-muted">{profile.email}</p><p className="mt-1 font-mono text-[10px] app-muted">{profile.id.slice(0, 12)}…</p></td>
                <td className={adminTd}><AdminStatus value={profile.billingStatus} /><p className="mt-2 text-xs capitalize app-muted">{profile.billingPlan}</p></td>
                <td className={adminTd}><p>{profile._count.sessions} sessions</p><p className="mt-1 text-xs app-muted">{profile._count.billingSubscriptions} subscriptions · {profile._count.billingPayments} payments</p></td>
                <td className={adminTd}>
                  <p className="mb-2 text-xs app-muted">{profile.proAccessUntil ? `Until ${formatNewYorkDateTime(profile.proAccessUntil)}` : "No manual grant"}</p>
                  <div className="flex flex-wrap gap-2">
                    <form action={grantManualAccess} className="flex gap-1.5">
                      <input type="hidden" name="userId" value={profile.id} />
                      <select name="days" className="app-input py-1.5 text-xs"><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select>
                      <button className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-surface-950"><ShieldPlus size={13} aria-hidden /> Grant</button>
                    </form>
                    {profile.proAccessUntil && <form action={revokeManualAccess}><input type="hidden" name="userId" value={profile.id} /><button className="rounded-lg border border-bear/25 px-2.5 py-1.5 text-xs font-semibold text-bear">Revoke grant</button></form>}
                  </div>
                </td>
                <td className={`${adminTd} text-xs app-muted`}>{formatNewYorkDateTime(profile.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      </section>
    </>
  );
}
