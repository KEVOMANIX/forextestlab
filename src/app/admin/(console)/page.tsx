import {
  Activity,
  AlertTriangle,
  Database,
  Mail,
  ReceiptText,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";

import {
  AdminPageHeader,
  AdminStat,
  AdminStatus,
  AdminTable,
  adminTd,
  adminTh,
} from "@/components/admin/AdminUI";
import { prisma } from "@/lib/db";
import { formatNewYorkDateTime } from "@/lib/date-time";
import { requireAdmin } from "@/lib/admin";

export default async function AdminOverviewPage() {
  await requireAdmin("/admin");
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [
    users,
    newUsers,
    activeSubscriptions,
    sessions,
    recentSessions,
    trades,
    openEnquiries,
    failedImports,
    recentUsers,
    latestActivity,
  ] = await prisma.$transaction([
    prisma.userProfile.count(),
    prisma.userProfile.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.billingSubscription.count({
      where: { status: { in: ["active", "trialing", "past_due"] } },
    }),
    prisma.backtestSession.count({ where: { anonymous: false } }),
    prisma.backtestSession.count({
      where: { anonymous: false, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.simulatedTrade.count(),
    prisma.contactMessage.count({ where: { status: { not: "resolved" } } }),
    prisma.dataImport.count({ where: { status: { not: "completed" } } }),
    prisma.userProfile.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        _count: { select: { sessions: true, billingSubscriptions: true } },
      },
    }),
    prisma.adminAuditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const stats = [
    { label: "Registered users", value: String(users), detail: `${newUsers} joined in the last 30 days`, icon: Users },
    { label: "Active subscriptions", value: String(activeSubscriptions), detail: "Across all billing plans", icon: ReceiptText, tone: "text-accent-400" },
    { label: "Saved sessions", value: String(sessions), detail: `${recentSessions} created in the last 30 days`, icon: Activity },
    { label: "Executed trades", value: String(trades), detail: "Closed simulated positions", icon: TrendingUp, tone: "text-amber-300" },
    { label: "Open enquiries", value: String(openEnquiries), detail: "Awaiting support follow-up", icon: Mail, tone: openEnquiries ? "text-amber-300" : "text-brand-300" },
    { label: "Data alerts", value: String(failedImports), detail: "Imports requiring review", icon: failedImports ? AlertTriangle : Database, tone: failedImports ? "text-bear" : "text-brand-300" },
  ];

  return (
    <>
      <AdminPageHeader
        eyebrow="Operations"
        title="Platform overview"
        description="A live view of account growth, billing, backtesting activity, support demand, and data operations."
      />

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => <AdminStat key={stat.label} {...stat} />)}
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <article className="panel p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">Accounts</p>
              <h2 className="mt-2 text-xl font-semibold">Recently joined</h2>
            </div>
            <Link href="/admin/users" className="text-xs font-semibold text-brand-300">View all users</Link>
          </div>
          <AdminTable label="Recently joined users">
            <thead><tr><th className={adminTh}>User</th><th className={adminTh}>Access</th><th className={adminTh}>Sessions</th><th className={adminTh}>Joined</th></tr></thead>
            <tbody>
              {recentUsers.map((profile) => (
                <tr key={profile.id}>
                  <td className={adminTd}><p className="font-semibold">{profile.displayName || "Unnamed user"}</p><p className="mt-1 text-xs app-muted">{profile.email}</p></td>
                  <td className={adminTd}><AdminStatus value={profile.billingStatus} /></td>
                  <td className={adminTd}>{profile._count.sessions}</td>
                  <td className={`${adminTd} text-xs app-muted`}>{formatNewYorkDateTime(profile.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </article>

        <article className="panel p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">Security</p>
              <h2 className="mt-2 text-xl font-semibold">Recent admin activity</h2>
            </div>
            <Link href="/admin/audit" className="text-xs font-semibold text-brand-300">Full audit log</Link>
          </div>
          <div className="mt-5 space-y-2">
            {latestActivity.length ? latestActivity.map((event) => (
              <div key={event.id} className="rounded-xl bg-[var(--app-panel-2)]/65 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{event.action.replaceAll(".", " ")}</p>
                  <AdminStatus value="completed" />
                </div>
                <p className="mt-2 text-xs app-muted">{event.actorEmail}</p>
                <p className="mt-1 text-[11px] app-muted">{formatNewYorkDateTime(event.createdAt)}</p>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed app-border px-4 py-10 text-center">
                <p className="text-sm font-semibold">No privileged changes yet</p>
                <p className="mt-1 text-xs app-muted">Admin actions will be recorded here.</p>
              </div>
            )}
          </div>
        </article>
      </section>
    </>
  );
}
