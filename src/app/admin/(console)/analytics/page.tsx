import { Activity, CheckCircle2, MessageSquareText, MousePointerClick, Users } from "lucide-react";

import { AdminPageHeader, AdminStat, AdminTable, adminTd, adminTh } from "@/components/admin/AdminUI";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { formatNewYorkDateTime } from "@/lib/date-time";

interface FunnelRow { name: string; people: bigint; events: bigint }

export default async function AdminAnalyticsPage() {
  await requireAdmin("/admin/analytics");
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [funnel, topPaths, feedback, average] = await Promise.all([
    prisma.$queryRaw<FunnelRow[]>`
      SELECT "name", COUNT(DISTINCT COALESCE("userId", "anonymousId")) AS people, COUNT(*) AS events
      FROM "ProductEvent" WHERE "createdAt" >= ${since}
      GROUP BY "name" ORDER BY events DESC`,
    prisma.productEvent.groupBy({ by: ["path"], where: { name: "page_view", createdAt: { gte: since }, path: { not: null } }, _count: true, orderBy: { _count: { path: "desc" } }, take: 12 }),
    prisma.productFeedback.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.productFeedback.aggregate({ _avg: { rating: true }, _count: true }),
  ]);
  const byName = new Map(funnel.map((row) => [row.name, Number(row.people)]));
  const visitors = byName.get("page_view") ?? 0;
  const signups = byName.get("signup_completed") ?? 0;
  const created = byName.get("backtest_created") ?? 0;
  const completed = byName.get("backtest_completed") ?? 0;
  const percent = (value: number, total: number) => total ? `${((value / total) * 100).toFixed(1)}%` : "0%";

  return <>
    <AdminPageHeader eyebrow="Product intelligence" title="Activation & feedback" description="First-party, privacy-conscious conversion signals from the last 30 days. No IP addresses or browser fingerprints are retained." />
    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <AdminStat label="Visitors" value={String(visitors)} detail="Unique anonymous or signed-in IDs" icon={Users} />
      <AdminStat label="Signups" value={String(signups)} detail={`${percent(signups, visitors)} of visitors`} icon={MousePointerClick} />
      <AdminStat label="Started a backtest" value={String(created)} detail={`${percent(created, Math.max(signups, visitors))} of visitors`} icon={Activity} />
      <AdminStat label="Completed a backtest" value={String(completed)} detail={`${percent(completed, created)} of starters`} icon={CheckCircle2} />
      <AdminStat label="Feedback" value={average._avg.rating ? `${average._avg.rating.toFixed(1)}/5` : "—"} detail={`${average._count} responses`} icon={MessageSquareText} />
    </section>
    <section className="mt-6 grid gap-6 xl:grid-cols-2">
      <article className="panel p-5 sm:p-6"><h2 className="text-lg font-semibold">Event funnel</h2><AdminTable label="Product events"><thead><tr><th className={adminTh}>Event</th><th className={adminTh}>People</th><th className={adminTh}>Total events</th></tr></thead><tbody>{funnel.map((row) => <tr key={row.name}><td className={`${adminTd} font-semibold`}>{row.name.replaceAll("_", " ")}</td><td className={adminTd}>{Number(row.people)}</td><td className={adminTd}>{Number(row.events)}</td></tr>)}</tbody></AdminTable></article>
      <article className="panel p-5 sm:p-6"><h2 className="text-lg font-semibold">Most viewed pages</h2><AdminTable label="Page views"><thead><tr><th className={adminTh}>Path</th><th className={adminTh}>Views</th></tr></thead><tbody>{topPaths.map((row) => <tr key={row.path}><td className={`${adminTd} font-mono text-xs`}>{row.path}</td><td className={adminTd}>{row._count}</td></tr>)}</tbody></AdminTable></article>
    </section>
    <article className="panel mt-6 p-5 sm:p-6"><h2 className="text-lg font-semibold">Recent feedback</h2><AdminTable label="Product feedback"><thead><tr><th className={adminTh}>Rating</th><th className={adminTh}>Comment</th><th className={adminTh}>Session</th><th className={adminTh}>Received</th></tr></thead><tbody>{feedback.map((item) => <tr key={item.id}><td className={`${adminTd} font-semibold`}>{item.rating}/5</td><td className={`${adminTd} max-w-xl text-xs`}>{item.comment || "No comment"}</td><td className={`${adminTd} font-mono text-[10px] app-muted`}>{item.sessionId ?? "—"}</td><td className={`${adminTd} text-xs app-muted`}>{formatNewYorkDateTime(item.createdAt)}</td></tr>)}</tbody></AdminTable></article>
  </>;
}
