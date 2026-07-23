"use client";

import { useMemo, useState } from "react";

import { formatNewYorkDateTime } from "@/lib/date-time";

export interface SessionChartPoint {
  time: number;
  balance: number;
  equity: number;
}

export interface SessionChartTrade {
  time: number;
  pnl: number;
}

type Range = "all" | "30d" | "7d";

function money(value: number) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function SessionPerformanceChart({
  points,
  trades = [],
}: {
  points: SessionChartPoint[];
  trades?: SessionChartTrade[];
}) {
  const [range, setRange] = useState<Range>("all");
  const [hovered, setHovered] = useState<number | null>(null);
  const [showEquity, setShowEquity] = useState(true);
  const [showBalance, setShowBalance] = useState(true);

  const visible = useMemo(() => {
    const latest = points.at(-1)?.time ?? 0;
    const cutoff =
      range === "all"
        ? 0
        : latest - (range === "30d" ? 30 : 7) * 24 * 60 * 60 * 1000;
    const sliced = cutoff ? points.filter((point) => point.time >= cutoff) : points;
    const stride = Math.max(1, Math.ceil(sliced.length / 320));
    const sampled = sliced.filter((_, index) => index % stride === 0);
    const final = sliced.at(-1);
    if (final && sampled.at(-1)?.time !== final.time) sampled.push(final);
    return sampled;
  }, [points, range]);

  if (visible.length < 2) {
    return (
      <div className="mt-5 grid min-h-72 place-items-center rounded-xl border border-dashed app-border bg-[var(--app-panel-2)]/40 p-6 text-center">
        <div>
          <p className="font-semibold">Performance history will appear here</p>
          <p className="mt-1 text-sm app-muted">
            Resume this session and close a trade to start building the curve.
          </p>
        </div>
      </div>
    );
  }

  const width = 860;
  const height = 290;
  const padX = 20;
  const padY = 20;
  const values = visible.flatMap((point) => [
    ...(showBalance ? [point.balance] : []),
    ...(showEquity ? [point.equity] : []),
  ]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const x = (index: number) =>
    padX + index * ((width - padX * 2) / (visible.length - 1));
  const y = (value: number) =>
    padY + (1 - (value - min) / spread) * (height - padY * 2);
  const path = (key: "balance" | "equity") =>
    visible
      .map(
        (point, index) =>
          `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`,
      )
      .join(" ");
  const activeIndex = hovered ?? visible.length - 1;
  const active = visible[activeIndex]!;
  const activePeak = Math.max(...visible.slice(0, activeIndex + 1).map((point) => point.equity));
  const activeDrawdown = Math.max(0, activePeak - active.equity);
  const startTime = visible[0]!.time;
  const endTime = visible.at(-1)!.time;
  const tradeMarkers = trades
    .filter((trade) => trade.time >= startTime && trade.time <= endTime)
    .slice(-80)
    .map((trade) => {
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;
      visible.forEach((point, index) => {
        const distance = Math.abs(point.time - trade.time);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      return { ...trade, index: closestIndex };
    });

  function toggleSeries(series: "equity" | "balance") {
    if (series === "equity") {
      if (showEquity && !showBalance) return;
      setShowEquity((value) => !value);
    } else {
      if (showBalance && !showEquity) return;
      setShowBalance((value) => !value);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border app-border bg-[var(--app-panel-2)] p-1">
          <button
            type="button"
            onClick={() => toggleSeries("equity")}
            aria-pressed={showEquity}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-semibold ${
              showEquity ? "bg-white/[0.08]" : "app-muted"
            }`}
          >
            <i className="h-2 w-2 rounded-full bg-brand-400" /> Equity
          </button>
          <button
            type="button"
            onClick={() => toggleSeries("balance")}
            aria-pressed={showBalance}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-semibold ${
              showBalance ? "bg-white/[0.08]" : "app-muted"
            }`}
          >
            <i className="h-2 w-2 rounded-full bg-blue-400" /> Balance
          </button>
        </div>
        <div className="inline-flex rounded-lg border app-border bg-[var(--app-panel-2)] p-1">
          {(
            [
              { id: "all", label: "Entire session" },
              { id: "30d", label: "30D" },
              { id: "7d", label: "7D" },
            ] as { id: Range; label: string }[]
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setRange(option.id);
                setHovered(null);
              }}
              className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${
                range === option.id
                  ? "bg-white/[0.08] text-[var(--app-text)]"
                  : "app-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-xl border app-border bg-[var(--app-panel-2)]/55">
        <div className="pointer-events-none absolute left-4 top-3 z-10 max-w-[calc(100%-2rem)] rounded-lg border app-border bg-[var(--app-panel)]/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
          <p className="truncate app-muted">{formatNewYorkDateTime(active.time)}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono font-semibold">
            {showEquity && <span className="text-brand-300">Equity {money(active.equity)}</span>}
            {showBalance && <span className="text-blue-300">Balance {money(active.balance)}</span>}
            <span className="text-bear">DD {money(activeDrawdown)}</span>
          </div>
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-72 w-full touch-none sm:h-80"
          preserveAspectRatio="none"
          role="img"
          aria-label="Interactive balance and equity chart"
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const ratio = Math.max(
              0,
              Math.min(1, (event.clientX - bounds.left) / bounds.width),
            );
            setHovered(Math.round(ratio * (visible.length - 1)));
          }}
          onPointerLeave={() => setHovered(null)}
        >
          <defs>
            <linearGradient id="session-equity-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c3a0" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#22c3a0" stopOpacity="0" />
            </linearGradient>
            <pattern id="session-grid" width="86" height="48" patternUnits="userSpaceOnUse">
              <path
                d="M 86 0 L 0 0 0 48"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.08"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#session-grid)" className="app-muted" />
          {showEquity && (
            <>
              <path
                d={`${path("equity")} L${width - padX},${height - padY} L${padX},${height - padY} Z`}
                fill="url(#session-equity-fill)"
              />
              <path
                d={path("equity")}
                fill="none"
                stroke="#22c3a0"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
          {showBalance && (
            <path
              d={path("balance")}
              fill="none"
              stroke="#60a5fa"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {tradeMarkers.map((trade, index) => (
            <circle
              key={`${trade.time}-${index}`}
              cx={x(trade.index)}
              cy={y(visible[trade.index]!.equity)}
              r="3.5"
              fill={trade.pnl >= 0 ? "#22c3a0" : "#fb7185"}
              stroke="var(--app-panel)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1={x(activeIndex)}
            x2={x(activeIndex)}
            y1={padY}
            y2={height - padY}
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={x(activeIndex)}
            cy={y(showEquity ? active.equity : active.balance)}
            r="4"
            fill={showEquity ? "#22c3a0" : "#60a5fa"}
            stroke="white"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {tradeMarkers.length > 0 && (
          <div className="absolute bottom-3 right-3 flex items-center gap-3 rounded-md bg-[var(--app-panel)]/85 px-2.5 py-1.5 text-[10px] app-muted backdrop-blur">
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brand-400" /> Win</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-bear" /> Loss</span>
          </div>
        )}
      </div>
    </div>
  );
}
