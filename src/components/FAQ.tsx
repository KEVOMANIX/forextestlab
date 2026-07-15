import { Plus } from "lucide-react";

import { Section } from "@/components/Section";

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is ForexTestLab?",
    a: "ForexTestLab is a web-based forex backtesting and market-replay platform in development. It is designed to help traders replay historical currency-market data, place simulated trades, and review their strategy testing in a structured way.",
  },
  {
    q: "Is ForexTestLab a broker?",
    a: "No. ForexTestLab is not a broker and does not offer accounts, deposits, withdrawals, or live order execution. It is an educational and analytical software platform for practising and reviewing strategies with simulated trades.",
  },
  {
    q: "Does ForexTestLab provide financial advice?",
    a: "No. ForexTestLab does not provide investment, brokerage, or financial-advisory services, and nothing on this site is a recommendation to trade. It is a research and practice tool only.",
  },
  {
    q: "Will it support historical market replay?",
    a: "Historical market replay is a core planned feature and is currently in development. It is intended to let you step through past price action without seeing future candles.",
  },
  {
    q: "Will users be able to simulate trades?",
    a: "Yes — simulated manual trade execution is planned. You will be able to place practice buy and sell orders with stop-loss and take-profit levels against historical data. No real money is involved.",
  },
  {
    q: "Will the platform guarantee profitable results?",
    a: "No. No tool can guarantee profitable trading. Historical and simulated results do not guarantee future performance. ForexTestLab is intended to support disciplined practice and review, not to promise returns.",
  },
  {
    q: "Is ForexTestLab currently available?",
    a: "Not yet. ForexTestLab is in active development. You can join the waitlist to be notified as early access and the private beta become available.",
  },
  {
    q: "How can users join the private beta?",
    a: "Join the waitlist with your email and preferences. As the private beta opens, we plan to invite waitlist members in stages. There is no fixed date yet.",
  },
  {
    q: "Is ForexTestLab affiliated with TradingView?",
    a: "ForexTestLab is an independent project and is not affiliated with, sponsored by, or endorsed by TradingView. Any future third-party charting integration will be subject to the relevant provider's approval and licence terms.",
  },
  {
    q: "Which currency pairs will be supported?",
    a: "We plan to start with widely traded major pairs such as EUR/USD, GBP/USD, USD/JPY, and others, then expand based on data availability and user feedback. The final list may change before launch.",
  },
];

export function FAQ() {
  return (
    <Section
      id="faq"
      eyebrow="FAQ"
      title="Frequently asked questions"
      description="Straight answers about what ForexTestLab is — and what it is not."
      centered
    >
      <div className="mx-auto max-w-3xl space-y-3">
        {FAQS.map((item) => (
          <details
            key={item.q}
            className="group rounded-xl border border-white/10 bg-surface-800/40 open:bg-surface-800/70"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-white marker:content-none">
              {item.q}
              <Plus
                size={18}
                className="shrink-0 text-brand-300 transition-transform duration-200 group-open:rotate-45"
                aria-hidden
              />
            </summary>
            <div className="px-5 pb-5 text-sm leading-relaxed text-slate-400">
              {item.a}
            </div>
          </details>
        ))}
      </div>
    </Section>
  );
}
