"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { useTrialOffer } from "@/lib/billing/trial-offer-client";
import { PRO_TRIAL_PATH, PRO_TRIAL_SIGN_UP_PATH } from "@/lib/site";

const DISMISS_KEY = "ftl_trial_spotlight_dismissed";
const DISMISS_DAYS = 7;
const HIDDEN_ON = ["/pricing", "/sign-up", "/sign-in", "/welcome", "/account"];

function dismissedRecently(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/** A dismissible corner card on public pages advertising the 14-day Pro trial. */
export function TrialSpotlight() {
  const pathname = usePathname() ?? "/";
  const hiddenHere = HIDDEN_ON.some((path) => pathname.startsWith(path));
  const [ready, setReady] = useState(false);
  const offer = useTrialOffer(ready && !hiddenHere);

  useEffect(() => {
    if (hiddenHere || dismissedRecently()) return;
    const timer = window.setTimeout(() => setReady(true), 3500);
    return () => window.clearTimeout(timer);
  }, [hiddenHere]);

  if (!ready || hiddenHere || !offer?.eligible) return null;

  const dismiss = () => {
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage unavailable */ }
    setReady(false);
  };

  return (
    <aside
      aria-label="14-day Pro trial"
      className="trial-spotlight fixed inset-x-4 bottom-24 z-40 animate-fade-up rounded-2xl border p-4 text-left sm:inset-x-auto sm:right-5 sm:w-[19rem]"
    >
      <button type="button" onClick={dismiss} aria-label="Dismiss trial offer" className="trial-spotlight-close absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-lg text-slate-400">
        <X size={15} aria-hidden />
      </button>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-200">One per account</p>
      <p className="mt-1 text-xl font-extrabold tracking-tight text-white">14 days of Pro, on us</p>
      <ul className="my-3 flex flex-wrap gap-1.5 text-[11px] text-slate-300">
        {["All markets", "AI Analyst", "100k-candle tests", "Exports"].map((chip) => (
          <li key={chip} className="trial-spotlight-chip rounded-full border px-2.5 py-0.5">{chip}</li>
        ))}
      </ul>
      <Link href={offer.signedIn ? PRO_TRIAL_PATH : PRO_TRIAL_SIGN_UP_PATH} className="btn-primary w-full py-2.5 text-sm shadow-glow">
        Start free trial
      </Link>
    </aside>
  );
}
