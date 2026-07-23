"use client";

import {
  initializePaddle,
  type Environments,
  type Paddle,
  type PricePreviewParams,
  type PricePreviewResponse,
} from "@paddle/paddle-js";
import { ArrowRight, Check, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CopyWelcomeCode } from "@/components/WelcomeOffer";
import type { BillingInterval, Tier } from "@/lib/billing/tier-types";

type PaddlePrices = Record<string, string>;

interface LocalizedPricingProps {
  tiers: Tier[];
  countryCode?: string;
  customerEmail?: string;
  paddleCustomerId?: string;
  userId?: string;
  clientToken: string;
  environment: Environments;
  compact?: boolean;
}

function previewItems(tiers: Tier[]): PricePreviewParams["items"] {
  return tiers.flatMap((tier) => [tier.priceId.month, tier.priceId.year].map((priceId) => ({ priceId, quantity: 1 })));
}

function formattedPrices(response: PricePreviewResponse): PaddlePrices {
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
}: LocalizedPricingProps) {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [paddle, setPaddle] = useState<Paddle>();
  const [prices, setPrices] = useState<PaddlePrices>({});
  const [loading, setLoading] = useState(true);
  const [openingPriceId, setOpeningPriceId] = useState<string>();
  const [error, setError] = useState<string>();
  const items = useMemo(() => previewItems(tiers), [tiers]);

  useEffect(() => {
    let active = true;
    initializePaddle({
      token: clientToken,
      environment,
      ...(paddleCustomerId?.startsWith("ctm_") ? { pwCustomer: { id: paddleCustomerId } } : {}),
      eventCallback: (event) => {
        if (event.name === "checkout.closed") setOpeningPriceId(undefined);
        if (event.name === "checkout.error") {
          setError("Checkout could not load. Please try again.");
          setOpeningPriceId(undefined);
        }
      },
    })
      .then((instance) => {
        if (active && instance) setPaddle(instance);
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
    const params: PricePreviewParams = {
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

  function subscribe(tier: Tier) {
    if (!paddle) return;
    const priceId = tier.priceId[interval];
    if (!prices[priceId]) return;
    setError(undefined);
    setOpeningPriceId(priceId);
    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      ...(customerEmail ? { customer: { email: customerEmail } } : {}),
      ...(userId ? { customData: { userId, productKey: `${tier.id}_${interval}` } } : {}),
      settings: {
        displayMode: "overlay",
        variant: "one-page",
        theme: "dark",
        allowLogout: !customerEmail,
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

      {interval === "month" && (
        <div className="mx-auto mt-3 flex w-fit flex-wrap items-center justify-center gap-2 rounded-xl border border-brand-300/15 bg-brand-300/[0.06] px-3 py-2 text-center text-xs text-slate-300">
          <Sparkles size={13} className="text-brand-300" aria-hidden />
          <span>
            Launch offer: 20% off your first month. Apply in checkout.
          </span>
          <CopyWelcomeCode compact />
        </div>
      )}

      {error && <div role="alert" className="mx-auto mt-5 max-w-xl rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-center text-sm text-red-200">{error}</div>}

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {tiers.map((tier) => {
          const priceId = tier.priceId[interval];
          const price = prices[priceId];
          const opening = openingPriceId === priceId;
          return (
            <article
              key={tier.id}
              className={`relative flex flex-col overflow-hidden rounded-3xl border p-6 shadow-card ${tier.featured ? "border-brand-400/55 bg-[linear-gradient(155deg,rgba(34,195,160,.17),rgba(17,23,37,.96)_48%)] shadow-glow lg:-translate-y-2" : "border-white/10 bg-surface-800/70"}`}
            >
              {tier.featured && <span className="absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-brand-400/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-200"><Sparkles size={11} aria-hidden /> Most popular</span>}
              <p className="text-sm font-semibold text-slate-300">{tier.name}</p>
              <div className="mt-5 flex min-h-12 items-end gap-2">
                {loading || !price ? <span className="h-10 w-32 animate-pulse rounded-lg bg-white/10" aria-label="Loading localized price" /> : <strong className="text-4xl font-bold tracking-tight text-white">{price}</strong>}
                <span className="pb-1 text-sm text-slate-500">/ {interval}</span>
              </div>
              <p className="mt-4 min-h-12 text-sm leading-relaxed text-slate-400">{tier.description}</p>
              <ul className={`mt-6 space-y-3 ${compact ? "lg:min-h-40" : "lg:min-h-48"}`}>
                {tier.features.map((feature) => <li key={feature} className="flex gap-2.5 text-sm text-slate-300"><Check size={16} className="mt-0.5 shrink-0 text-brand-300" aria-hidden /><span>{feature}</span></li>)}
              </ul>
              <button
                type="button"
                onClick={() => subscribe(tier)}
                disabled={!paddle || loading || !price || Boolean(openingPriceId)}
                className={tier.featured ? "btn-primary mt-7 w-full" : "btn-secondary mt-7 w-full"}
              >
                {opening ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Opening checkout</> : <>Subscribe <ArrowRight size={15} aria-hidden /></>}
              </button>
            </article>
          );
        })}
      </div>

      <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-500"><ShieldCheck size={14} className="text-brand-300" aria-hidden />Localized totals and secure checkout are provided by Paddle.</p>
    </div>
  );
}
