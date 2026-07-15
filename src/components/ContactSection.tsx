import { LifeBuoy, Mail } from "lucide-react";

import { ContactForm } from "@/components/ContactForm";
import { siteConfig } from "@/lib/site";

export function ContactSection({ id }: { id?: string }) {
  return (
    <section id={id} className="scroll-mt-24 py-20 sm:py-24">
      <div className="container-page">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-2xl">
            <p className="eyebrow">Contact</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Get in touch
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-400">
              Questions, feedback, or partnership ideas? Send us a message and
              we&apos;ll get back to you.
            </p>
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-[300px_1fr]">
            <div className="space-y-4">
              <a
                href={`mailto:${siteConfig.emails.hello}`}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-surface-800/40 p-4 transition-colors hover:border-white/20"
              >
                <Mail size={20} className="mt-0.5 text-brand-300" aria-hidden />
                <span>
                  <span className="block text-sm font-semibold text-white">
                    General enquiries
                  </span>
                  <span className="text-sm text-slate-400">
                    {siteConfig.emails.hello}
                  </span>
                </span>
              </a>
              <a
                href={`mailto:${siteConfig.emails.support}`}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-surface-800/40 p-4 transition-colors hover:border-white/20"
              >
                <LifeBuoy
                  size={20}
                  className="mt-0.5 text-brand-300"
                  aria-hidden
                />
                <span>
                  <span className="block text-sm font-semibold text-white">
                    Support
                  </span>
                  <span className="text-sm text-slate-400">
                    {siteConfig.emails.support}
                  </span>
                </span>
              </a>
            </div>

            <div className="rounded-2xl border border-white/10 bg-surface-800/40 p-6">
              <ContactForm />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
