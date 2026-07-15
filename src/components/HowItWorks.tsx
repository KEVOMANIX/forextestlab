import { Section } from "@/components/Section";

const STEPS = [
  {
    title: "Select a pair and period",
    description:
      "Choose a currency pair and a historical period you want to study.",
  },
  {
    title: "Replay without future candles",
    description:
      "Move through the data one step at a time — you never see what happens next.",
  },
  {
    title: "Place simulated trades",
    description:
      "Enter simulated positions using defined risk rules, stops, and targets.",
  },
  {
    title: "Review and improve",
    description:
      "Study your results, identify recurring mistakes, and refine your approach.",
  },
];

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      eyebrow="How It Works"
      title="A structured testing loop"
      description="ForexTestLab is designed around a simple, repeatable four-step workflow."
      centered
    >
      <ol className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="card relative">
            <span className="font-mono text-3xl font-bold text-brand-400/40">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-3 text-base font-semibold text-white">
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {step.description}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
