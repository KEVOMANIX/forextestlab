import { ShieldCheck } from "lucide-react";

export function TrustStatement() {
  return (
    <div className="container-page">
      <div className="mx-auto flex max-w-3xl items-start gap-3 rounded-xl border border-white/10 bg-surface-800/40 px-5 py-4">
        <ShieldCheck
          size={20}
          className="mt-0.5 shrink-0 text-brand-300"
          aria-hidden
        />
        <p className="text-sm leading-relaxed text-slate-400">
          Built for research, practice, and strategy evaluation. ForexTestLab
          does not provide financial advice or guarantee trading results.
        </p>
      </div>
    </div>
  );
}
