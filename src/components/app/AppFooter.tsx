import Link from "next/link";

/**
 * App footer. Includes the attribution required by the TradingView Lightweight
 * Charts™ licence. This attribution must remain visible — do not remove it.
 * ForexTestLab is independent and not affiliated with TradingView.
 */
export function AppFooter() {
  return (
    <footer className="border-t app-border px-4 py-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 text-xs app-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          Charting by{" "}
          <a
            href="https://www.tradingview.com/lightweight-charts/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-300 hover:underline"
          >
            TradingView Lightweight Charts™
          </a>
          . ForexTestLab is an independent project and is not affiliated with,
          sponsored by, or endorsed by TradingView.
        </p>
        <nav className="flex gap-4" aria-label="Legal">
          <Link href="/risk-disclosure" className="hover:text-brand-300">Risk Disclosure</Link>
          <Link href="/terms" className="hover:text-brand-300">Terms</Link>
          <Link href="/privacy" className="hover:text-brand-300">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}
