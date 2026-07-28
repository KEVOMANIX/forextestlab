import Link from "next/link";
import { GitBranch } from "lucide-react";

import type { SessionResults } from "@/lib/backtest/results";

export function BranchComparison({
  currentId,
  branches,
}: {
  currentId: string;
  branches: SessionResults["branchComparison"];
}) {
  if (branches.length <= 1) return null;
  return (
    <section className="panel mt-6 overflow-hidden">
      <div className="flex items-center gap-2 border-b app-border p-5">
        <GitBranch size={16} className="text-brand-300" />
        <div><h2 className="font-semibold">Session branches</h2><p className="mt-1 text-xs app-muted">Compare alternative decisions without changing the original.</p></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="app-muted"><tr className="border-b app-border"><th className="px-4 py-2">Session</th><th>Fork point</th><th>Trades</th><th>Net P/L</th><th>Win rate</th><th>Balance</th><th /></tr></thead>
          <tbody>
            {branches.map((branch, index) => (
              <tr key={branch.sessionId} className={`border-b app-border/60 ${branch.sessionId === currentId ? "bg-brand-400/[0.06]" : ""}`}>
                <td className="px-4 py-3 font-semibold">{index === 0 ? "Original · " : "Branch · "}{branch.name}</td>
                <td>{branch.branchPointIndex == null ? "Start" : `Candle ${branch.branchPointIndex + 1}`}</td>
                <td>{branch.trades}</td><td className={Number(branch.netPnl) >= 0 ? "text-brand-300" : "text-bear"}>{branch.netPnl}</td>
                <td>{branch.winRate === "Not available" ? "—" : `${branch.winRate}%`}</td><td>{branch.balance}</td>
                <td className="pr-4 text-right"><Link className="text-brand-300 hover:underline" href={`/app/results/${branch.sessionId}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
