import { Section } from "@/components/Section";

const BENEFITS = [
  {
    title: "Practise structured execution",
    description:
      "Rehearse your entry and exit process in a repeatable environment.",
  },
  {
    title: "Reduce hindsight bias",
    description:
      "Replay data without future candles so decisions reflect what you'd actually see.",
  },
  {
    title: "Review strategy rules",
    description:
      "Check whether you followed your own plan on each simulated trade.",
  },
  {
    title: "Track recurring mistakes",
    description:
      "Use the journal to surface patterns you'd like to correct over time.",
  },
  {
    title: "Compare trading approaches",
    description:
      "Test variations of a strategy and review how each session played out.",
  },
  {
    title: "Build a documented process",
    description:
      "Keep an organised record of your testing to support disciplined review.",
  },
];

export function Benefits() {
  return (
    <Section
      id="benefits"
      title="How ForexTestLab may help your process"
      description="ForexTestLab is a practice and analysis tool. It cannot make trading profitable — its aim is to support disciplined, well-documented strategy testing."
      centered
    >
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((benefit) => {
          return (
            <li
              key={benefit.title}
              className="rounded-2xl border border-white/10 bg-surface-800/40 p-5"
            >
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {benefit.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                  {benefit.description}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
