import Link from "next/link";

import { isNewArticle, type LearnSummary } from "@/lib/learn/categories";

import { ArticleCover, ArticleMeta, CategoryLabel } from "./ArticleCover";

export function ArticleCard({ article }: { article: LearnSummary }) {
  return (
    <Link href={`/learn/${article.slug}`} className="group block">
      <ArticleCover article={article} sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw" className="mb-4 aspect-[16/9] transition group-hover:border-white/20" />
      <div className="flex items-center gap-2">
        <CategoryLabel category={article.category} />
        {isNewArticle(article.date) && <span className="rounded bg-brand-500 px-1.5 py-0.5 text-[11px] font-bold text-surface-950">New</span>}
      </div>
      <h3 className="mt-2.5 text-lg font-semibold leading-snug text-white transition group-hover:text-brand-300 sm:text-xl">{article.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{article.description}</p>
      <div className="mt-3"><ArticleMeta article={article} /></div>
    </Link>
  );
}
