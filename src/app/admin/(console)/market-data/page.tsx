import { AlertTriangle, CheckCircle2, Cloud, Database } from "lucide-react";

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

export default async function AdminMarketDataPage() {
  await requireAdmin("/admin/market-data");
  const [instruments, imports, failed, candles] = await prisma.$transaction([
    prisma.marketInstrument.findMany({ orderBy: { symbol: "asc" }, include: { _count: { select: { candles: true, sessions: true, imports: true } } } }),
    prisma.dataImport.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.dataImport.count({ where: { status: { not: "completed" } } }),
    prisma.marketCandle.count(),
  ]);
  const provider = process.env.MARKET_DATA_PROVIDER ?? "not configured";
  const r2Configured = Boolean(process.env.R2_BUCKET_NAME && process.env.R2_ENDPOINT);

  return (
    <>
      <AdminPageHeader eyebrow="Infrastructure" title="Market data" description="Review the active provider, available instruments, database coverage, imports, rejected rows, and operational alerts." />
      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat label="Active provider" value={provider.toUpperCase()} detail={r2Configured ? "Cloudflare R2 configured" : "R2 configuration incomplete"} icon={Cloud} />
        <AdminStat label="Enabled instruments" value={String(instruments.filter((item) => item.enabled).length)} detail={`${instruments.length} instruments registered`} icon={Database} />
        <AdminStat label="Database candles" value={candles.toLocaleString()} detail="Relational candle records" icon={CheckCircle2} tone="text-accent-400" />
        <AdminStat label="Import alerts" value={String(failed)} detail="Non-completed imports" icon={failed ? AlertTriangle : CheckCircle2} tone={failed ? "text-bear" : "text-brand-300"} />
      </section>
      <section className="mt-6 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <article className="panel p-5"><h2 className="text-lg font-semibold">Instrument registry</h2><div className="mt-4 space-y-2">{instruments.map((instrument) => <div key={instrument.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--app-panel-2)]/60 p-3"><div><p className="text-sm font-semibold">{formatSymbol(instrument.symbol)}</p><p className="mt-1 text-[11px] app-muted">{instrument._count.candles.toLocaleString()} DB candles · {instrument._count.sessions} sessions</p></div><AdminStatus value={instrument.enabled ? "active" : "inactive"} /></div>)}</div></article>
        <article className="panel p-5"><h2 className="text-lg font-semibold">Latest imports</h2><AdminTable label="Market data imports"><thead><tr><th className={adminTh}>Symbol</th><th className={adminTh}>Status</th><th className={adminTh}>Imported</th><th className={adminTh}>Quality</th><th className={adminTh}>Date</th></tr></thead><tbody>{imports.map((item) => <tr key={item.id}><td className={adminTd}><p className="font-semibold">{item.symbol}</p><p className="mt-1 text-[11px] app-muted">{item.source} · {item.timeframe}</p></td><td className={adminTd}><AdminStatus value={item.status} /></td><td className={adminTd}>{item.rowsImported.toLocaleString()}</td><td className={adminTd}><p className="text-xs">{item.rowsRejected} rejected</p><p className="mt-1 text-[11px] app-muted">{item.gapsDetected} gaps</p></td><td className={`${adminTd} text-xs app-muted`}>{formatNewYorkDateTime(item.createdAt)}</td></tr>)}</tbody></AdminTable></article>
      </section>
    </>
  );
}
