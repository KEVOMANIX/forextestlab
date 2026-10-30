"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { LEARN_CATEGORIES, type LearnCategory, type LearnSummary } from "@/lib/learn/categories";

import { ArticleCard } from "./ArticleCard";

/** The Learn page body: a featured article, category filters, search, and the article grid. */
export function LearnIndex({ articles }: { articles: LearnSummary[] }) {
  const [category, setCategory] = useState<LearnCategory | "All">("All");
  const [query, setQuery] = useState("");
  const categories = (Object.keys(LEARN_CATEGORIES) as LearnCategory[]).filter(name => articles.some(article => article.category === name));

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return articles.filter(article =>
      (category === "All" || article.category === category)
      && words.every(word => `${article.title} ${article.description} ${article.category}`.toLowerCase().includes(word))
    );
  }, [articles, category, query]);

  return (
    <>
      <div className="flex flex-col gap-4 border-y border-white/10 py-5 md:flex-row md:items-center md:justify-between">
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
        <div className="grid gap-5 pb-16 pt-7 sm:grid-cols-2 lg:grid-cols-3">
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
