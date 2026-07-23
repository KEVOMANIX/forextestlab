import { ReceiptText } from "lucide-react";

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

export default async function AdminSubscriptionsPage() {
  await requireAdmin("/admin/subscriptions");
  const [subscriptions, active, canceling] = await prisma.$transaction([
    prisma.billingSubscription.findMany({ orderBy: { updatedAt: "desc" }, take: 150, include: { user: true } }),
    prisma.billingSubscription.count({ where: { status: "active" } }),
    prisma.billingSubscription.count({ where: { cancelAtPeriodEnd: true } }),
  ]);
  const attention = subscriptions.filter((item) => ["past_due", "paused", "attention"].includes(item.status)).length;

  return (
    <>
      <AdminPageHeader eyebrow="Billing" title="Subscriptions" description="Read-only subscription visibility across Paddle and legacy billing records. Customer changes remain in the billing provider." />
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <AdminStat label="Active" value={String(active)} detail="Currently granting access" icon={ReceiptText} />
        <AdminStat label="Ending soon" value={String(canceling)} detail="Cancellation scheduled" icon={ReceiptText} tone="text-amber-300" />
        <AdminStat label="Needs attention" value={String(attention)} detail="Past due, paused, or attention" icon={ReceiptText} tone={attention ? "text-bear" : "text-brand-300"} />
      </section>
      <section className="panel mt-6 p-4 sm:p-5">
        <AdminTable label="Billing subscriptions">
          <thead><tr><th className={adminTh}>Customer</th><th className={adminTh}>Plan</th><th className={adminTh}>Provider</th><th className={adminTh}>Status</th><th className={adminTh}>Renewal</th><th className={adminTh}>Updated</th></tr></thead>
          <tbody>
            {subscriptions.map((subscription) => (
              <tr key={subscription.id}>
                <td className={adminTd}><p className="font-semibold">{subscription.user.displayName || subscription.user.email}</p><p className="mt-1 text-xs app-muted">{subscription.user.email}</p></td>
                <td className={adminTd}><p className="font-semibold capitalize">{subscription.productKey.replaceAll("-", " ")}</p><p className="mt-1 font-mono text-[10px] app-muted">{subscription.planCode}</p></td>
                <td className={`${adminTd} capitalize`}>{subscription.provider}</td>
                <td className={adminTd}><AdminStatus value={subscription.status} />{subscription.cancelAtPeriodEnd && <p className="mt-2 text-[11px] text-amber-300">Ends at renewal</p>}</td>
                <td className={`${adminTd} text-xs app-muted`}>{subscription.nextPaymentAt ? formatNewYorkDateTime(subscription.nextPaymentAt) : "Not scheduled"}</td>
                <td className={`${adminTd} text-xs app-muted`}>{formatNewYorkDateTime(subscription.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      </section>
    </>
  );
}
