import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const routes = [
    { path: "/", priority: 1, changeFrequency: "weekly" as const },
    { path: "/app", priority: 0.9, changeFrequency: "weekly" as const },
    { path: "/app/backtest", priority: 0.9, changeFrequency: "weekly" as const },
    { path: "/app/history", priority: 0.4, changeFrequency: "weekly" as const },
    { path: "/about", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/contact", priority: 0.6, changeFrequency: "monthly" as const },
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

  return routes.map((route) => ({
    url: `${siteConfig.url}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
