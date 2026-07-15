import { WaitlistForm } from "@/components/WaitlistForm";

export function WaitlistSection() {
  return (
    <section id="waitlist" className="scroll-mt-24 py-20 sm:py-24">
      <div className="container-page">
        <div className="mx-auto grid max-w-5xl items-center gap-10 rounded-3xl border border-white/10 bg-surface-800/50 p-6 shadow-card sm:p-10 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Early access</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Be first to test ForexTestLab
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-400">
              Join the waitlist to help shape the platform and get an early
              invitation as the private beta opens. Tell us how you trade so we
              can prioritise the pairs and tools that matter most to you.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-slate-400">
              <li>• No payment required to join.</li>
              <li>• Unsubscribe at any time.</li>
              <li>• We won&apos;t share your details with third parties.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-surface-900/50 p-6">
            <WaitlistForm />
          </div>
        </div>
      </div>
    </section>
  );
}
