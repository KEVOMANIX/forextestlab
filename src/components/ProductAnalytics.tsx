"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import type { ProductEventName } from "@/lib/product-analytics";

export function trackProductEvent(name: ProductEventName, path = window.location.pathname) {
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, path }),
    keepalive: true,
  }).catch(() => undefined);
}

export function ProductAnalytics() {
  const pathname = usePathname();
  useEffect(() => {
    trackProductEvent(pathname === "/pricing" ? "pricing_viewed" : "page_view", pathname);
  }, [pathname]);
  return null;
}
