"use client";

import { useMemo, useState } from "react";

import { formatNewYorkDateTime } from "@/lib/date-time";

export interface SessionChartPoint {
  time: number;
  balance: number;
  equity: number;
}

type Range = "all" | "100" | "50";

function money(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SessionPerformanceChart({ points }: { points: SessionChartPoint[] }) {
  const [range, setRange] = useState<Range>("all");
  const [hovered, setHovered] = useState<number | null>(null);
  const visible = useMemo(() => {
    const limit = range === "all" ? points.length : Number(range);
    const sliced = points.slice(-limit);
    const stride = Math.max(1, Math.ceil(sliced.length / 280));
    const sampled = sliced.filter((_, index) => index % stride === 0);
    const final = sliced.at(-1);
    if (final && sampled.at(-1)?.time !== final.time) sampled.push(final);
    return sampled;
  }, [points, range]);

  if (visible.length < 2) {
    return (
      <div className="mt-5 grid min-h-56 place-items-center rounded-xl border border-dashed app-border bg-[var(--app-panel-2)]/40 p-6 text-center">
        <div>
          <p className="font-semibold">No equity history yet</p>
          <p className="mt-1 text-sm app-muted">Resume this session to begin building its performance curve.</p>
        </div>
      </div>
    );
  }

  const width = 760;
  const height = 230;
  const padX = 18;
  const padY = 18;
  const allValues = visible.flatMap((point) => [point.balance, point.equity]);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const spread = max - min || 1;
  const x = (index: number) => padX + index * ((width - padX * 2) / (visible.length - 1));
  const y = (value: number) => padY + (1 - (value - min) / spread) * (height - padY * 2);
  const path = (key: "balance" | "equity") => visible.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  const activeIndex = hovered ?? visible.length - 1;
  const active = visible[activeIndex]!;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brand-400" /> Equity</span>
          <span className="inline-flex items-center gap-1.5 app-muted"><i className="h-2 w-2 rounded-full bg-blue-400" /> Balance</span>
        </div>
        <div className="inline-flex rounded-lg border app-border bg-[var(--app-panel-2)] p-1">
          {([{"id":"all","label":"All"},{"id":"100","label":"Recent 100"},{"id":"50","label":"Recent 50"}] as { id: Range; label: string }[]).map((option) => (
            <button key={option.id} type="button" onClick={() => { setRange(option.id); setHovered(null); }} className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${range === option.id ? "bg-white/[0.08] text-[var(--app-text)]" : "app-muted"}`}>{option.label}</button>
          ))}
        </div>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-xl border app-border bg-[var(--app-panel-2)]/55">
        <div className="pointer-events-none absolute left-4 top-3 z-10 rounded-lg border app-border bg-[var(--app-panel)]/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
          <p className="app-muted">{formatNewYorkDateTime(active.time)}</p>
          <div className="mt-1.5 flex gap-4 font-mono font-semibold"><span className="text-brand-300">E {money(active.equity)}</span><span className="text-blue-300">B {money(active.balance)}</span></div>
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-60 w-full touch-none"
          preserveAspectRatio="none"
          role="img"
          aria-label="Interactive balance and equity chart"
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
            setHovered(Math.round(ratio * (visible.length - 1)));
          }}
          onPointerLeave={() => setHovered(null)}
        >
          <defs>
            <linearGradient id="session-equity-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c3a0" stopOpacity="0.22" /><stop offset="100%" stopColor="#22c3a0" stopOpacity="0" /></linearGradient>
            <pattern id="session-grid" width="76" height="46" patternUnits="userSpaceOnUse"><path d="M 76 0 L 0 0 0 46" fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" /></pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#session-grid)" className="app-muted" />
          <path d={`${path("equity")} L${width - padX},${height - padY} L${padX},${height - padY} Z`} fill="url(#session-equity-fill)" />
          <path d={path("balance")} fill="none" stroke="#60a5fa" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <path d={path("equity")} fill="none" stroke="#22c3a0" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          <line x1={x(activeIndex)} x2={x(activeIndex)} y1={padY} y2={height - padY} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <circle cx={x(activeIndex)} cy={y(active.equity)} r="4" fill="#22c3a0" stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  );
}
