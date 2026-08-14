import { ArrowRight, Headphones, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/Logo";
import { siteConfig } from "@/lib/site";

const workspaceLinks = [
  { label: "Dashboard", href: "/app" },
  { label: "Backtester", href: "/app/backtest" },
  { label: "Saved sessions", href: "/app/history" },
  { label: "Account", href: "/account" },
] as const;

const supportLinks = [
  { label: "Help & support", href: "/support" },
  { label: "Contact us", href: "/contact" },
  { label: "Plans & pricing", href: "/pricing" },
] as const;

const legalLinks = [
  { label: "Risk disclosure", href: "/risk-disclosure" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
] as const;

function FooterLinks({
  title,
  links,
}: {
  title: string;
  links: readonly { label: string; href: string }[];
}) {
  return (
    <nav aria-label={title}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] app-muted">
        {title}
      </p>
      <ul className="mt-3 grid gap-2.5 text-xs sm:grid-cols-2 lg:grid-cols-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="group inline-flex items-center gap-1.5 font-medium text-[var(--app-text)] transition-colors hover:text-brand-300"
            >
              {link.label}
              <ArrowRight
                size={11}
                className="opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="dashboard-workspace relative overflow-hidden border-t app-border bg-[var(--app-bg)] px-4 py-7 sm:py-8">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/55 to-transparent"
        aria-hidden
      />

      <div className="mx-auto max-w-[1600px]">
        <div className="relative overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)] shadow-[0_24px_70px_-48px_rgba(0,0,0,0.9)]">
          <div
            className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-brand-400/[0.08] blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-0 left-0 h-px w-1/2 bg-gradient-to-r from-brand-400/45 to-transparent"
            aria-hidden
          />

          <div className="relative grid gap-8 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(260px,1.2fr)_minmax(130px,.52fr)_minmax(130px,.46fr)_minmax(260px,.9fr)] lg:items-center lg:gap-7 lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Logo className="h-8" />
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-400/20 bg-brand-400/[0.07] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.13em] text-brand-300">
                  <Sparkles size={10} aria-hidden />
                  Strategy workspace
                </span>
              </div>
              <p className="mt-4 max-w-md text-xs leading-5 app-muted">
                Replay markets, review every decision, and build a process you can
                trust before real capital is involved.
              </p>
            </div>

            <FooterLinks title="Workspace" links={workspaceLinks} />
            <FooterLinks title="Support" links={supportLinks} />

            <div className="rounded-xl border border-brand-400/20 bg-gradient-to-br from-brand-400/[0.11] to-brand-400/[0.025] p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-400/15 text-brand-300">
                  <Headphones size={16} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--app-text)]">
                    Ready for the next test?
                  </p>
                  <p className="mt-1 text-[10px] leading-4 app-muted">
                    Start a clean replay and put your next idea through the data.
                  </p>
                </div>
              </div>
              <Link
                href="/app/backtest"
                className="mt-4 inline-flex h-9 w-full items-center justify-between rounded-lg bg-brand-500 px-3.5 text-xs font-bold text-surface-950 transition-all hover:bg-brand-400 hover:shadow-glow"
              >
                New backtest
                <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
          </div>

          <div className="relative flex flex-col gap-4 border-t app-border px-5 py-4 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="flex items-start gap-2.5 text-[10px] leading-4 app-muted">
              <ShieldCheck
                size={14}
                className="mt-px shrink-0 text-brand-300"
                aria-hidden
              />
              <p>
                Educational market simulation only. Historical results do not
                guarantee future performance.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
              <nav className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Legal">
                {legalLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-[10px] font-medium app-muted transition-colors hover:text-brand-300"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <span className="hidden h-3 w-px bg-[var(--app-border)] sm:block" aria-hidden />
              <p className="whitespace-nowrap text-[10px] app-muted">
                © {year} {siteConfig.company}. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
