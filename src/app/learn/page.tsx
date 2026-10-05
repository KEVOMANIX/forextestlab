import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { learnArticles } from "@/lib/learn";
export const metadata: Metadata = { title: "Learn", description: "Practical guides to backtesting, journaling, analytics, and ForexTestLab chart tools.", alternates: { canonical: "/learn" } };
export default function LearnPage() {
  return <PageShell><section className="container-page py-14 sm:py-20"><h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Learn to test and review.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">Practical guides for your first replay, better trade records, and clearer performance reviews.</p><div className="mt-10 divide-y divide-white/10">{learnArticles.map(article => <article key={article.slug} className="grid gap-3 py-7 sm:grid-cols-[10rem_1fr]"><p className="text-sm text-slate-400">{article.category}</p><div><h2 className="text-xl font-semibold text-white"><Link className="hover:text-brand-300" href={`/learn/${article.slug}`}>{article.title}</Link></h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{article.description}</p><Link href={`/learn/${article.slug}`} className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-brand-300 hover:text-brand-200">Read guide →</Link></div></article>)}</div></section></PageShell>;
}
