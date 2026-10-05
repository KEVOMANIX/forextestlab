import type { MetadataRoute } from "next";

import { learnArticles } from "@/lib/learn";
import { siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {

  const routes = [
    { path: "/", priority: 1, changeFrequency: "weekly" as const },
    { path: "/features", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/markets", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/learn", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/faq", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/contact", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/support", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/pricing", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/refund-policy", priority: 0.3, changeFrequency: "yearly" as const },
    {
      path: "/risk-disclosure",
      priority: 0.3,
      changeFrequency: "yearly" as const,
    },
  ];

  return [...routes.map((route) => ({
    url: `${siteConfig.url}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  })), ...learnArticles.map(article => ({ url: `${siteConfig.url}/learn/${article.slug}`, lastModified: new Date(`${article.updated}T12:00:00Z`), changeFrequency: "monthly" as const, priority: 0.7 }))];
}
