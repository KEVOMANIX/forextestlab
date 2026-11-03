"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LineChart } from "lucide-react";

import type { ClosedTrade, EquityPoint } from "@/lib/backtest/types";
import { cumulativePnlPoints, deepestDrawdown, pointsInRange, samplePnlPoints, type EquityChartRange } from "@/lib/analytics/equity-chart";
import { formatNewYorkDate, formatNewYorkDateTime, getNewYorkDateParts } from "@/lib/date-time";

const RANGES: EquityChartRange[] = ["1M", "3M", "1Y", "All"];
const HEIGHT = 224;
const TOP = 12;
const BOTTOM = 210;

function formattedMoney(value: number, currency: string, decimals = 0, signed = false): string {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));
  return `${value < 0 ? "−" : signed && value > 0 ? "+" : ""}${amount}`;
}

function niceStep(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
}

export function AnalyticsEquityChart({
  equityCurve,
  trades,
  startingBalance,
  startTime,
  currency,
}: {
  equityCurve: EquityPoint[];
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

  const series = useMemo(
    () => cumulativePnlPoints(equityCurve, trades, startingBalance, startTime),
    [equityCurve, trades, startingBalance, startTime],
  );
  const visible = useMemo(() => pointsInRange(series.points, range), [series.points, range]);
  const plotted = useMemo(() => samplePnlPoints(visible), [visible]);
  const deepest = useMemo(() => deepestDrawdown(visible), [visible]);
  const hasTrades = trades.length > 0;
  const start = visible[0]?.time ?? 0;
  const end = visible.at(-1)?.time ?? start;
  const startDate = getNewYorkDateParts(start);
  const endDate = getNewYorkDateParts(end);
  const sameMonth = startDate.year === endDate.year && startDate.month === endDate.month;
  const dateLabel = (time: number) => formatNewYorkDate(time, sameMonth ? { month: "short", day: "numeric" } : { month: "short", year: "numeric" });
  let rawMin = 0;
  let rawMax = 0;
  for (const point of visible) {
    rawMin = Math.min(rawMin, point.value);
    rawMax = Math.max(rawMax, point.value);
  }
  const step = niceStep(Math.max(1, rawMax - rawMin) / 3);
  const min = Math.floor(rawMin / step) * step;
  const max = Math.max(min + step, Math.ceil(rawMax / step) * step);
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + index * step);
  // Snapshots are event-driven and can be very sparse between replay actions.
  // Even spacing avoids drawing a long, misleading diagonal across missing data.
  const x = (index: number) => 5 + index / Math.max(1, plotted.length - 1) * (plotWidth - 10);
  const y = (value: number) => TOP + (1 - (value - min) / (max - min)) * (BOTTOM - TOP);
  const line = plotted.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const baseline = y(0);
  const fill = plotted.length > 1 ? `${line} L${x(plotted.length - 1).toFixed(1)},${baseline.toFixed(1)} L${x(0).toFixed(1)},${baseline.toFixed(1)} Z` : "";
  const active = hoveredIndex === null ? null : plotted[hoveredIndex];
  const deepestPoint = visible[deepest.index];
  const deepestPlotIndex = deepestPoint ? plotted.findIndex((point) => point.time === deepestPoint.time) : -1;
  const latest = visible.at(-1);
  let peak = visible[0]?.value ?? 0;
  const drawdown = plotted.map((point) => {
    peak = Math.max(peak, point.value);
    return { time: point.time, amount: peak - point.value };
  });
  const drawdownLine = drawdown.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${(6 + point.amount / Math.max(1, deepest.amount) * 43).toFixed(1)}`).join(" ");
  const drawdownFill = drawdown.length > 1 ? `${drawdownLine} L${x(plotted.length - 1).toFixed(1)},6 L${x(0).toFixed(1)},6 Z` : "";

  return (
    <section className="min-w-0 rounded-2xl border app-border bg-[var(--app-panel)] p-4 shadow-[0_18px_55px_-38px_rgba(0,0,0,0.9)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Cumulative P/L</h2>
          <p className="mt-1 text-xs app-muted">{series.includesOpenTrades ? "Equity P/L, including open-trade movement" : "Realised P/L after each closed trade"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {hasTrades && latest && <span className={`font-mono text-sm font-semibold ${latest.value >= 0 ? "text-profit" : "text-loss"}`}>{formattedMoney(latest.value, currency, 2, true)}</span>}
          <div className="inline-flex rounded-lg bg-[var(--app-panel-2)] p-1" aria-label="Chart date range">
            {RANGES.map((option) => <button key={option} type="button" onClick={() => { setRange(option); setHoveredIndex(null); }} aria-pressed={range === option} className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${range === option ? "bg-[var(--app-panel)] text-[var(--app-text)] shadow-sm" : "app-muted hover:text-[var(--app-text)]"}`}>{option}</button>)}
          </div>
        </div>
      </div>

      {hasTrades && plotted.length > 1 ? <>
        <div className="mt-5 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
          <div className="relative h-56" aria-hidden>{ticks.map((tick) => <span key={tick} className="absolute right-0 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] app-muted" style={{ top: y(tick) }}>{formattedMoney(tick, currency)}</span>)}</div>
          <div ref={plotRef} className="relative min-w-0 h-56">
            <svg viewBox={`0 0 ${plotWidth} ${HEIGHT}`} preserveAspectRatio="none" className="h-full w-full touch-none" role="img" aria-label={`Cumulative P/L by ${series.includesOpenTrades ? "replay snapshot" : "closed trade"} from ${formatNewYorkDate(start)} to ${formatNewYorkDate(end)}. Latest ${formattedMoney(latest?.value ?? 0, currency, 2, true)}. Deepest drawdown ${formattedMoney(-deepest.amount, currency, 2)}.`} onPointerMove={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)); setHoveredIndex(Math.round(ratio * (plotted.length - 1))); }} onPointerLeave={() => setHoveredIndex(null)}>
              {ticks.map((tick) => <line key={tick} x1="0" x2={plotWidth} y1={y(tick)} y2={y(tick)} stroke="var(--app-border)" strokeOpacity={tick === 0 ? 0.8 : 0.45} strokeDasharray={tick === 0 ? "" : "3 5"} vectorEffect="non-scaling-stroke" />)}
              <path d={fill} fill="var(--app-accent-wash)" />
              <path d={line} fill="none" stroke="var(--app-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              {deepest.amount > 0 && deepestPoint && deepestPlotIndex >= 0 && <circle cx={x(deepestPlotIndex)} cy={y(deepestPoint.value)} r="5" fill="var(--app-danger-text)" stroke="var(--app-panel)" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
              {latest && <circle cx={x(plotted.length - 1)} cy={y(latest.value)} r="4.5" fill="var(--app-accent)" stroke="var(--app-panel)" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
              {active && hoveredIndex !== null && <><line x1={x(hoveredIndex)} x2={x(hoveredIndex)} y1={TOP} y2={BOTTOM} stroke="var(--app-muted)" strokeOpacity=".5" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" /><circle cx={x(hoveredIndex)} cy={y(active.value)} r="5" fill="var(--app-accent)" stroke="var(--app-panel)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></>}
            </svg>
            {deepest.amount > 0 && deepestPoint && deepestPlotIndex >= 0 && !active && <span className="pointer-events-none absolute hidden -translate-x-1/2 rounded-md border app-border bg-[var(--app-panel)]/95 px-2 py-1 text-[10px] font-medium shadow-sm sm:block" style={{ left: `${Math.max(14, Math.min(86, x(deepestPlotIndex) / plotWidth * 100))}%`, top: Math.max(0, y(deepestPoint.value) - 34) }}>Max drawdown</span>}
            {active && <div className="pointer-events-none absolute right-2 top-2 rounded-lg border app-border bg-[var(--app-panel)]/95 px-3 py-2 text-xs shadow-lg"><p className="app-muted">{formatNewYorkDateTime(active.time)}</p><p className="mt-1 font-mono font-semibold">{formattedMoney(active.value, currency, 2, true)}</p></div>}
          </div>
        </div>
        <div className="ml-20 mt-1 flex justify-between text-[10px] app-muted"><span>{dateLabel(start)}</span><span className="hidden sm:inline">{series.includesOpenTrades ? "Replay snapshots" : "Closed trades"} · time gaps compressed</span><span>{dateLabel(end)}</span></div>
        <div className="mt-4 border-t app-border pt-3">
          <div className="flex items-center justify-between gap-2 text-xs"><span className="font-medium">Drawdown</span><span className="font-mono text-loss">Deepest {formattedMoney(-deepest.amount, currency, 2)}</span></div>
          <div className="ml-20 mt-2 h-14"><svg viewBox={`0 0 ${plotWidth} 56`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Drawdown over the selected date range"><line x1="0" x2={plotWidth} y1="6" y2="6" stroke="var(--app-border)" vectorEffect="non-scaling-stroke"/><path d={drawdownFill} fill="var(--app-danger-text)" fillOpacity=".14"/><path d={drawdownLine} fill="none" stroke="var(--app-danger-text)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg></div>
        </div>
      </> : <div className="mt-5 grid h-[276px] place-items-center rounded-xl border border-dashed app-border bg-[var(--app-panel-2)]/35 px-6 text-center"><div><LineChart size={18} className="mx-auto text-brand-300" aria-hidden /><h2 className="mt-3 text-base font-semibold">No closed trades yet</h2><p className="mt-2 text-xs leading-5 app-muted">Close a trade to see cumulative P/L and drawdown.</p></div></div>}
    </section>
  );
}
