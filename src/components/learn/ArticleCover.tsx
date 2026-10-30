import Image from "next/image";

import { LEARN_CATEGORIES, type LearnSummary } from "@/lib/learn/categories";

/** Deterministic candles for articles without a cover image, tinted by category. */
function generatedCandles(slug: string, colour: string) {
  let seed = [...slug].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 233280, 7);
  const next = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const candles = [];
  let y = 230;
  for (let i = 0, x = 40; i < 26; i++, x += 28) {
    const open = y;
    const close = open + (next() - 0.47) * 46;
    const high = Math.min(open, close) - next() * 18;
    const low = Math.max(open, close) + next() * 18;
    const up = close < open;
    candles.push(
      <g key={i}>
        <line x1={x} x2={x} y1={high} y2={low} stroke={up ? colour : "#5b7a70"} strokeWidth={2} />
        <rect x={x - 7} y={Math.min(open, close)} width={14} height={Math.max(3, Math.abs(close - open))} rx={2} fill={up ? colour : "#3c5b50"} />
      </g>,
    );
    y = Math.max(90, Math.min(330, close));
  }
  return candles;
}

/** An article's cover image, or a generated chart in its category colour. */
export function ArticleCover({ article, sizes, priority = false, className = "aspect-[16/9]" }: {
  article: Pick<LearnSummary, "slug" | "category" | "cover" | "coverAlt">;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const colour = LEARN_CATEGORIES[article.category];
  return (
    <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-surface-900 ${className}`}>
      {article.cover ? (
        <Image src={article.cover} alt={article.coverAlt} fill sizes={sizes} priority={priority} className="object-cover object-left-top" />
      ) : (
        <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <radialGradient id={`glow-${article.slug}`} cx="85%" cy="10%" r="90%">
              <stop offset="0" stopColor={colour} stopOpacity={0.28} />
              <stop offset="1" stopColor="#16241f" stopOpacity={0} />
            </radialGradient>
            <pattern id={`grid-${article.slug}`} width={40} height={40} patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,.04)" />
            </pattern>
          </defs>
          <rect width={800} height={450} fill="#16241f" />
          <rect width={800} height={450} fill={`url(#grid-${article.slug})`} />
          <rect width={800} height={450} fill={`url(#glow-${article.slug})`} />
          {generatedCandles(article.slug, colour)}
        </svg>
      )}
    </div>
  );
}

export function CategoryLabel({ category }: { category: LearnSummary["category"] }) {
  return <span className="text-xs font-bold uppercase tracking-[0.06em]" style={{ color: LEARN_CATEGORIES[category] }}>{category}</span>;
}

export function ArticleMeta({ article }: { article: Pick<LearnSummary, "date" | "minutes"> }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
      <time dateTime={article.date}>{new Date(`${article.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</time>
      <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-slate-500" />
      <span>{article.minutes} min read</span>
    </p>
  );
}
