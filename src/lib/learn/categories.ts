/** Learn categories, in the order the filter shows them, with their label colour. */
export const LEARN_CATEGORIES = {
  "Getting started": "#7be8c4",
  Backtesting: "#7cc4ff",
  Journaling: "#c4b5fd",
  Analytics: "#fcd34d",
  Risk: "#fdba74",
  "Chart tools": "#fda4af",
  Strategy: "#a5f3fc",
} as const;

export type LearnCategory = keyof typeof LEARN_CATEGORIES;

/** The card data the index and related lists need; the body stays on the server. */
export interface LearnSummary {
  slug: string;
  title: string;
  description: string;
  category: LearnCategory;
  date: string;
  updated: string;
  cover: string | null;
  coverAlt: string;
  minutes: number;
  featured: boolean;
}

export function formatLearnDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Shown as "New" for two weeks after publishing. */
export function isNewArticle(date: string, now = Date.now()) {
  return now - new Date(`${date}T12:00:00Z`).getTime() < 14 * 86_400_000;
}
