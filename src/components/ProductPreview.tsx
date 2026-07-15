import {
  ChevronDown,
  FastForward,
  Pause,
  Play,
  Rewind,
} from "lucide-react";

import { CandlestickChart } from "@/components/CandlestickChart";
import { Section } from "@/components/Section";

const TIMEFRAMES = ["M5", "M15", "H1", "H4", "D1"];

const STATS = [
  { label: "Account balance", value: "$10,000.00", tone: "text-white" },
  { label: "Win rate", value: "58%", tone: "text-brand-300" },
  { label: "Profit factor", value: "1.42", tone: "text-brand-300" },
  { label: "Max drawdown", value: "-6.8%", tone: "text-bear" },
];

const TRADES = [
  { pair: "EUR/USD", side: "Buy", size: "0.50", pnl: "+42.10", win: true },
  { pair: "EUR/USD", side: "Sell", size: "0.25", pnl: "-18.30", win: false },
  { pair: "EUR/USD", side: "Buy", size: "0.75", pnl: "+65.40", win: true },
  { pair: "EUR/USD", side: "Sell", size: "0.50", pnl: "+12.90", win: true },
];

function Selector({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-surface-900 px-3 py-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="font-mono text-sm font-medium text-white">{value}</span>
      <ChevronDown size={14} className="text-slate-500" aria-hidden />
    </div>
  );
}

function ControlButton({
  children,
  label,
  active = false,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <span
      aria-label={label}
      className={`grid h-9 w-9 place-items-center rounded-lg border ${
        active
          ? "border-brand-400/40 bg-brand-400/15 text-brand-200"
          : "border-white/10 bg-surface-900 text-slate-300"
      }`}
    >
      {children}
    </span>
  );
}

export function ProductPreview() {
  return (
    <Section
      id="product-preview"
      eyebrow="Product Preview"
      title="A look at the planned interface"
      description="An original, non-functional mock-up of the ForexTestLab workspace. This is a visual demonstration only — it does not use real market data or execute orders."
      centered
    >
      <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-surface-800/60 shadow-card">
        {/* Top toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-surface-900/70 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Selector label="Pair" value="EUR/USD" />
            <div className="flex overflow-hidden rounded-lg border border-white/10">
              {TIMEFRAMES.map((tf) => (
                <span
                  key={tf}
                  className={`px-3 py-2 font-mono text-xs ${
                    tf === "H1"
                      ? "bg-brand-400/15 text-brand-200"
                      : "bg-surface-900 text-slate-400"
                  }`}
                >
                  {tf}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ControlButton label="Rewind">
              <Rewind size={16} aria-hidden />
            </ControlButton>
            <ControlButton label="Play" active>
              <Play size={16} aria-hidden />
            </ControlButton>
            <ControlButton label="Pause">
              <Pause size={16} aria-hidden />
            </ControlButton>
            <ControlButton label="Fast-forward">
              <FastForward size={16} aria-hidden />
            </ControlButton>
          </div>
        </div>

        <div className="grid gap-px bg-white/5 lg:grid-cols-[1fr_320px]">
          {/* Chart area + stats */}
          <div className="bg-surface-800/60 p-4">
            <div className="rounded-xl border border-white/10 bg-surface-900/50 p-2">
              <CandlestickChart className="h-64 w-full sm:h-72" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-white/10 bg-surface-900/60 p-3"
                >
                  <p className="text-xs text-slate-500">{stat.label}</p>
                  <p className={`mt-1 font-mono text-lg font-semibold ${stat.tone}`}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Order ticket */}
          <div className="bg-surface-800/60 p-4">
            <div className="rounded-xl border border-white/10 bg-surface-900/50 p-4">
              <div className="grid grid-cols-2 gap-2">
                <span className="rounded-lg bg-brand-500 py-2.5 text-center text-sm font-semibold text-surface-950">
                  Buy
                </span>
                <span className="rounded-lg bg-bear py-2.5 text-center text-sm font-semibold text-white">
                  Sell
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <p className="mb-1 text-xs text-slate-500">Stop loss</p>
                  <div className="rounded-lg border border-white/10 bg-surface-800 px-3 py-2 font-mono text-sm text-slate-200">
                    1.0824
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs text-slate-500">Take profit</p>
                  <div className="rounded-lg border border-white/10 bg-surface-800 px-3 py-2 font-mono text-sm text-slate-200">
                    1.0912
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs text-slate-500">Lot size</p>
                  <div className="rounded-lg border border-white/10 bg-surface-800 px-3 py-2 font-mono text-sm text-slate-200">
                    0.50
                  </div>
                </div>
              </div>
            </div>

            {/* Recent trades */}
            <div className="mt-4 rounded-xl border border-white/10 bg-surface-900/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Recent trades
              </p>
              <table className="mt-3 w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="pb-2 font-medium">Side</th>
                    <th className="pb-2 font-medium">Size</th>
                    <th className="pb-2 text-right font-medium">P/L</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {TRADES.map((trade, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="py-2 text-slate-300">{trade.side}</td>
                      <td className="py-2 text-slate-400">{trade.size}</td>
                      <td
                        className={`py-2 text-right ${
                          trade.win ? "text-brand-300" : "text-bear"
                        }`}
                      >
                        {trade.pnl}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        Figures shown are placeholder values for demonstration and do not
        represent real or expected results.
      </p>
    </Section>
  );
}
