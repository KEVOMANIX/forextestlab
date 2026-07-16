import type { PerformanceStats } from "@/lib/backtest/statistics";
import { CircleHelp } from "lucide-react";

function money(v: string): string {
  return v === "Not available" ? v : `$${v}`;
}

export function StatsGrid({ stats }: { stats: PerformanceStats }) {
  const cards: { label: string; value: string; tone?: string }[] = [
    { label: "Net profit / loss", value: money(stats.netProfit), tone: Number(stats.netProfit) >= 0 ? "text-brand-300" : "text-bear" },
    { label: "Ending balance", value: money(stats.endingBalance) },
    { label: "Total trades", value: String(stats.totalTrades) },
    { label: "Win rate", value: stats.winRate === "Not available" ? stats.winRate : `${stats.winRate}%` },
    { label: "Profit factor", value: stats.profitFactor },
    { label: "Expectancy", value: money(stats.expectancy) },
    { label: "Gross profit", value: money(stats.grossProfit), tone: "text-brand-300" },
    { label: "Gross loss", value: money(stats.grossLoss), tone: "text-bear" },
    { label: "Average win", value: money(stats.averageWin), tone: "text-brand-300" },
    { label: "Average loss", value: money(stats.averageLoss), tone: "text-bear" },
    { label: "Largest win", value: money(stats.largestWin), tone: "text-brand-300" },
    { label: "Largest loss", value: money(stats.largestLoss), tone: "text-bear" },
    { label: "Max drawdown", value: money(stats.maxDrawdown), tone: "text-bear" },
    { label: "Max drawdown %", value: stats.maxDrawdownPercent === "Not available" ? stats.maxDrawdownPercent : `${stats.maxDrawdownPercent}%` },
    { label: "Consecutive wins", value: String(stats.maxConsecutiveWins) },
    { label: "Consecutive losses", value: String(stats.maxConsecutiveLosses) },
    { label: "Avg risk / reward", value: stats.averageRiskReward },
  ];
  const explanations: Record<string, string> = {
    "Net profit / loss": "Ending balance minus starting balance after simulated costs.",
    "Win rate": "The percentage of closed trades that ended with a profit.",
    "Profit factor": "Gross profit divided by gross loss. Above 1 means profits exceeded losses.",
    Expectancy: "The average amount the strategy made or lost per closed trade.",
    "Max drawdown": "The largest peak-to-trough decline in simulated account equity.",
    "Max drawdown %": "The largest equity decline expressed as a percentage of the prior peak.",
    "Avg risk / reward": "Average potential reward compared with the initial risk on closed trades.",
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="panel-2 p-3">
          <p className="flex items-center gap-1 text-xs app-muted">
            {c.label}
            {explanations[c.label] && (
              <span title={explanations[c.label]} aria-label={`${c.label}: ${explanations[c.label]}`}>
                <CircleHelp size={12} aria-hidden />
              </span>
            )}
          </p>
          <p className={`mt-1 font-mono text-sm font-semibold ${c.tone ?? ""}`}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}
