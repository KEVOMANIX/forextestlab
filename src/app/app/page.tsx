import Link from "next/link";
import { ArrowRight, LineChart, PlayCircle, Scale } from "lucide-react";

import {
  MarketDataNotice,
  SimulationNotice,
} from "@/components/app/LegalNotices";

const STEPS = [
  "Select a currency pair, timeframe, and historical period.",
  "Replay the market candle by candle — you never see future price action.",
  "Place simulated Buy/Sell trades with stop-loss, take-profit, and risk sizing.",
  "Review your balance, equity, trade history, and performance statistics.",
];

const HIGHLIGHTS = [
  { icon: PlayCircle, title: "Market replay", text: "Server-controlled replay reveals one candle at a time." },
  { icon: Scale, title: "Risk tools", text: "Position sizing, stop-loss, take-profit, spread, and commission." },
  { icon: LineChart, title: "Performance", text: "Win rate, profit factor, drawdown, expectancy, and more." },
];

export default function AppHome() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <span className="rounded-full border border-brand-400/40 bg-brand-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-300">
        Public Beta
      </span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
        The ForexTestLab backtester
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed app-muted">
        ForexTestLab is live in public beta. Historical market replay, simulated
        trade execution, risk-management tools, and basic performance reporting
        are functional. Additional instruments, indicators, and analytics remain
        under development.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/app/backtest" className="btn-primary">
          Open the backtester <ArrowRight size={16} aria-hidden />
        </Link>
        <Link href="/app/history" className="btn-secondary">
          View session history
        </Link>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {HIGHLIGHTS.map((h) => {
          const Icon = h.icon;
          return (
            <div key={h.title} className="panel p-5">
              <Icon size={20} className="text-brand-300" aria-hidden />
              <h2 className="mt-3 text-sm font-semibold">{h.title}</h2>
              <p className="mt-1 text-sm app-muted">{h.text}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-12 panel p-6">
        <h2 className="text-lg font-semibold">How the demonstration works</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3 text-sm">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-400/15 font-mono text-xs text-brand-300">
                {i + 1}
              </span>
              <span className="app-muted">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-8 space-y-2">
        <SimulationNotice />
        <MarketDataNotice />
      </div>
    </div>
  );
}
