import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/PageShell";
import { ArticleBody } from "@/components/learn/ArticleBody";
import { ArticleCard } from "@/components/learn/ArticleCard";
import { ArticleCover, CategoryLabel } from "@/components/learn/ArticleCover";
import { ReadingProgress, ShareLinks, TableOfContents } from "@/components/learn/ArticleReadingAids";
import { formatLearnDate, getLearnArticle, getLearnArticles, relatedArticles, toSummary } from "@/lib/learn";
import { siteConfig } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return getLearnArticles().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getLearnArticle(slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: `/learn/${slug}` },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.description,
      publishedTime: article.date,
      modifiedTime: article.updated,
      ...(article.cover ? { images: [{ url: article.cover, alt: article.coverAlt }] } : {}),
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getLearnArticle(slug);
  if (!article) notFound();

  const url = `${siteConfig.url}/learn/${slug}`;
  const headings = article.blocks.flatMap(block => (block.t === "h2" ? [{ id: block.id, text: block.text }] : []));
  const structured = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.date,
    dateModified: article.updated,
    ...(article.cover ? { image: `${siteConfig.url}${article.cover}` } : {}),
    author: { "@type": "Organization", name: article.author, url: siteConfig.url },
    mainEntityOfPage: url,
  };

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} />
      <ReadingProgress />
      <article className="container-page">
        <nav aria-label="Breadcrumb" className="pt-10 text-sm text-slate-400 sm:pt-12">
          <Link href="/learn" className="text-brand-300 hover:text-brand-200">Learn</Link>
          <span className="mx-2" aria-hidden>/</span>
          <span>{article.category}</span>
        </nav>

        <header className="max-w-3xl pb-8 pt-6">
          <CategoryLabel category={article.category} />
          <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl">{article.title}</h1>
          <p className="mt-4 text-lg leading-8 text-slate-300 sm:text-xl">{article.description}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-900 text-sm font-bold text-surface-950">
              {article.author.split(/\s+/).map(word => word[0]).join("").slice(0, 2).toUpperCase()}
            </span>
            <div className="text-sm">
              <p className="font-semibold text-white">{article.author}</p>
              <p className="text-slate-400">
                {article.updated !== article.date ? "Updated " : ""}
                <time dateTime={article.updated}>{formatLearnDate(article.updated)}</time> · {article.minutes} min read
              </p>
            </div>
            <div className="ml-auto"><ShareLinks url={url} title={article.title} /></div>
          </div>
        </header>

        {article.cover && (
          <ArticleCover article={article} priority sizes="(min-width: 1280px) 1200px, 100vw" className="mb-10 aspect-[2/1] sm:aspect-[21/9]" />
        )}

        <div className="grid gap-12 xl:grid-cols-[200px_minmax(0,720px)]">
          <aside className="hidden xl:block">
            <div className="sticky top-28"><TableOfContents headings={headings} /></div>
          </aside>

          <div className="min-w-0">
            {article.takeaways.length > 0 && (
              <div className="mb-10 rounded-xl border border-brand-400/30 bg-brand-400/[.07] px-5 py-5 sm:px-6">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-300">Key takeaways</p>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-base leading-7 text-slate-200 marker:text-brand-400">
                  {article.takeaways.map(item => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}

            <ArticleBody blocks={article.blocks} />

            <div className="my-12 flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-surface-600 bg-surface-900 bg-[radial-gradient(500px_160px_at_100%_0%,rgba(69,214,168,0.14),transparent)] p-6 sm:p-7">
              <div>
                <p className="text-xl font-semibold text-white">Try it on your own trades</p>
                <p className="mt-1 text-[15px] text-slate-300">Replay real market history and see these numbers for your own decisions.</p>
              </div>
              <Link href={article.action.href} className="btn-primary">{article.action.label} <ArrowRight size={16} aria-hidden /></Link>
            </div>

            <p className="border-t border-white/10 pt-5 text-sm leading-6 text-slate-400">
              Educational content only, not financial advice. Historical simulation does not predict live results.
            </p>
          </div>
        </div>

        <section aria-label="Related guides" className="mt-16 border-t border-white/10 pb-20 pt-12">
          <h2 className="mb-7 text-2xl font-semibold text-white">Keep reading</h2>
          <div className="grid gap-x-7 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {relatedArticles(article).map(item => <ArticleCard key={item.slug} article={toSummary(item)} />)}
          </div>
        </section>
      </article>
    </PageShell>
  );
}
