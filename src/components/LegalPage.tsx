import type { ReactNode } from "react";

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  intro?: ReactNode;
  children: ReactNode;
}

/** Consistent wrapper + prose styling for legal / policy documents. */
export function LegalPage({
  title,
  lastUpdated,
  intro,
  children,
}: LegalPageProps) {
  return (
    <div className="container-page py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">Legal</p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: {lastUpdated}</p>

        <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
          <p className="text-sm leading-relaxed text-amber-200/90">
            This document is a general website draft provided for informational
            purposes only. It is not legal advice. Please have a qualified legal
            professional review and adapt it for your jurisdiction before
            commercial launch.
          </p>
        </div>

        {intro && (
          <div className="mt-8 text-base leading-relaxed text-slate-300">
            {intro}
          </div>
        )}

        <div className="legal-prose mt-8 space-y-8">{children}</div>
      </div>
    </div>
  );
}

/** A titled section within a legal document. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-white">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-400">
        {children}
      </div>
    </section>
  );
}
