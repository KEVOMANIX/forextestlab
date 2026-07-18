import Link from "next/link";

export function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t app-border px-4 py-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 text-xs app-muted sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} Manixlabs. ForexTestLab is built for market research and strategy practice.</p>
        <nav className="flex gap-4" aria-label="Legal">
          <Link href="/risk-disclosure" className="hover:text-brand-300">Risk Disclosure</Link>
          <Link href="/terms" className="hover:text-brand-300">Terms</Link>
          <Link href="/privacy" className="hover:text-brand-300">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}
