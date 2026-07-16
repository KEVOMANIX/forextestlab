import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/db";
import { Decimal } from "@/lib/decimal";
import { ensureUserProfile, requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Session history",
  description: "Recent ForexTestLab simulated backtest sessions.",
  alternates: { canonical: "/app/history" },
};

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await requireUser("/app/history");
  await ensureUserProfile(user);
  const sessions = await prisma.backtestSession.findMany({
    where: { userId: user.id, anonymous: false },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { _count: { select: { trades: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Session history</h1>
      <p className="mt-2 text-sm app-muted">
        Your private saved backtest sessions.
      </p>

      {sessions.length === 0 ? (
        <div className="panel mt-8 p-8 text-center">
          <p className="app-muted">No sessions yet.</p>
          <Link href="/app/backtest" className="btn-primary mt-4 inline-flex">
            Start your first session
          </Link>
        </div>
      ) : (
        <div className="panel mt-8 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Recent backtest sessions</caption>
            <thead className="app-muted">
              <tr className="border-b app-border">
                <th scope="col" className="px-4 py-3 font-medium">Pair</th>
                <th scope="col" className="px-4 py-3 font-medium">Timeframe</th>
                <th scope="col" className="px-4 py-3 font-medium">Created (UTC)</th>
                <th scope="col" className="px-4 py-3 font-medium">Trades</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Net P/L</th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const net = new Decimal(s.balance).minus(s.startingBalance);
                const positive = net.greaterThanOrEqualTo(0);
                return (
                  <tr key={s.id} className="border-b app-border/60">
                    <td className="px-4 py-3 font-mono">{s.symbol}</td>
                    <td className="px-4 py-3 font-mono">{s.timeframe}</td>
                    <td className="px-4 py-3 app-muted">
                      {s.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-4 py-3">{s._count.trades}</td>
                    <td className={`px-4 py-3 text-right font-mono ${positive ? "text-brand-300" : "text-bear"}`}>
                      {net.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/app/results/${s.id}`} className="text-brand-300 hover:underline">
                        Results
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
