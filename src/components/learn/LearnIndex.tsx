"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { LEARN_CATEGORIES, type LearnCategory, type LearnSummary } from "@/lib/learn/categories";

import { ArticleCard } from "./ArticleCard";
import { ArticleCover, ArticleMeta, CategoryLabel } from "./ArticleCover";

/** The Learn page body: a featured article, category filters, search, and the article grid. */
export function LearnIndex({ articles }: { articles: LearnSummary[] }) {
  const [category, setCategory] = useState<LearnCategory | "All">("All");
  const [query, setQuery] = useState("");
  const featured = articles.find(article => article.featured) ?? articles[0];
  const categories = (Object.keys(LEARN_CATEGORIES) as LearnCategory[]).filter(name => articles.some(article => article.category === name));
  const browsing = category === "All" && !query.trim();

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return articles.filter(article =>
      (category === "All" || article.category === category)
      && words.every(word => `${article.title} ${article.description} ${article.category}`.toLowerCase().includes(word))
      && !(browsing && article === featured));
  }, [articles, category, query, browsing, featured]);

  return (
    <>
      {featured && browsing && (
        <Link href={`/learn/${featured.slug}`} className="group grid items-center gap-8 border-b border-white/10 pb-12 pt-4 lg:grid-cols-[1.25fr_1fr] lg:gap-10">
          <ArticleCover article={featured} priority sizes="(min-width: 1024px) 680px, 100vw" className="aspect-[16/9] transition group-hover:border-white/20" />
          <div>
            <div className="flex items-center gap-2">
              <CategoryLabel category={featured.category} />
              <span className="rounded bg-brand-500 px-1.5 py-0.5 text-[11px] font-bold text-surface-950">Featured</span>
            </div>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-white transition group-hover:text-brand-300 sm:text-4xl">{featured.title}</h2>
            <p className="mt-4 text-base leading-7 text-slate-300">{featured.description}</p>
            <div className="mt-5"><ArticleMeta article={featured} /></div>
          </div>
        </Link>
      )}

      <div className="flex flex-col gap-4 py-8 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by topic">
          {(["All", ...categories] as const).map(name => (
            <button
              key={name}
              type="button"
              aria-pressed={category === name}
              onClick={() => setCategory(name)}
              className={`h-9 rounded-full border px-4 text-sm font-semibold transition ${category === name ? "border-white bg-white text-surface-950" : "border-white/10 text-slate-300 hover:border-white/25 hover:text-white"}`}
            >
              {name}
            </button>
          ))}
        </div>
        <label className="flex h-11 w-full items-center gap-2 rounded-lg border border-white/10 bg-surface-900 px-3.5 text-slate-400 focus-within:border-brand-400/60 md:w-72">
          <Search size={16} aria-hidden />
          <span className="sr-only">Search guides</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search guides"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-400 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-slate-400 hover:text-white"><X size={15} /></button>}
        </label>
      </div>

      <p className="sr-only" aria-live="polite">{shown.length} guides shown</p>
      {shown.length > 0 ? (
        <div className="grid gap-x-7 gap-y-12 pb-16 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(article => <ArticleCard key={article.slug} article={article} />)}
        </div>
      ) : (
        <div className="mb-16 rounded-xl border border-dashed border-white/15 px-6 py-14 text-center">
          <p className="font-semibold text-white">No guides match {query.trim() ? `"${query.trim()}"` : "this topic"} yet.</p>
          <button type="button" onClick={() => { setQuery(""); setCategory("All"); }} className="mt-3 text-sm font-semibold text-brand-300 hover:text-brand-200">Show all guides</button>
        </div>
      )}
    </>
  );
}
