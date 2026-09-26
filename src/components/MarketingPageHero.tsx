import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

export function MarketingPageHero({
  eyebrow,
  title,
  description,
  secondary,
}: {
  eyebrow: string;
  title: string;
  description: string;
  secondary?: { label: string; href: string };
}) {
  return (
    <header className="border-b border-white/10">
      <div className="container-page py-14 sm:py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">{eyebrow}</p>
          <h1 className="mt-4 text-balance text-4xl font-bold tracking-[-0.035em] text-white sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-slate-400 sm:text-lg">
            {description}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href={TRIAL_SIGN_UP_PATH} className="btn-primary">
              Start free trial <ArrowRight size={16} aria-hidden />
            </Link>
            {secondary && <Link href={secondary.href} className="btn-secondary">{secondary.label}</Link>}
          </div>
        </div>
      </div>
    </header>
  );
}
