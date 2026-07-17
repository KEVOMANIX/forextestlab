import {
  BarChart3,
  BookOpen,
  ClipboardList,
  GaugeCircle,
  History,
  Layers,
  MousePointerClick,
  Scale,
  type LucideIcon,
} from "lucide-react";

import { Section } from "@/components/Section";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: History,
    title: "Historical Market Replay",
    description:
      "Step through historical currency-market data candle by candle, without seeing future price action.",
  },
  {
    icon: MousePointerClick,
    title: "Manual Trade Simulation",
    description:
      "Place simulated buy and sell orders and practise execution as the replay advances.",
  },
  {
    icon: Scale,
    title: "Stop-Loss & Take-Profit Testing",
    description:
      "Attach protective levels to simulated positions and observe how they would have behaved.",
  },
  {
    icon: GaugeCircle,
    title: "Position-Sizing Tools",
    description:
      "Model risk per trade and calculate position size against a simulated account balance.",
  },
  {
    icon: BookOpen,
    title: "Trading Journal",
    description:
      "Log each simulated trade with notes and tags to build a documented testing process.",
  },
  {
    icon: BarChart3,
    title: "Performance Statistics",
    description:
      "Review win rate, profit factor, drawdown, and other summary metrics for a test session.",
  },
  {
    icon: Layers,
    title: "Multi-Timeframe Analysis",
    description:
      "Reference multiple timeframes while replaying to study context around your entries.",
  },
  {
    icon: ClipboardList,
    title: "Strategy Review",
    description:
      "Compare sessions and revisit decisions to refine and document your strategy rules.",
  },
];

export function Features() {
  return (
    <Section
      id="features"
      eyebrow="Features"
      title="Everything you need to test a forex strategy"
      centered
    >
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <li key={feature.title} className="card flex flex-col">
              <div className="flex items-center">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-surface-900 text-brand-300">
                  <Icon size={20} aria-hidden />
                </span>
              </div>
              <h3 className="mt-5 text-base font-semibold text-white">
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
