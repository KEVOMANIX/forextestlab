"use client";

import { useEffect, useState } from "react";

/**
 * Subscribe to a media query.
 *
 * Starts `false` so server and first client render agree; the effect corrects it
 * before paint matters. Callers must treat `false` as "not yet known to match".
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/**
 * Phone-sized viewport. Below this the trading terminal cannot show its rails,
 * a multi-chart grid, or floating panels at their desktop sizes, so those parts
 * switch to compact equivalents instead of silently overflowing.
 */
export const COMPACT_VIEWPORT_QUERY = "(max-width: 767px)";

export function useCompactViewport(): boolean {
  return useMediaQuery(COMPACT_VIEWPORT_QUERY);
}
