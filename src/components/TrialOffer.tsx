import Link from "next/link";
import { ArrowRight, CalendarRange, Check, MonitorSmartphone } from "lucide-react";
import { TRIAL_SIGN_UP_PATH } from "@/lib/site";

export function TrialOffer({
  href = TRIAL_SIGN_UP_PATH,
  compact = false,
  variant = "default",
}: {
  href?: string;
  compact?: boolean;
  variant?: "default" | "hero";
}) {
  const hero = variant === "hero";

  return (
    <aside className={`relative overflow-hidden border border-brand-400/35 shadow-card ${
      hero
        ? "h-full rounded-[1.75rem] bg-[linear-gradient(145deg,rgba(34,195,160,.22),rgba(14,20,32,.98)_52%,rgba(59,107,255,.12))] p-6 sm:p-7"
        : `rounded-3xl bg-[linear-gradient(135deg,rgba(34,195,160,.16),rgba(17,23,37,.96)_58%)] ${compact ? "p-5 sm:p-6" : "p-6 sm:p-8"}`
    }`}>
      <div aria-hidden className={`absolute rounded-full bg-brand-400/20 blur-3xl ${hero ? "-right-12 -top-16 h-56 w-56" : "-right-16 -top-20 h-52 w-52"}`} />
      <div className={`relative flex flex-col gap-6 ${hero ? "h-full justify-between" : "lg:flex-row lg:items-center lg:justify-between"}`}>
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-brand-300/25 bg-brand-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-200">
              Free trial
            </span>
            <span className="text-xs font-medium text-slate-400">No payment required</span>
          </div>
          <h2 className={`${hero ? "mt-5 text-2xl sm:text-[2rem]" : compact ? "mt-3 text-xl" : "mt-4 text-2xl sm:text-3xl"} font-bold tracking-tight text-white`}>
            Test three sessions before choosing a plan
          </h2>
          <p className={`mt-2 text-sm leading-relaxed text-slate-300 ${hero ? "max-w-lg" : "sm:text-base"}`}>
            Each trial opens EUR/USD on a randomly selected 31-day historical
            period. The trial includes a maximum of three sessions on each device.
          </p>
        </div>
        <div className={hero ? "" : "shrink-0"}>
          <ul className={`mb-4 grid gap-2 text-sm text-slate-300 ${hero ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-1"}`}>
            <li className={`flex items-center gap-2 ${hero ? "rounded-xl border border-white/10 bg-surface-950/35 px-3 py-2.5" : ""}`}><CalendarRange size={15} className="shrink-0 text-brand-300" aria-hidden /><span>One month of data</span></li>
            <li className={`flex items-center gap-2 ${hero ? "rounded-xl border border-white/10 bg-surface-950/35 px-3 py-2.5" : ""}`}><MonitorSmartphone size={15} className="shrink-0 text-brand-300" aria-hidden /><span>Three sessions</span></li>
            <li className={`flex items-center gap-2 ${hero ? "rounded-xl border border-white/10 bg-surface-950/35 px-3 py-2.5" : ""}`}><Check size={15} className="shrink-0 text-brand-300" aria-hidden /><span>Instant replay</span></li>
          </ul>
          <Link href={href} className={`btn-primary w-full px-5 shadow-glow ${hero ? "py-3.5" : "py-3"}`}>
            Start free trial
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </aside>
  );
}
