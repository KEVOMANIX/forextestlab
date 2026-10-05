import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Navbar } from "@/components/Navbar";
import { ProductPreview } from "@/components/ProductPreview";
import { WelcomeOfferBanner } from "@/components/WelcomeOffer";

const EXPLORE = [
  { href: "/features", title: "Explore the workspace", text: "See the replay, execution, journal, and analytics tools." },
  { href: "/markets", title: "Explore the markets", text: "Search available instruments and inspect their replay history." },
  { href: "/learn", title: "Learn the workflow", text: "Follow practical guides to replay, journaling, and performance review." },
] as const;

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main id="main" className="pt-16">
        <WelcomeOfferBanner />
        <Hero />
        <ProductPreview />
        <section className="border-t border-white/10 py-16 sm:py-20">
          <div className="container-page">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight text-white">Build a repeatable testing routine.</h2>
              <p className="mt-3 text-base leading-7 text-slate-400">Choose a market, practise your decisions, and use your journal and results to review the test.</p>
            </div>
            <div className="mt-9 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3">
              {EXPLORE.map(({ href, title, text }) => (
                <Link key={href} href={href} className="group bg-surface-950 p-6 transition-colors hover:bg-surface-900/80 sm:p-7">
                  <h3 className="flex items-center justify-between gap-4 font-semibold text-white">{title}<ArrowRight size={16} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-brand-300" aria-hidden /></h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
