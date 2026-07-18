import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

import {
  annualSavingPercent,
  formatPlanPrice,
  getBillingCatalog,
} from "@/lib/billing/catalog";

export function PricingCards({ compact = false }: { compact?: boolean }) {
  const plans = getBillingCatalog();
  const monthly = plans.find((plan) => plan.key === "pro_monthly_usd")!;
  const annual = plans.find((plan) => plan.key === "pro_annual_usd")!;
  const saving = annualSavingPercent(monthly.amount, annual.amount);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {plans.map((plan) => {
        const free = plan.key === "free";
        const annualPlan = plan.key === "pro_annual_usd";
        const href = free
          ? "/sign-up"
          : `/account/billing?plan=${encodeURIComponent(plan.key)}`;
        return (
          <article
            key={plan.key}
            className={`relative flex flex-col rounded-2xl border p-6 shadow-card ${
              plan.featured
                ? "border-brand-400/50 bg-[linear-gradient(155deg,rgba(34,195,160,.15),rgba(17,23,37,.92)_48%)] shadow-glow"
                : "border-white/10 bg-surface-800/65"
            }`}
          >
            {plan.featured && (
              <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-brand-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-200">
                <Sparkles size={11} aria-hidden /> Most flexible
              </span>
            )}
            {annualPlan && saving > 0 && (
              <span className="absolute right-4 top-4 rounded-full bg-blue-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-300">
                Save {saving}%
              </span>
            )}
            <p className="text-sm font-semibold text-slate-300">{plan.name}</p>
            <div className="mt-5 flex items-end gap-2">
              <strong className="text-4xl font-bold tracking-tight text-white">
                {free ? "$0" : formatPlanPrice(plan.amount, plan.currency)}
              </strong>
              <span className="pb-1 text-sm text-slate-500">
                {free ? "forever" : `/ ${plan.interval}`}
              </span>
            </div>
            {annualPlan && (
              <p className="mt-2 text-xs text-brand-300">
                {formatPlanPrice(Math.round(plan.amount / 12), plan.currency)} per month, billed annually
              </p>
            )}
            <p className="mt-4 min-h-10 text-sm leading-relaxed text-slate-400">{plan.description}</p>
            <ul className={`mt-6 space-y-3 ${compact ? "lg:min-h-40" : "lg:min-h-48"}`}>
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2.5 text-sm text-slate-300">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Link href={href} className={plan.featured ? "btn-primary mt-7 w-full" : "btn-secondary mt-7 w-full"}>
              {free ? "Start free" : annualPlan ? "Choose annual" : "Choose monthly"}
            </Link>
          </article>
        );
      })}
    </div>
  );
}
