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

type Status = "Planned" | "In Development";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  status: Status;
}

const FEATURES: Feature[] = [
  {
    icon: History,
    title: "Historical Market Replay",
    description:
      "Step through historical currency-market data candle by candle, without seeing future price action.",
    status: "In Development",
  },
  {
    icon: MousePointerClick,
    title: "Manual Trade Simulation",
    description:
      "Place simulated buy and sell orders and practise execution as the replay advances.",
    status: "In Development",
  },
  {
    icon: Scale,
    title: "Stop-Loss & Take-Profit Testing",
    description:
      "Attach protective levels to simulated positions and observe how they would have behaved.",
    status: "Planned",
  },
  {
    icon: GaugeCircle,
    title: "Position-Sizing Tools",
    description:
      "Model risk per trade and calculate position size against a simulated account balance.",
    status: "Planned",
  },
  {
    icon: BookOpen,
    title: "Trading Journal",
    description:
      "Log each simulated trade with notes and tags to build a documented testing process.",
    status: "Planned",
  },
  {
    icon: BarChart3,
    title: "Performance Statistics",
    description:
      "Review win rate, profit factor, drawdown, and other summary metrics for a test session.",
    status: "Planned",
  },
  {
    icon: Layers,
    title: "Multi-Timeframe Analysis",
    description:
      "Reference multiple timeframes while replaying to study context around your entries.",
    status: "Planned",
  },
  {
    icon: ClipboardList,
    title: "Strategy Review",
    description:
      "Compare sessions and revisit decisions to refine and document your strategy rules.",
    status: "Planned",
  },
];

function StatusBadge({ status }: { status: Status }) {
  const inDev = status === "In Development";
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
        inDev
          ? "border-accent-400/30 bg-accent-400/10 text-accent-400"
          : "border-brand-400/30 bg-brand-400/10 text-brand-200"
      }`}
    >
      {status}
    </span>
  );
}

export function Features() {
  return (
    <Section
      id="features"
      eyebrow="Features"
      title="Everything you need to test a forex strategy"
      description="A focused toolkit for structured strategy testing and review. Capabilities still being built are labelled clearly."
      centered
    >
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <li key={feature.title} className="card flex flex-col">
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-surface-900 text-brand-300">
                  <Icon size={20} aria-hidden />
                </span>
                <StatusBadge status={feature.status} />
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
