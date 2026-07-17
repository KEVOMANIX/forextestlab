import type { Metadata } from "next";
import Link from "next/link";

import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <PageShell>
      <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <p className="font-mono text-6xl font-bold text-brand-400/40">404</p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Page not found
        </h1>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/" className="btn-primary">
            Back to home
          </Link>
          <Link href="/app/backtest" className="btn-secondary">
            Start backtesting
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
