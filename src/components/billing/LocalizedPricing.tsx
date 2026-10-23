"use client";

import { ArrowRight, Check, Loader2, ShieldCheck, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { FREE_PLAN_FEATURES } from "@/lib/billing/plan-copy";
import { PRO_TRIAL_DAYS } from "@/lib/billing/plan-limits";
import type { BillingInterval, Tier } from "@/lib/billing/tier-types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type PaddlePrices = Record<string, string>;
type Environments = "sandbox" | "production";

interface PaddlePricePreviewParams {
  items: { priceId: string; quantity: number }[];
  address?: { countryCode: string };
}

interface PaddlePricePreviewResponse {
  data: {
    details: {
      lineItems: {
        price: { id: string };
        formattedTotals: { total: string };
      }[];
    };
  };
}

interface PaddleApi {
  Initialized?: boolean;
  Environment: { set(environment: Environments): void };
  Initialize(options: PaddleInitialization): void;
  Update(options: Partial<PaddleInitialization>): void;
  PricePreview(params: PaddlePricePreviewParams): Promise<PaddlePricePreviewResponse>;
  Checkout: {
    open(options: {
      /** Created by /api/billing/checkout, which chooses the price. */
      transactionId: string;
      customer?: { email: string };
      settings: {
        displayMode: "overlay";
        variant: "one-page";
        theme: "dark";
        allowLogout: boolean;
        successUrl: string;
      };
    }): void;
  };
}

interface PaddleInitialization {
  token: string;
  pwCustomer?: { id: string };
  eventCallback?: (event: { name: string }) => void;
}

declare global {
  interface Window {
    Paddle?: PaddleApi;
  }
}

let paddleScriptPromise: Promise<PaddleApi> | undefined;

function loadPaddleScript(): Promise<PaddleApi> {
  if (window.Paddle) return Promise.resolve(window.Paddle);
  if (paddleScriptPromise) return paddleScriptPromise;
  paddleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => window.Paddle
      ? resolve(window.Paddle)
      : reject(new Error("Paddle.js did not initialize."));
    script.onerror = () => reject(new Error("Paddle.js could not be loaded."));
    document.head.appendChild(script);
  });
  return paddleScriptPromise;
}

interface LocalizedPricingProps {
  tiers: Tier[];
  countryCode?: string;
  customerEmail?: string;
  paddleCustomerId?: string;
  userId?: string;
  clientToken: string;
  environment: Environments;
  compact?: boolean;
  /**
   * Whether this visitor would get the 7-day trial: signed out (any new
   * account can), or signed in and eligible. The server decides again at
   * checkout; this only chooses the wording.
   */
  trialOffer?: boolean;
}

/** "30 October 2026": the trial's end if it starts today. */
function trialEndLabel(days = PRO_TRIAL_DAYS): string {
  const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(end);
}

function previewItems(tiers: Tier[]): PaddlePricePreviewParams["items"] {
  return tiers.flatMap((tier) => [tier.priceId.month, tier.priceId.year].map((priceId) => ({ priceId, quantity: 1 })));
}

function formattedPrices(response: PaddlePricePreviewResponse): PaddlePrices {
  return response.data.details.lineItems.reduce<PaddlePrices>((prices, item) => {
    prices[item.price.id] = item.formattedTotals.total;
    return prices;
  }, {});
}

export function LocalizedPricing({
  tiers,
  countryCode,
  customerEmail,
  paddleCustomerId,
  userId,
  clientToken,
  environment,
  compact = false,
  trialOffer = false,
}: LocalizedPricingProps) {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [paddle, setPaddle] = useState<PaddleApi>();
  const [prices, setPrices] = useState<PaddlePrices>({});
  const [loading, setLoading] = useState(true);
  const [openingPriceId, setOpeningPriceId] = useState<string>();
  const [error, setError] = useState<string>();
  const [browserIdentity, setBrowserIdentity] = useState<{
    email?: string;
    userId?: string;
  }>({ email: customerEmail, userId });
  const items = useMemo(() => previewItems(tiers), [tiers]);

  useEffect(() => {
    if (customerEmail && userId) return;
    const supabase = createBrowserSupabaseClient();
    void supabase?.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) setBrowserIdentity({ email: user.email, userId: user.id });
    });
  }, [customerEmail, userId]);

  useEffect(() => {
    let active = true;
    const initialization: PaddleInitialization = {
      token: clientToken,
      ...(paddleCustomerId?.startsWith("ctm_") ? { pwCustomer: { id: paddleCustomerId } } : {}),
      eventCallback: (event) => {
        if (event.name === "checkout.closed") setOpeningPriceId(undefined);
        if (event.name === "checkout.error") {
          setError("Checkout could not load. Please try again.");
          setOpeningPriceId(undefined);
        }
      },
    };
    loadPaddleScript()
      .then((instance) => {
        if (environment === "sandbox") instance.Environment.set("sandbox");
        if (instance.Initialized) instance.Update(initialization);
        else instance.Initialize(initialization);
        if (active) setPaddle(instance);
      })
      .catch(() => {
        if (active) {
          setError("Localized pricing is temporarily unavailable.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [clientToken, environment, paddleCustomerId]);

  useEffect(() => {
    if (!paddle) return;
    let active = true;
    const params: PaddlePricePreviewParams = {
      items,
      ...(countryCode ? { address: { countryCode } } : {}),
    };
    setLoading(true);
    setError(undefined);
    paddle.PricePreview(params)
      .then((response) => {
        if (active) setPrices(formattedPrices(response));
      })
      .catch(() => {
        if (active) setError("We could not load prices for your location. Please refresh and try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [countryCode, items, paddle]);

  async function subscribe(tier: Tier) {
    if (!paddle) return;
    const priceId = tier.priceId[interval];
    if (!prices[priceId]) return;
    // A plan belongs to an account, and the trial is one per account, so
    // checkout starts after sign-in.
    if (!browserIdentity.userId) {
      window.location.href = `/sign-up?next=${encodeURIComponent("/pricing")}`;
      return;
    }
    setError(undefined);
    setOpeningPriceId(priceId);
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { ok?: boolean; transactionId?: string; error?: string } | null;
    if (!response?.ok || !result?.transactionId) {
      setError(result?.error ?? "Checkout could not be opened. Please try again.");
      setOpeningPriceId(undefined);
      return;
    }
    paddle.Checkout.open({
      transactionId: result.transactionId,
      ...(browserIdentity.email ? { customer: { email: browserIdentity.email } } : {}),
      settings: {
        displayMode: "overlay",
        variant: "one-page",
        theme: "dark",
        allowLogout: false,
        successUrl: `${window.location.origin}/welcome`,
      },
    });
  }

  return (
    <div>
      <div className="mx-auto flex w-fit rounded-xl border border-white/10 bg-surface-900/80 p-1 shadow-card" aria-label="Billing frequency">
        {(["month", "year"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={interval === value}
            onClick={() => setInterval(value)}
            className={`min-w-28 rounded-lg px-4 py-2 text-sm font-semibold transition ${interval === value ? "bg-brand-400 text-surface-950 shadow-glow" : "text-slate-400 hover:text-white"}`}
          >
            {value === "month" ? "Monthly" : "Yearly"}
          </button>
        ))}
      </div>

      {error && <div role="alert" className="mx-auto mt-5 max-w-xl rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-center text-sm text-red-200">{error}</div>}

      <div className="mx-auto mt-8 grid max-w-5xl gap-5 lg:grid-cols-2">
        <article className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface-800/70 p-6 shadow-card">
          <p className="text-sm font-semibold text-slate-300">Free</p>
          <div className="mt-5 flex min-h-12 items-end gap-2">
            <strong className="text-4xl font-bold tracking-tight text-white">$0</strong>
            <span className="pb-1 text-sm text-slate-500">/ forever</span>
          </div>
          <p className="mt-4 min-h-12 text-sm leading-relaxed text-slate-400">
            Backtest the major pairs every month, for as long as you like.
          </p>
          <ul className={`mt-6 space-y-3 ${compact ? "lg:min-h-40" : "lg:min-h-48"}`}>
            {FREE_PLAN_FEATURES.map((feature) => (
              <li key={feature} className="flex gap-2.5 text-sm text-slate-300">
                <Check size={16} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <Link href={browserIdentity.userId ? "/app/backtest" : "/sign-up"} className="btn-secondary mt-auto w-full text-center">
            {browserIdentity.userId ? "Start a free session" : "Start free"} <ArrowRight size={15} aria-hidden />
          </Link>
        </article>

        {tiers.map((tier) => {
          const priceId = tier.priceId[interval];
          const price = prices[priceId];
          const opening = openingPriceId === priceId;
          return (
            <article
              key={tier.id}
              className={`relative flex h-full flex-col overflow-hidden rounded-3xl border p-6 shadow-card ${tier.featured ? "border-brand-400/55 bg-[linear-gradient(155deg,rgba(14,165,233,.17),rgba(10,32,64,.96)_48%)] shadow-glow" : "border-white/10 bg-surface-800/70"}`}
            >
              {tier.featured && <span className="absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-brand-400/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-200"><Star size={11} aria-hidden /> Most popular</span>}
              <p className="text-sm font-semibold text-slate-300">{tier.name}</p>
              <div className="mt-5 flex min-h-12 items-end gap-2">
                {loading || !price ? <span className="h-10 w-32 animate-pulse rounded-lg bg-white/10" aria-label="Loading localized price" /> : <strong className="text-4xl font-bold tracking-tight text-white">{price}</strong>}
                <span className="pb-1 text-sm text-slate-500">/ {interval}</span>
              </div>
              <p className="mt-4 min-h-12 text-sm leading-relaxed text-slate-400">{tier.description}</p>
              <ul className={`mt-6 space-y-3 ${compact ? "lg:min-h-40" : "lg:min-h-48"}`}>
                {tier.features.map((feature) => <li key={feature} className="flex gap-2.5 text-sm text-slate-300"><Check size={16} className="mt-0.5 shrink-0 text-brand-300" aria-hidden /><span>{feature}</span></li>)}
              </ul>
              {/* The terms, before checkout opens: plan, price, interval, when
                  the trial ends, and that the card is charged automatically. */}
              <p className="mt-6 rounded-xl border border-white/10 bg-surface-950/40 px-4 py-3 text-xs leading-5 text-slate-300" data-testid={`terms-${interval}`}>
                {trialOffer ? (
                  <><strong className="text-white">7 days free</strong>, then <strong className="text-white">{price ?? "the price shown"} per {interval}</strong> for Pro {interval === "month" ? "Monthly" : "Yearly"}. If you start today, your trial ends on <strong className="text-white">{trialEndLabel()}</strong> and your card is charged automatically then unless you cancel before. Cancel any time from Account → Billing; Pro stays until the trial ends and you are not charged.</>
                ) : (
                  <>Pro {interval === "month" ? "Monthly" : "Yearly"}: <strong className="text-white">{price ?? "the price shown"} per {interval}</strong>, charged today and renewed automatically every {interval} until you cancel. Cancel any time from Account → Billing; Pro stays until the end of the period you paid for.</>
                )}
              </p>
              <button
                type="button"
                onClick={() => void subscribe(tier)}
                disabled={!paddle || loading || !price || Boolean(openingPriceId)}
                className={tier.featured ? "btn-primary mt-4 w-full" : "btn-secondary mt-4 w-full"}
              >
                {opening ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Opening checkout</> : <>{trialOffer ? "Start 7-day free trial" : "Subscribe"} <ArrowRight size={15} aria-hidden /></>}
              </button>
            </article>
          );
        })}
      </div>

      <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-500"><ShieldCheck size={14} className="text-brand-300" aria-hidden />Localized totals and secure checkout are provided by Paddle.</p>
    </div>
  );
}
