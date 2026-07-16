import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/db";
import { Decimal } from "@/lib/decimal";
import { ensureUserProfile, requireUser } from "@/lib/auth";
import type { SessionState } from "@/lib/backtest/types";
import { BackLink } from "@/components/app/BackLink";

export const metadata: Metadata = {
  title: "Session history",
  description: "Recent ForexTestLab simulated backtest sessions.",
  alternates: { canonical: "/app/history" },
};

export const dynamic = "force-dynamic";

function sessionDetails(stateJson: string, fallbackSymbol: string) {
  try {
    const state = JSON.parse(stateJson) as SessionState;
    return {
      name: state.config.name?.trim() || `${fallbackSymbol} backtest`,
      symbols: state.config.symbols?.length
        ? state.config.symbols
        : [fallbackSymbol],
    };
  } catch {
    return { name: `${fallbackSymbol} backtest`, symbols: [fallbackSymbol] };
  }
}

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
      <BackLink />
      <h1 className="mt-5 text-2xl font-bold tracking-tight">Session history</h1>
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
                <th scope="col" className="px-4 py-3 font-medium">Session</th>
                <th scope="col" className="px-4 py-3 font-medium">Pairs</th>
                <th scope="col" className="px-4 py-3 font-medium">Test period</th>
                <th scope="col" className="px-4 py-3 font-medium">Trades</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Net P/L</th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const net = new Decimal(s.balance).minus(s.startingBalance);
                const positive = net.greaterThanOrEqualTo(0);
                const details = sessionDetails(s.stateJson, s.symbol);
                return (
                  <tr key={s.id} className="border-b app-border/60">
                    <td className="px-4 py-3 font-semibold">{details.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {details.symbols
                        .map((symbol) => `${symbol.slice(0, 3)}/${symbol.slice(3)}`)
                        .join(", ")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs app-muted">
                      {new Date(Number(s.startTime)).toISOString().slice(0, 10)}
                      {" – "}
                      {new Date(Number(s.endTime)).toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-3">{s._count.trades}</td>
                    <td className={`px-4 py-3 text-right font-mono ${positive ? "text-brand-300" : "text-bear"}`}>
                      {net.toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link
                        href={`/app/backtest?session=${encodeURIComponent(s.id)}`}
                        className="mr-3 font-semibold text-brand-300 hover:underline"
                      >
                        Resume
                      </Link>
                      <Link
                        href={`/app/results/${s.id}`}
                        className="font-semibold text-brand-300 hover:underline"
                      >
                        Analytics
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
