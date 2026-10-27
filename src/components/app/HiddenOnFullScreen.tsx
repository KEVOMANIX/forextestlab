"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { isFullScreenPath } from "@/lib/ui/full-screen";

/** Leaves its children out on full-screen pages such as the AI Analyst. */
export function HiddenOnFullScreen({ children }: { children: ReactNode }) {
  return isFullScreenPath(usePathname()) ? null : children;
}
