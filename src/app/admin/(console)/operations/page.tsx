import { Activity, Archive, Database, HardDrive, Server } from "lucide-react";

import { AdminPageHeader, AdminStat, AdminStatus, AdminTable, adminTd, adminTh } from "@/components/admin/AdminUI";
import { requireAdmin } from "@/lib/admin";
import { formatNewYorkDateTime } from "@/lib/date-time";
import { collectOperationsSnapshot } from "@/lib/operations/health";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function bytes(value: number | null): string {
  if (value == null) return "Unavailable";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount.toFixed(unit < 2 ? 0 : 2)} ${units[unit]}`;
}

export default async function AdminOperationsPage() {
  await requireAdmin("/admin/operations");
  const [snapshot, history] = await Promise.all([
    collectOperationsSnapshot(),
    prisma.operationalCheck.findMany({ orderBy: { checkedAt: "desc" }, take: 40 }),
  ]);
  const completePairs = snapshot.marketData.filter((item) => item.firstMonth === "2015-01" && item.status === "healthy").length;

  return (
    <>
      <AdminPageHeader eyebrow="Reliability" title="Operations & usage" description="Live infrastructure checks, backup recency, data coverage, and free-tier capacity from the systems serving ForexTestLab." />

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AdminStat label="Overall health" value={snapshot.status} detail={`Checked ${new Date(snapshot.checkedAt).toLocaleTimeString()}`} icon={Activity} tone={snapshot.status === "healthy" ? "text-brand-300" : snapshot.status === "degraded" ? "text-amber-300" : "text-bear"} />
        <AdminStat label="Supabase database" value={bytes(snapshot.usage.databaseBytes)} detail="Current database size" icon={Database} />
        <AdminStat label="R2 storage" value={bytes(snapshot.usage.r2Bytes)} detail={`${snapshot.usage.r2Objects ?? 0} private objects`} icon={HardDrive} />
        <AdminStat label="Database backups" value={String(snapshot.usage.backupCount ?? 0)} detail={snapshot.usage.latestBackupAt ? `Latest ${formatNewYorkDateTime(new Date(snapshot.usage.latestBackupAt))}` : "No backup yet"} icon={Archive} />
        <AdminStat label="Historical FX" value={`${completePairs}/${snapshot.marketData.length}`} detail="Pairs complete from Jan 2015" icon={Server} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.4fr]">
        <article className="panel p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Live checks</h2>
          <div className="mt-4 space-y-3">
            {snapshot.checks.map((check) => (
              <div key={check.component} className="rounded-xl bg-[var(--app-panel-2)]/65 p-4">
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold capitalize">{check.component.replaceAll("-", " ")}</p><AdminStatus value={check.status} /></div>
                <p className="mt-2 text-xs app-muted">{check.message}</p>
                <p className="mt-1 text-[10px] app-muted">{check.latencyMs} ms</p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Market-data coverage</h2>
          <AdminTable label="R2 market data coverage">
            <thead><tr><th className={adminTh}>Pair</th><th className={adminTh}>Status</th><th className={adminTh}>First month</th><th className={adminTh}>Latest month</th><th className={adminTh}>Files</th></tr></thead>
            <tbody>{snapshot.marketData.map((item) => <tr key={item.symbol}><td className={`${adminTd} font-semibold`}>{item.symbol.slice(0, 3)}/{item.symbol.slice(3)}</td><td className={adminTd}><AdminStatus value={item.status} /></td><td className={adminTd}>{item.firstMonth ?? "—"}</td><td className={adminTd}>{item.lastMonth ?? "—"}</td><td className={adminTd}>{item.months}</td></tr>)}</tbody>
          </AdminTable>
        </article>
      </section>

      <article className="panel mt-6 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Monitor history</h2>
        <AdminTable label="Operational check history">
          <thead><tr><th className={adminTh}>Component</th><th className={adminTh}>Status</th><th className={adminTh}>Message</th><th className={adminTh}>Latency</th><th className={adminTh}>Checked</th></tr></thead>
          <tbody>{history.map((check) => <tr key={check.id}><td className={`${adminTd} font-semibold capitalize`}>{check.component.replaceAll("-", " ")}</td><td className={adminTd}><AdminStatus value={check.status} /></td><td className={`${adminTd} max-w-xl text-xs app-muted`}>{check.message ?? "—"}</td><td className={adminTd}>{check.latencyMs == null ? "—" : `${check.latencyMs} ms`}</td><td className={`${adminTd} text-xs app-muted`}>{formatNewYorkDateTime(check.checkedAt)}</td></tr>)}</tbody>
        </AdminTable>
      </article>
    </>
  );
}
