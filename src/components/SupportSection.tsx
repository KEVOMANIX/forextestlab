import {
  ArrowRight,
  BookOpenCheck,
  CircleHelp,
  LifeBuoy,
  Mail,
  MessageCircleQuestion,
  ShieldCheck,
} from "lucide-react";

import { ContactForm } from "@/components/ContactForm";
import { siteConfig } from "@/lib/site";

const topics = [
  {
    icon: BookOpenCheck,
    title: "Replay and sessions",
    text: "Questions about starting, resuming, extending, or deleting a session?",
  },
  {
    icon: CircleHelp,
    title: "Account and billing",
    text: "Need help with your plan, checkout, renewal, or account access?",
  },
  {
    icon: MessageCircleQuestion,
    title: "Something not working",
    text: "Tell us what happened and include the page or session where you saw it.",
  },
] as const;

export function SupportSection() {
  return (
    <section className="relative overflow-hidden py-14 sm:py-20 lg:py-24">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_14%_8%,rgba(34,195,160,.12),transparent_30%),radial-gradient(circle_at_86%_28%,rgba(59,107,255,.10),transparent_28%)]" />
      <div className="container-page relative">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-[.86fr_1.14fr] lg:items-start lg:gap-16">
            <div className="lg:sticky lg:top-24">
              <p className="eyebrow w-fit"><LifeBuoy size={14} aria-hidden /> Support desk</p>
              <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
                Help when you need it.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-slate-400 sm:text-lg">
                Send a message to the ForexTestLab team. We’ll review your request and reply by email, usually within one business day.
              </p>

              <div className="mt-8 flex items-center gap-3 rounded-2xl border border-brand-400/20 bg-brand-400/[0.07] p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-400/15 text-brand-300"><ShieldCheck size={19} aria-hidden /></span>
                <div><p className="text-sm font-semibold text-white">Support is available</p><p className="mt-1 text-xs text-slate-400">Email support is monitored during business hours.</p></div>
              </div>

              <a href={`mailto:${siteConfig.emails.support}`} className="mt-5 flex items-center gap-3 text-sm text-brand-300 transition-colors hover:text-brand-200">
                <Mail size={17} aria-hidden /> {siteConfig.emails.support} <ArrowRight size={15} aria-hidden />
              </a>

              <div className="mt-10 border-t border-white/10 pt-7">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Common topics</p>
                <div className="mt-4 space-y-3">
                  {topics.map(({ icon: Icon, title, text }) => (
                    <div key={title} className="flex gap-3 rounded-xl border border-white/10 bg-surface-900/55 p-3.5">
                      <Icon size={17} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />
                      <div><p className="text-sm font-semibold text-white">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-surface-800/55 p-5 shadow-card backdrop-blur sm:p-8">
              <div className="mb-7"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Send a request</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-white">How can we help?</h2><p className="mt-2 text-sm leading-6 text-slate-400">Please include enough detail for us to understand what you were trying to do.</p></div>
              <ContactForm />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
