import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { learnArticles } from "@/lib/learn";
import { siteConfig } from "@/lib/site";
export function generateStaticParams() { return learnArticles.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const article = learnArticles.find(item => item.slug === slug);
  if (!article) return {};
  return { title: article.title, description: article.description, alternates: { canonical: `/learn/${slug}` }, openGraph: { type: "article", title: article.title, description: article.description } };
}
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const article = learnArticles.find(item => item.slug === slug); if (!article) notFound();
  const structured = { "@context": "https://schema.org", "@type": "Article", headline: article.title, description: article.description, dateModified: article.updated, author: { "@type": "Organization", name: "ForexTestLab", url: siteConfig.url }, mainEntityOfPage: `${siteConfig.url}/learn/${slug}` };
  return <PageShell><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} /><article className="container-page py-12 sm:py-16"><div className="mx-auto max-w-3xl"><Link href="/learn" className="text-sm text-brand-300 hover:text-brand-200">Learn</Link><header className="mt-6 border-b border-white/10 pb-8"><p className="text-sm text-slate-400">{article.category}</p><h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">{article.title}</h1><p className="mt-4 text-lg leading-7 text-slate-300">{article.description}</p><p className="mt-5 text-sm text-slate-400">ForexTestLab · Updated <time dateTime={article.updated}>{new Date(`${article.updated}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</time></p></header><div className="space-y-10 py-9">{article.sections.map(section => <section key={section.title}><h2 className="text-xl font-semibold text-white">{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph} className="mt-4 text-base leading-8 text-slate-300">{paragraph}</p>)}</section>)}</div><div className="border-y border-white/10 py-6"><Link href={article.action.href} className="btn-primary">{article.action.label}</Link></div><aside className="pt-8" aria-label="Related guides"><h2 className="text-lg font-semibold text-white">Keep learning</h2><ul className="mt-3 space-y-3">{learnArticles.filter(item => item.slug !== slug).slice(0, 3).map(item => <li key={item.slug}><Link className="text-sm text-brand-300 hover:text-brand-200" href={`/learn/${item.slug}`}>{item.title}</Link></li>)}</ul></aside></div></article></PageShell>;
}
