"use client";

import { Check, Copy, Tag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { WELCOME_OFFER } from "@/lib/promotions";

export function CopyWelcomeCode({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(WELCOME_OFFER.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copyCode}
      aria-label={`Copy discount code ${WELCOME_OFFER.code}`}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-brand-300/30 bg-brand-300/10 font-bold tracking-[0.08em] text-brand-100 transition hover:border-brand-300/55 hover:bg-brand-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
        compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      }`}
    >
      {copied ? <Check size={compact ? 12 : 14} aria-hidden /> : <Copy size={compact ? 12 : 14} aria-hidden />}
      {copied ? "Copied" : WELCOME_OFFER.code}
    </button>
  );
}

export function WelcomeOfferBanner() {
  return (
    <aside
      aria-label="Launch offer"
      className="relative z-20 border-y border-brand-300/15 bg-[linear-gradient(90deg,rgba(34,195,160,.06),rgba(59,107,255,.08),rgba(34,195,160,.06))]"
    >
      <div className="container-page flex min-h-12 flex-wrap items-center justify-center gap-x-3 gap-y-2 py-2 text-center text-sm">
        <span className="inline-flex items-center gap-2 font-semibold text-slate-100">
          <Tag size={15} className="text-brand-300" aria-hidden />
          Launch offer: {WELCOME_OFFER.discountLabel}
        </span>
        <CopyWelcomeCode />
        <span className="text-xs text-slate-500">
          Ends {WELCOME_OFFER.expiresLabel}
        </span>
        <Link
          href="/pricing"
          className="text-xs font-semibold text-brand-200 underline decoration-brand-300/35 underline-offset-4 transition hover:text-white"
        >
          View plans
        </Link>
      </div>
    </aside>
  );
}
