import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { PageShell } from "@/components/PageShell";

export function BillingResultCard({
  icon: Icon,
  tone,
  eyebrow,
  title,
  message,
  reference,
  children,
}: {
  icon: LucideIcon;
  tone: "success" | "pending" | "failed";
  eyebrow: string;
  title: string;
  message: string;
  reference?: string;
  children?: React.ReactNode;
}) {
  const colors = tone === "success" ? "bg-brand-400/10 text-brand-300 border-brand-400/25" : tone === "pending" ? "bg-amber-400/10 text-amber-300 border-amber-400/25" : "bg-bear/10 text-bear border-bear/25";
  return <PageShell><section className="min-h-[70vh] py-20 sm:py-24"><div className="container-page max-w-xl"><div className="card p-6 text-center sm:p-9"><span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl border ${colors}`}><Icon size={26} aria-hidden/></span><p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-brand-300">{eyebrow}</p><h1 className="mt-3 text-3xl font-bold tracking-tight text-white">{title}</h1><p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-400">{message}</p>{reference&&<div className="mx-auto mt-5 max-w-sm rounded-lg border border-white/10 bg-surface-900/70 px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">Payment reference</p><p className="mt-1 break-all font-mono text-xs text-slate-300">{reference}</p></div>}<div className="mt-7">{children}</div><p className="mt-6 text-xs text-slate-500">Need help? <Link href="/contact" className="text-brand-300 hover:underline">Contact support</Link></p></div></div></section></PageShell>;
}
