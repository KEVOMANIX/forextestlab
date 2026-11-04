"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LineChart } from "lucide-react";

import type { ClosedTrade } from "@/lib/backtest/types";
import { cumulativePnlPoints, deepestDrawdown, realisedPointsInRange, samplePnlPoints, type EquityChartRange, type PnlPoint } from "@/lib/analytics/equity-chart";
import { formatNewYorkDate, formatNewYorkDateTime, getNewYorkDateParts } from "@/lib/date-time";

const RANGES: EquityChartRange[] = ["1M", "3M", "1Y", "All"];
const CHART_HEIGHT = 180;
const CHART_TOP = 10;
const CHART_BOTTOM = 158;
const DRAWDOWN_HEIGHT = 54;

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function AnalyticsEquityChart({
  trades,
  startingBalance,
  startTime,
  currency,
}: {
  trades: ClosedTrade[];
  startingBalance: number;
  startTime?: number;
  currency: string;
}) {
  const [range, setRange] = useState<EquityChartRange>("All");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [plotWidth, setPlotWidth] = useState(760);
  const plotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPlotWidth(Math.max(80, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const points = useMemo(
    () => cumulativePnlPoints([], trades, startingBalance, startTime).points,
    [trades, startingBalance, startTime],
  );
  const visible = useMemo(() => realisedPointsInRange(points, range), [points, range]);
  const plotted = useMemo(() => samplePnlPoints(visible), [visible]);
  const deepest = useMemo(() => deepestDrawdown(visible), [visible]);
  const start = visible[0]?.time ?? 0;
  const end = visible.at(-1)?.time ?? start;
  const startDate = getNewYorkDateParts(start);
  const endDate = getNewYorkDateParts(end);
  const sameMonth = startDate.year === endDate.year && startDate.month === endDate.month;
  const dateLabel = (time: number) => formatNewYorkDate(time, sameMonth ? { month: "short", day: "numeric" } : { month: "short", year: "numeric" });
  const tradeCount = trades.filter((trade) => trade.exitTime >= start && trade.exitTime <= end).length;

  let min = 0;
  let max = 0;
  for (const point of visible) {
    min = Math.min(min, point.value);
    max = Math.max(max, point.value);
  }
  const span = Math.max(1, max - min);
  min -= span * 0.12;
  max += span * 0.12;
  const x = (index: number) => 4 + index / Math.max(1, plotted.length - 1) * (plotWidth - 8);
  const y = (value: number) => CHART_TOP + (1 - (value - min) / (max - min)) * (CHART_BOTTOM - CHART_TOP);
  const line = plotted.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const fill = plotted.length > 1 ? `${line} L${x(plotted.length - 1).toFixed(1)},${CHART_BOTTOM} L${x(0).toFixed(1)},${CHART_BOTTOM} Z` : "";
  const latest = visible.at(-1);
  const active = hoveredIndex === null ? null : plotted[hoveredIndex];
  const drawdownByPoint = new Map<PnlPoint, number>();
  let peak = visible[0]?.value ?? 0;
  for (const point of visible) {
    peak = Math.max(peak, point.value);
    drawdownByPoint.set(point, peak - point.value);
  }
  const barWidth = Math.max(1, Math.min(16, (plotWidth - 8) / Math.max(1, plotted.length - 1) - 1));

  return (
    <section className="min-w-0 self-start rounded-2xl border app-border bg-[var(--app-panel)] p-4 shadow-[0_18px_55px_-38px_rgba(0,0,0,0.9)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--app-accent-text)]">Equity curve</h2>
          <p className="mt-1 text-xs app-muted">Realised account equity after each closed trade</p>
        </div>
        <div className="inline-flex rounded-lg bg-[var(--app-panel-2)] p-1" aria-label="Chart date range">
          {RANGES.map((option) => <button key={option} type="button" onClick={() => { setRange(option); setHoveredIndex(null); }} aria-pressed={range === option} className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${range === option ? "bg-[var(--app-panel)] text-[var(--app-text)] shadow-sm" : "app-muted hover:text-[var(--app-text)]"}`}>{option}</button>)}
        </div>
      </div>

      {trades.length > 0 && plotted.length > 1 ? <>
        <div ref={plotRef} className="relative mt-4 h-44 min-w-0 overflow-hidden rounded-md bg-[var(--app-panel-2)]/20">
          <svg viewBox={`0 0 ${plotWidth} ${CHART_HEIGHT}`} preserveAspectRatio="none" className="h-full w-full touch-none" role="img" aria-label={`Realised equity after ${tradeCount} closed trades from ${formatNewYorkDate(start)} to ${formatNewYorkDate(end)}. Ending equity ${money(startingBalance + (latest?.value ?? 0), currency)}. Deepest drawdown ${money(-deepest.amount, currency)}.`} onPointerMove={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)); setHoveredIndex(Math.round(ratio * (plotted.length - 1))); }} onPointerLeave={() => setHoveredIndex(null)}>
            <defs><linearGradient id="overview-equity-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--app-accent)" stopOpacity=".22" /><stop offset="1" stopColor="var(--app-accent)" stopOpacity=".02" /></linearGradient></defs>
            {[0, 1, 2, 3, 4].map((index) => <line key={`h${index}`} x1="0" x2={plotWidth} y1={index * 40 + 8} y2={index * 40 + 8} stroke="var(--app-border)" strokeOpacity=".35" vectorEffect="non-scaling-stroke" />)}
            {[1, 2, 3, 4, 5].map((index) => <line key={`v${index}`} x1={index * plotWidth / 6} x2={index * plotWidth / 6} y1="0" y2={CHART_HEIGHT} stroke="var(--app-border)" strokeOpacity=".25" vectorEffect="non-scaling-stroke" />)}
            <path d={fill} fill="url(#overview-equity-fill)" />
            <path d={line} fill="none" stroke="var(--app-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {active && hoveredIndex !== null && <><line x1={x(hoveredIndex)} x2={x(hoveredIndex)} y1="0" y2={CHART_HEIGHT} stroke="var(--app-muted)" strokeOpacity=".55" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" /><circle cx={x(hoveredIndex)} cy={y(active.value)} r="4" fill="var(--app-accent)" stroke="var(--app-panel)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></>}
          </svg>
          {active && <div className="pointer-events-none absolute right-2 top-2 rounded-lg border app-border bg-[var(--app-panel)]/95 px-3 py-2 text-xs shadow-lg"><p className="app-muted">{formatNewYorkDateTime(active.time)}</p><p className="mt-1 font-mono font-semibold">Equity {money(startingBalance + active.value, currency)}</p></div>}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] app-muted"><span>{dateLabel(start)}</span><span className="hidden text-[var(--app-accent-text)] sm:inline">— Equity</span><span>{tradeCount} {tradeCount === 1 ? "trade" : "trades"}</span><span>{dateLabel(end)}</span></div>
        <div className="mt-4 border-t app-border pt-3">
          <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] app-muted"><span>Drawdown</span><span>Deepest {money(-deepest.amount, currency)}</span></div>
          <svg viewBox={`0 0 ${plotWidth} ${DRAWDOWN_HEIGHT}`} preserveAspectRatio="none" className="mt-1 h-14 w-full" role="img" aria-label={`Drawdown after each closed trade. Deepest ${money(-deepest.amount, currency)}.`}>
            <line x1="0" x2={plotWidth} y1="1" y2="1" stroke="var(--app-border)" vectorEffect="non-scaling-stroke" />
            {plotted.map((point, index) => { const amount = drawdownByPoint.get(point) ?? 0; const height = deepest.amount > 0 ? amount / deepest.amount * (DRAWDOWN_HEIGHT - 3) : 0; return amount > 0 ? <rect key={`${point.time}-${index}`} x={x(index) - barWidth / 2} y="2" width={barWidth} height={height} fill="var(--app-danger-text)" fillOpacity=".76" /> : null; })}
          </svg>
        </div>
      </> : <div className="mt-5 grid h-[276px] place-items-center rounded-xl border border-dashed app-border bg-[var(--app-panel-2)]/35 px-6 text-center"><div><LineChart size={18} className="mx-auto text-brand-300" aria-hidden /><h2 className="mt-3 text-base font-semibold">No closed trades yet</h2><p className="mt-2 text-xs leading-5 app-muted">Close a trade to see realised equity and drawdown.</p></div></div>}
    </section>
  );
}
