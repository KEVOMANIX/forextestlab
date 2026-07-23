"use client";

import { Check, Copy, Tag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { WELCOME_OFFER } from "@/lib/promotions";

export function CopyWelcomeCode({
  compact = false,
  bright = false,
}: {
  compact?: boolean;
  bright?: boolean;
}) {
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
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-bold tracking-[0.08em] transition focus-visible:outline-none focus-visible:ring-2 ${
        bright
          ? "border-surface-950/20 bg-white/45 text-surface-950 shadow-sm hover:bg-white/65 focus-visible:ring-surface-950/50"
          : "border-brand-300/30 bg-brand-300/10 text-brand-100 hover:border-brand-300/55 hover:bg-brand-300/15 focus-visible:ring-brand-300"
      } ${
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
      className="relative z-20 border-y border-brand-100/50 bg-gradient-to-r from-brand-300 via-cyan-300 to-accent-300 text-surface-950 shadow-[0_10px_34px_-18px_rgba(45,212,191,.9)]"
    >
      <div className="container-page flex min-h-12 flex-wrap items-center justify-center gap-x-3 gap-y-2 py-2 text-center text-sm">
        <span className="inline-flex items-center gap-2 font-bold">
          <Tag size={15} aria-hidden />
          Launch offer: {WELCOME_OFFER.discountLabel}
        </span>
        <CopyWelcomeCode bright />
        <span className="text-xs font-medium text-surface-800">
          Ends {WELCOME_OFFER.expiresLabel}
        </span>
        <Link
          href="/pricing"
          className="text-xs font-bold text-surface-950 underline decoration-surface-950/35 underline-offset-4 transition hover:text-white"
        >
          View plans
        </Link>
      </div>
    </aside>
  );
}
