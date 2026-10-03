import { Section } from "@/components/Section";

interface Feature {
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    title: "Historical Market Replay",
    description:
      "Step through historical currency-market data candle by candle, without seeing future price action.",
  },
  {
    title: "Manual Trade Simulation",
    description:
      "Place simulated buy and sell orders and practise execution as the replay advances.",
  },
  {
    title: "Stop-Loss & Take-Profit Testing",
    description:
      "Attach protective levels to simulated positions and observe how they would have behaved.",
  },
  {
    title: "Position-Sizing Tools",
    description:
      "Model risk per trade and calculate position size against a simulated account balance.",
  },
  {
    title: "Trading Journal",
    description:
      "Log each simulated trade with notes and tags to build a documented testing process.",
  },
  {
    title: "Performance Statistics",
    description:
      "Review win rate, profit factor, drawdown, and other summary metrics for a test session.",
  },
  {
    title: "Multi-Timeframe Analysis",
    description:
      "Reference multiple timeframes while replaying to study context around your entries.",
  },
  {
    title: "Strategy Review",
    description:
      "Compare sessions and revisit decisions to refine and document your strategy rules.",
  },
];

export function Features() {
  return (
    <Section
      id="features"
      title="Everything you need to test a forex strategy"
      centered
    >
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => {
          return (
            <li key={feature.title} className="card flex flex-col">
              <h3 className="text-base font-semibold text-white">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {feature.description}
              </p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
