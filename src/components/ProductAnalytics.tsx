"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import type { ProductEventName } from "@/lib/product-analytics";

export function trackProductEvent(name: ProductEventName, path = window.location.pathname) {
  const key = "forextestlab:analytics-session";
  let anonymousId = window.sessionStorage.getItem(key);
  if (!anonymousId) {
    anonymousId = window.crypto.randomUUID();
    window.sessionStorage.setItem(key, anonymousId);
  }
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, path, anonymousId }),
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
