"use client";
import { useState } from "react";
import { Download } from "lucide-react";

import type { ScreenSection } from "@/lib/analytics/screen-pdf";

/** `onExporting` brackets the export so the page can show everything it needs, then go back. */
export function ExportAnalyticsPdfButton({ getElement, name, sections, onExporting }: { getElement: () => HTMLElement | null; name: string; sections: ScreenSection[]; onExporting?: (exporting: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  return <div className="relative" data-html2canvas-ignore="true">
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError(""); setPercent(0);
      try {
        const element = getElement();
        if (!element) throw new Error("Analytics is not ready.");
        const { exportAnalyticsScreens } = await import("@/lib/analytics/screen-pdf");
        onExporting?.(true);
        await exportAnalyticsScreens(element, name, sections, setPercent);
      } catch { setError("PDF export failed. Please try again."); }
      finally { onExporting?.(false); setBusy(false); }
    }} className="inline-flex h-9 items-center gap-2 rounded-lg border app-border px-3 text-xs font-semibold hover:bg-brand-400/10 disabled:opacity-50">
      <Download size={14} aria-hidden />{busy ? <>Preparing PDF… <span className="tabular-nums">{percent}%</span></> : "Export PDF"}
    </button>
    {error && <p role="alert" className="mt-1 max-w-56 text-xs text-loss">{error}</p>}
  </div>;
}
