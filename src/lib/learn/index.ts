import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { LEARN_CATEGORIES, type LearnSummary } from "./categories";
import { type Block, countWords, parseBlocks, parseFrontmatter, safeHref } from "./markdown";

export { formatLearnDate, LEARN_CATEGORIES, type LearnCategory, type LearnSummary } from "./categories";

export interface LearnArticle extends LearnSummary {
  author: string;
  takeaways: string[];
  blocks: Block[];
  action: { label: string; href: string };
}

/** Article files live here, one `<slug>.md` per article. */
export const LEARN_DIR = path.join(process.cwd(), "content", "learn");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const header = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(Object.keys(LEARN_CATEGORIES) as [keyof typeof LEARN_CATEGORIES]),
  date: isoDate,
  updated: isoDate.optional(),
  author: z.string().default("ForexTestLab"),
  cover: z.string().regex(/^\/(?!\/)|^https:\/\//, "use a path like /learn/my-image.webp").optional(),
  coverAlt: z.string().default(""),
  featured: z.enum(["true", "false"]).default("false"),
  draft: z.enum(["true", "false"]).default("false"),
  ctaLabel: z.string().default("Start a free backtest"),
  ctaHref: z.string().default("/app/backtest"),
  takeaways: z.array(z.string()).default([]),
}).strict();

/** Reads and checks one article file. Throws with the file name when something is wrong. */
export function parseArticle(slug: string, source: string): LearnArticle & { draft: boolean } {
  const { data, body } = parseFrontmatter(source);
  const parsed = header.safeParse(data);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(issue => `${issue.path.join(".") || "header"}: ${issue.message}`).join("; ");
    throw new Error(`content/learn/${slug}.md: ${problems}`);
  }
  const h = parsed.data;
  const ctaHref = safeHref(h.ctaHref);
  if (!ctaHref) throw new Error(`content/learn/${slug}.md: ctaHref must start with / or https://`);
  return {
    slug,
    title: h.title,
    description: h.description,
    category: h.category,
    date: h.date,
    updated: h.updated ?? h.date,
    author: h.author,
    cover: h.cover ?? null,
    coverAlt: h.coverAlt,
    featured: h.featured === "true",
    draft: h.draft === "true",
    minutes: Math.max(1, Math.ceil(countWords(body) / 200)),
    takeaways: h.takeaways,
    blocks: parseBlocks(body),
    action: { label: h.ctaLabel, href: ctaHref },
  };
}

let cache: LearnArticle[] | null = null;

/** Every published article, newest first. Drafts show only in local development. */
export function getLearnArticles(): LearnArticle[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const showDrafts = process.env.NODE_ENV !== "production";
  cache = readdirSync(LEARN_DIR)
    .filter(file => /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file))
    .map(file => parseArticle(file.slice(0, -3), readFileSync(path.join(LEARN_DIR, file), "utf8")))
    .filter(article => showDrafts || !article.draft)
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  return cache;
}

export function getLearnArticle(slug: string) {
  return getLearnArticles().find(article => article.slug === slug) ?? null;
}

export function toSummary({ slug, title, description, category, date, updated, cover, coverAlt, minutes, featured }: LearnArticle): LearnSummary {
  return { slug, title, description, category, date, updated, cover, coverAlt, minutes, featured };
}

/** Same-category articles first, then the newest others. */
export function relatedArticles(article: LearnArticle, count = 3) {
  const others = getLearnArticles().filter(item => item.slug !== article.slug);
  return [...others.filter(item => item.category === article.category), ...others.filter(item => item.category !== article.category)].slice(0, count);
}
