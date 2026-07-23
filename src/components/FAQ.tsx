import { Plus } from "lucide-react";

import { Section } from "@/components/Section";

const FAQS = [
  {
    q: "What is ForexTestLab?",
    a: "A web-based forex backtester for replaying historical markets, placing simulated trades, and reviewing performance.",
  },
  {
    q: "Is ForexTestLab a broker?",
    a: "No. It does not accept deposits, execute live orders, or offer brokerage accounts.",
  },
  {
    q: "Does ForexTestLab provide financial advice?",
    a: "No. It is a research and practice tool, not an investment-advisory service.",
  },
  {
    q: "Can I replay historical markets?",
    a: "Yes. Sessions replay historical price data without revealing future candles.",
  },
  {
    q: "What is included in the free trial?",
    a: "You can create up to three trial sessions on each device. Each session can use any one supported pair and up to 31 days of historical data.",
  },
  {
    q: "Can I simulate trades?",
    a: "Yes. Place simulated buy and sell orders, manage protection levels, and review the results. No real money is involved.",
  },
  {
    q: "Does backtesting guarantee profitable results?",
    a: "No. Historical and simulated results do not guarantee future performance.",
  },
  {
    q: "Is ForexTestLab affiliated with TradingView?",
    a: "No. ForexTestLab is an independent product and is not sponsored or endorsed by TradingView.",
  },
];

export function FAQ() {
  return (
    <Section id="faq" eyebrow="FAQ" title="Frequently asked questions" centered>
      <div className="mx-auto max-w-3xl space-y-3">
        {FAQS.map((item) => (
          <details key={item.q} className="group rounded-xl border border-white/10 bg-surface-800/40 open:bg-surface-800/70">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-white marker:content-none">
              {item.q}
              <Plus size={18} className="shrink-0 text-brand-300 transition-transform duration-200 group-open:rotate-45" aria-hidden />
            </summary>
            <div className="px-5 pb-5 text-sm leading-relaxed text-slate-400">{item.a}</div>
          </details>
        ))}
      </div>
    </Section>
  );
}
