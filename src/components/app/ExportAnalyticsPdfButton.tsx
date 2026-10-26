"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import type { AnalyticsPdfInput } from "@/lib/analytics/pdf-report";

export function ExportAnalyticsPdfButton({ report }: { report: AnalyticsPdfInput }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="relative">
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try {
        const { createAnalyticsPdf, analyticsPdfFilename } = await import("@/lib/analytics/pdf-report");
        await createAnalyticsPdf(report).save(analyticsPdfFilename(report.name), { returnPromise: true });
      } catch { setError("PDF export failed. Please try again."); }
      finally { setBusy(false); }
    }} className="inline-flex h-9 items-center gap-2 rounded-lg border app-border px-3 text-xs font-semibold hover:bg-brand-400/10 disabled:opacity-50">
      <Download size={14} aria-hidden />{busy ? "Preparing PDF…" : "Export PDF"}
    </button>
    {error && <p role="alert" className="mt-1 max-w-56 text-xs text-loss">{error}</p>}
  </div>;
}
