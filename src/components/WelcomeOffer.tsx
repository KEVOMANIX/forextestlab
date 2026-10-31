"use client";

import { Check, Copy } from "lucide-react";
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
      aria-label="Free and Pro plans"
      className="relative z-20 border-y border-brand-500/15 bg-brand-400/[0.11] text-surface-950"
    >
      <div className="container-page flex min-h-10 flex-wrap items-center justify-center gap-x-3 gap-y-1.5 py-1.5 text-center text-sm">
        <span className="font-bold">Your next trading session starts here.</span>
        <span aria-hidden className="hidden h-3 w-px bg-surface-950/25 sm:block" />
        <span className="text-xs font-semibold text-surface-800">
          Three free replay sessions every month.
        </span>
        <Link
          href="/pricing"
          className="text-xs font-bold text-brand-700 underline decoration-brand-700/30 underline-offset-4 transition hover:text-brand-800"
        >
          Compare plans
        </Link>
      </div>
    </aside>
  );
}
