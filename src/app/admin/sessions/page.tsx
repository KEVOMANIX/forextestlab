import { Activity, Search } from "lucide-react";

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
import { formatSymbol } from "@/lib/market-data/symbols";
import { requireAdmin } from "@/lib/admin";

function savedName(stateJson: string, symbol: string): string {
  try {
    const parsed = JSON.parse(stateJson) as { config?: { name?: string } };
    return parsed.config?.name?.trim() || `${formatSymbol(symbol)} backtest`;
  } catch {
    return `${formatSymbol(symbol)} backtest`;
  }
}

export default async function AdminSessionsPage({ searchParams }: { searchParams: { q?: string } }) {
  await requireAdmin("/admin/sessions");
  const q = searchParams.q?.trim().toUpperCase().slice(0, 20) ?? "";
  const [sessions, active, completed, anonymous] = await prisma.$transaction([
    prisma.backtestSession.findMany({
      where: q ? { OR: [{ symbol: { contains: q } }, { user: { email: { contains: q, mode: "insensitive" } } }] } : undefined,
      orderBy: { updatedAt: "desc" },
      take: 150,
      include: { user: true, _count: { select: { trades: true, orders: true } } },
    }),
    prisma.backtestSession.count({ where: { anonymous: false, status: { not: "finished" } } }),
    prisma.backtestSession.count({ where: { anonymous: false, status: "finished" } }),
    prisma.backtestSession.count({ where: { anonymous: true } }),
  ]);

  return (
    <>
      <AdminPageHeader eyebrow="Replay operations" title="Backtest sessions" description="Monitor saved and trial replay activity, progress, trade volume, and data sources.">
        <form className="relative w-full sm:w-72"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 app-muted" aria-hidden /><input name="q" defaultValue={q} placeholder="Search symbol or email" className="app-input w-full pl-9" /></form>
      </AdminPageHeader>
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <AdminStat label="Active saved sessions" value={String(active)} detail="Not yet completed" icon={Activity} />
        <AdminStat label="Completed sessions" value={String(completed)} detail="Finished saved replays" icon={Activity} tone="text-accent-400" />
        <AdminStat label="Anonymous trials" value={String(anonymous)} detail="Device-bound trial records" icon={Activity} tone="text-amber-300" />
      </section>
      <section className="panel mt-6 p-4 sm:p-5">
        <AdminTable label="Backtest sessions">
          <thead><tr><th className={adminTh}>Session</th><th className={adminTh}>Owner</th><th className={adminTh}>Status</th><th className={adminTh}>Progress</th><th className={adminTh}>Activity</th><th className={adminTh}>Source</th><th className={adminTh}>Updated</th></tr></thead>
          <tbody>
            {sessions.map((session) => {
              const progress = session.totalCandles > 0 ? Math.min(100, Math.max(0, ((session.visibleIndex + 1) / session.totalCandles) * 100)) : 0;
              return (
                <tr key={session.id}>
                  <td className={adminTd}><p className="font-semibold">{savedName(session.stateJson, session.symbol)}</p><p className="mt-1 text-xs app-muted">{formatSymbol(session.symbol)} · {session.timeframe}</p></td>
                  <td className={adminTd}><p className="text-xs">{session.user?.email ?? "Anonymous trial"}</p></td>
                  <td className={adminTd}><AdminStatus value={session.status} /></td>
                  <td className={adminTd}><div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brand-400" style={{ width: `${progress}%` }} /></div><p className="mt-1.5 text-[11px] app-muted">{progress.toFixed(0)}%</p></td>
                  <td className={adminTd}><p>{session._count.trades} trades</p><p className="mt-1 text-xs app-muted">{session._count.orders} orders</p></td>
                  <td className={adminTd}><p className="text-xs capitalize">{session.dataSource.replaceAll("-", " ")}</p>{session.demoData && <p className="mt-1 text-[11px] text-amber-300">Demo data</p>}</td>
                  <td className={`${adminTd} text-xs app-muted`}>{formatNewYorkDateTime(session.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </AdminTable>
      </section>
    </>
  );
}
