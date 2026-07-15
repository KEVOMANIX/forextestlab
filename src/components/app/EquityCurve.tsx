"use client";

import { useMemo } from "react";

import type { EquityPoint } from "@/lib/backtest/types";

/** Lightweight SVG equity curve — no charting dependency needed. */
export function EquityCurve({ points }: { points: EquityPoint[] }) {
  const path = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => Number(p.equity));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const w = 800;
    const h = 220;
    const pad = 8;
    const step = (w - pad * 2) / (points.length - 1);
    const y = (v: number) => pad + (1 - (v - min) / range) * (h - pad * 2);
    const line = values
      .map((v, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");
    const area = `${line} L${(pad + (values.length - 1) * step).toFixed(1)},${h - pad} L${pad},${h - pad} Z`;
    return { line, area, w, h, min, max };
  }, [points]);

  if (!path) {
    return <p className="p-4 text-sm app-muted">Not enough data to plot an equity curve yet.</p>;
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${path.w} ${path.h}`}
        className="h-56 w-full"
        role="img"
        aria-label="Account equity over the session"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c3a0" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#22c3a0" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={path.area} fill="url(#eq-fill)" />
        <path d={path.line} fill="none" stroke="#22c3a0" strokeWidth="2" />
      </svg>
      <div className="flex justify-between px-1 font-mono text-xs app-muted">
        <span>Low ${path.min.toFixed(2)}</span>
        <span>High ${path.max.toFixed(2)}</span>
      </div>
    </div>
  );
}
