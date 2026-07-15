import Link from "next/link";

import { Logo } from "@/components/Logo";
import {
  RISK_WARNING,
  footerNav,
  siteConfig,
  socialLinks,
} from "@/lib/site";

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: readonly { label: string; href: string }[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-sm text-slate-400 transition-colors hover:text-slate-200"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  // `currentDate` context is 2026, but render the real current year at build.
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-surface-900">
      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
              A forex backtesting and market-replay platform in development,
              built for structured strategy testing, simulated execution, and
              performance review.
            </p>
            <div className="mt-6 space-y-1 text-sm">
              <a
                href={`mailto:${siteConfig.emails.hello}`}
                className="block text-slate-400 hover:text-slate-200"
              >
                {siteConfig.emails.hello}
              </a>
              <a
                href={`mailto:${siteConfig.emails.support}`}
                className="block text-slate-400 hover:text-slate-200"
              >
                {siteConfig.emails.support}
              </a>
            </div>
          </div>

          <FooterColumn title="Product" links={footerNav.product} />
          <FooterColumn title="Company" links={footerNav.company} />
          <FooterColumn title="Legal" links={footerNav.legal} />
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          {socialLinks.map((social) => (
            <a
              key={social.label}
              href={social.href}
              className="text-sm text-slate-400 transition-colors hover:text-slate-200"
              aria-label={`${siteConfig.name} on ${social.label}`}
            >
              {social.label}
            </a>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-white/10 bg-surface-800/50 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Risk Warning
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {RISK_WARNING}
          </p>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-white/5 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center">
          <p>
            © {year} {siteConfig.name}. All rights reserved.
          </p>
          <p>Made for research, practice, and strategy evaluation.</p>
        </div>
      </div>
    </footer>
  );
}
