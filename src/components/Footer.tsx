import Link from "next/link";

import { Logo } from "@/components/Logo";
import {
  PINE_TRADEMARK_NOTICE,
  footerNav,
  siteConfig,
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
      <ul className="mt-2 space-y-0.5 sm:mt-4 sm:space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="-mx-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-slate-400 transition-colors hover:text-slate-200 sm:mx-0 sm:min-h-0 sm:px-0"
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
    <footer className="site-footer border-t border-white/10 bg-surface-900">
      <div className="container-page pb-12 pt-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
              Historical market replay, simulated execution, and performance review.
            </p>
            <div className="mt-6 text-sm">
              {[siteConfig.emails.hello, siteConfig.emails.support].map((email) => (
                <a
                  key={email}
                  href={`mailto:${email}`}
                  className="-mx-2 flex min-h-11 w-fit items-center rounded-lg px-2 text-slate-400 hover:text-slate-200 sm:mx-0 sm:min-h-0 sm:px-0 sm:py-0.5"
                >
                  {email}
                </a>
              ))}
            </div>
          </div>

          <FooterColumn title="Product" links={footerNav.product} />
          <FooterColumn title="Company" links={footerNav.company} />
          <FooterColumn title="Legal" links={footerNav.legal} />
        </div>

      </div>

      <div className="bg-[#0f3d2e]">
        <div className="container-page py-6">
          <div className="flex flex-col items-start justify-between gap-2 text-[13px] text-[#d6e8df] sm:flex-row sm:items-center">
            <p>
              <span className="font-semibold text-[#ffffff]">ForexTestLab</span>
              <span className="mx-2 text-[#5f8b78]">·</span>© {year} {siteConfig.company}
            </p>
            <p className="font-medium text-[#7fd1ad]">Backtest · Analyze · Improve</p>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-[#8fb3a3]">
            Trading involves risk. Simulated results don&apos;t guarantee future performance. Not
            investment advice. {PINE_TRADEMARK_NOTICE}
          </p>
        </div>
      </div>
    </footer>
  );
}
