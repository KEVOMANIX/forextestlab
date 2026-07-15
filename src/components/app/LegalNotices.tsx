import { AlertTriangle, Info } from "lucide-react";

/** Standing disclaimer shown near the backtester. */
export function SimulationNotice() {
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed app-muted">
      <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
      ForexTestLab provides educational and analytical simulation software. It is
      not a broker and does not execute real-money trades. Historical and
      simulated performance does not guarantee future results.
    </p>
  );
}

export function MarketDataNotice() {
  return (
    <p className="text-xs leading-relaxed app-muted">
      Market data may be delayed, incomplete, aggregated, synthetic, or supplied
      for demonstration purposes. Data-source availability and licensing may
      change.
    </p>
  );
}

/** Shown only when the active session uses synthetic demo data. */
export function DemoDataNotice() {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-300"
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
      This session uses generated demonstration data and does not represent an
      actual market feed.
    </div>
  );
}

/** Shown when manually imported data is active (source shown, no partnership). */
export function ImportedDataNotice({ source }: { source: string }) {
  return (
    <p className="text-xs leading-relaxed app-muted">
      Data source:{" "}
      <span className="font-medium text-brand-300">{source}</span>. Imported for
      analysis; this does not imply any partnership or endorsement.
    </p>
  );
}
