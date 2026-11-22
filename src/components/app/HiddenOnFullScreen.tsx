"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { isFullScreenPath } from "@/lib/ui/full-screen";

/** Leaves its children out on full-screen pages such as the AI Analyst. */
export function HiddenOnFullScreen({ children }: { children: ReactNode }) {
  const search = useSearchParams();
  return isFullScreenPath(usePathname(), search) ? null : children;
}
