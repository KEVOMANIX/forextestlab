import type { Metadata } from "next";

import { siteConfig } from "@/lib/site";

/** Keep each public page's search and social URLs pointed at the same page. */
export function marketingMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: `/${string}`;
}): Metadata {
  const fullTitle = `${title} | ${siteConfig.name}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: siteConfig.name,
      url: `${siteConfig.url}${path}`,
      title: fullTitle,
      description,
      images: [{
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: `${siteConfig.name} — forex backtesting and market replay`,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [siteConfig.ogImage],
    },
  };
}
