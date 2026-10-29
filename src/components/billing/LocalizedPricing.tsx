"use client";

import { ArrowRight, Check, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { PRICING_PLAN_FEATURES } from "@/lib/billing/plan-copy";
import { CopyWelcomeCode } from "@/components/WelcomeOffer";
import { WELCOME_OFFER } from "@/lib/promotions";
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
  /** Keep the offer discoverable even when this account cannot claim it. */
  trialAvailable?: boolean;
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
  trialOffer = false,
  trialAvailable = trialOffer,
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

  const trialTier = tiers[0];
  const selectedPrice = trialTier ? prices[trialTier.priceId[interval]] : undefined;

  return (
    <div>
      <div className="mx-auto mb-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
      <div className="flex w-fit rounded-xl border border-white/10 bg-surface-900/80 p-1 shadow-card" aria-label="Billing frequency">
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
      {trialAvailable && trialTier && (
        <div data-testid="trial-callout" className="text-xs">
          {trialOffer ? (
            <button type="button" onClick={() => void subscribe(trialTier)} disabled={!paddle || loading || !selectedPrice || Boolean(openingPriceId)} className="inline-flex items-center gap-1.5 py-2 font-semibold text-brand-200 underline underline-offset-4 disabled:opacity-50">
              {openingPriceId ? <><Loader2 size={14} className="animate-spin" aria-hidden /> Opening checkout</> : <>Try Pro free for 7 days <ArrowRight size={14} aria-hidden /></>}
            </button>
          ) : <Link href="/faq" className="inline-flex items-center gap-1.5 py-2 text-slate-300 underline underline-offset-4" aria-label="7-day trial details. This account isn’t eligible for a free trial.">7-day trial · new members <ArrowRight size={14} aria-hidden /></Link>}
        </div>
      )}
      </div>

      {error && <div role="alert" className="mx-auto mt-5 max-w-xl rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-center text-sm text-red-200">{error}</div>}

      <div className="mx-auto grid max-w-3xl gap-5 md:grid-cols-2">
        <article data-testid="plan-free" className="relative flex flex-col rounded-2xl border border-white/10 bg-surface-900 p-6 shadow-card sm:p-7">
          <p className="text-lg font-semibold text-white">Free</p>
          <div className="mt-5 flex min-h-12 items-end gap-2">
            <strong className="text-5xl font-bold tracking-tight text-white">$0</strong>
            <span className="pb-1 text-sm text-slate-500">/ forever</span>
          </div>
          <p className="mt-3 text-xs text-slate-400">No card required.</p>
          <Link href={browserIdentity.userId ? "/app/backtest" : "/sign-up"} className="btn-secondary mt-5 w-full text-center">
            {browserIdentity.userId ? "Start a free session" : "Start free"} <ArrowRight size={15} aria-hidden />
          </Link>
          <ul className="mt-5 space-y-3 border-t border-white/10 pt-5">
            {PRICING_PLAN_FEATURES.free.map((feature) => (
              <li key={feature} className="flex gap-2.5 text-sm text-slate-300">
                <Check size={16} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </article>

        {tiers.map((tier) => {
          const priceId = tier.priceId[interval];
          const price = prices[priceId];
          const opening = openingPriceId === priceId;
          return (
            <article
              key={tier.id}
              data-testid="plan-pro"
              className={`relative flex flex-col rounded-2xl border bg-surface-900 p-6 shadow-card sm:p-7 ${tier.featured ? "border-brand-400/60" : "border-white/10"}`}
            >
              <div className="flex items-center justify-between gap-3"><p className="text-lg font-semibold text-white">{tier.name}</p><span className="rounded-full border border-brand-400/25 bg-brand-400/10 px-3 py-1 text-[11px] font-semibold text-brand-200">{trialOffer ? "7 days free" : "Full access"}</span></div>
              <div className="mt-5 flex min-h-12 items-end gap-2">
                {loading || !price ? <span className="h-12 w-32 animate-pulse rounded-lg bg-white/10" aria-label="Loading localized price" /> : <strong className="text-5xl font-bold tracking-tight text-white">{price}</strong>}
                <span className="pb-1 text-sm text-slate-500">/ {interval}</span>
              </div>
              <p className="mt-3 text-xs text-slate-400">Every tool. Every market.</p>
              <button
                type="button"
                onClick={() => void subscribe(tier)}
                disabled={!paddle || loading || !price || Boolean(openingPriceId)}
                className={tier.featured ? "btn-primary mt-5 w-full" : "btn-secondary mt-5 w-full"}
              >
                {opening ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Opening checkout</> : <>Choose Pro <ArrowRight size={15} aria-hidden /></>}
              </button>
              <ul className="mt-5 space-y-3 border-t border-brand-400/20 pt-5">
                {PRICING_PLAN_FEATURES.pro.map((feature) => <li key={feature} className="flex gap-2.5 text-sm text-slate-200"><Check size={16} className="mt-0.5 shrink-0 text-brand-300" aria-hidden /><span>{feature}</span></li>)}
              </ul>
            </article>
          );
        })}
      </div>

      <aside data-testid="discount-offer" className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-white/15 bg-surface-900/60 px-5 py-4">
        <p className="text-sm text-slate-200">{WELCOME_OFFER.discountLabel}<span className="ml-2 text-xs text-slate-400">Monthly plans</span></p>
        <CopyWelcomeCode />
      </aside>

      <div className="mx-auto mt-5 max-w-3xl text-center text-xs leading-5 text-slate-400">
        <p data-testid={`terms-${interval}`}>
          {trialOffer
            ? <>Trial: card required. Then {selectedPrice ?? "the checkout total"} / {interval}; renews until canceled. One trial per account.</>
            : <>Charged today; renews every {interval} until canceled.</>}
        </p>
      </div>
      <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-500"><ShieldCheck size={14} className="text-brand-300" aria-hidden />Localized totals and secure checkout are provided by Paddle.</p>
    </div>
  );
}
