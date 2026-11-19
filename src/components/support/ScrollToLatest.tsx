"use client";

import { useEffect, useRef } from "react";

/**
 * The team inbox is server rendered, so a freshly loaded thread would otherwise
 * open at the oldest message. This anchors the view to the newest one whenever
 * the conversation or its message count changes.
 */
export function ScrollToLatest({
  marker,
  block = "end",
}: {
  marker: string;
  block?: "start" | "end";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block });
  }, [marker, block]);
  return <div ref={ref} aria-hidden />;
}
