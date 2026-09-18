"use client";

import { X } from "lucide-react";
import { CandlestickSeries, ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type ISeriesApi, type Time, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ReviewRecord } from "./JournalReview";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";
import type { Candle, Timeframe } from "@/lib/market-data/types";

const REVIEW_TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export function TradeReviewChartModal({ sessionId, record, onClose }: { sessionId?: string; record: ReviewRecord; onClose: () => void }) {
  const dialogRef = useModalBehavior<HTMLDivElement>({ open: true, onClose });
  const [timeframe, setTimeframe] = useState<Timeframe>(record.journal.beforeEntrySnapshot?.timeframe ?? "1m");
  const [marketCandles, setMarketCandles] = useState<Candle[] | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    setLoading(true); setError(null);
    fetch(`/api/backtest/sessions/${encodeURIComponent(sessionId)}/trade-chart?journalId=${encodeURIComponent(record.journalId)}&timeframe=${timeframe}`, { signal: controller.signal })
      .then(async (response) => { const data = await response.json() as { ok: boolean; candles?: Candle[]; error?: string }; if (!response.ok || !data.ok) throw new Error(data.error ?? "Chart data could not be loaded."); setMarketCandles(data.candles ?? []); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Chart data could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [record.journalId, sessionId, timeframe]);
  const candles = useMemo(() => {
    const values = [...(record.journal.beforeEntrySnapshot?.candles ?? []), ...(record.journal.afterExitSnapshot?.candles ?? [])];
    return [...new Map(values.map((candle) => [candle.timestamp, candle])).values()].sort((a, b) => a.timestamp - b.timestamp);
  }, [record]);
  const prices = candles.flatMap((candle) => [Number(candle.high), Number(candle.low)]).concat([record.entryPrice, record.exitPrice, record.stopLoss, record.takeProfit].filter((value): value is string => Boolean(value)).map(Number));
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const spread = high - low || Math.abs(high) * 0.01 || 1;
  const paddedLow = low - spread * 0.08;
  const paddedHigh = high + spread * 0.08;
  const width = 1200;
  const height = 560;
  const plotRight = 1080;
  const y = (price: number) => 20 + (1 - (price - paddedLow) / (paddedHigh - paddedLow)) * (height - 40);
  const x = (index: number) => 22 + index * ((plotRight - 44) / Math.max(1, candles.length - 1));
  const entryY = y(Number(record.entryPrice));
  const stopY = record.stopLoss ? y(Number(record.stopLoss)) : null;
  const targetY = record.takeProfit ? y(Number(record.takeProfit)) : null;
  const exitY = y(Number(record.exitPrice));
  const firstTradeIndex = Math.max(0, candles.findIndex((candle) => candle.timestamp >= record.entryTime));
  const exitIndex = Math.max(firstTradeIndex, candles.findIndex((candle) => candle.timestamp >= record.exitTime));
  const tradeX1 = x(firstTradeIndex);
  const tradeX2 = x(exitIndex === -1 ? candles.length - 1 : exitIndex);
  const positive = Number(record.pnl ?? 0) >= 0;

  return <div className="fixed inset-0 z-[120] bg-black/75 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Trade ${record.number} chart review`} className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border app-border bg-[var(--app-bg)] shadow-2xl outline-none">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b app-border px-4 py-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-300">Trade review</p><h2 className="mt-1 font-semibold">Trade {record.number} · {record.direction === "long" ? "Long" : "Short"} {record.symbol ? `· ${record.symbol}` : ""}</h2></div>
        <div className="flex items-center gap-3"><span className={`font-mono text-sm font-semibold ${positive ? "text-brand-300" : "text-bear"}`}>{positive ? "+" : ""}{Number(record.pnl ?? 0).toFixed(2)} · {record.journal.realizedR ? `${record.journal.realizedR}R` : "R unavailable"}</span><button type="button" onClick={onClose} aria-label="Close trade chart" className="grid h-9 w-9 place-items-center rounded-lg border app-border app-muted hover:text-[var(--app-text)]"><X size={16} /></button></div>
      </header>
      {sessionId && <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b app-border px-4 py-2" role="group" aria-label="Review chart timeframe">{REVIEW_TIMEFRAMES.map((value) => <button key={value} type="button" onClick={() => setTimeframe(value)} aria-pressed={timeframe === value} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${timeframe === value ? "bg-brand-500 text-surface-950" : "app-muted hover:bg-white/[0.05] hover:text-[var(--app-text)]"}`}>{value}</button>)}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
        {sessionId ? <InteractiveReviewChart candles={marketCandles ?? []} record={record} loading={loading} error={error} /> : candles.length ? <div className="min-w-[760px] overflow-hidden rounded-xl border app-border bg-[var(--app-panel-2)]/45"><svg viewBox={`0 0 ${width} ${height}`} className="h-[min(62vh,650px)] w-full" role="img" aria-label="Candlestick chart with original position and actual exit">
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => <line key={ratio} x1="0" x2={plotRight} y1={height * ratio} y2={height * ratio} stroke="rgba(148,163,184,.10)" />)}
          {stopY !== null && <rect x={tradeX1} y={Math.min(entryY, stopY)} width={Math.max(3, tradeX2 - tradeX1)} height={Math.abs(stopY - entryY)} fill="rgba(244,100,108,.13)" />}
          {targetY !== null && <rect x={tradeX1} y={Math.min(entryY, targetY)} width={Math.max(3, tradeX2 - tradeX1)} height={Math.abs(targetY - entryY)} fill="rgba(34,195,160,.13)" />}
          {candles.map((candle, index) => { const rising = Number(candle.close) >= Number(candle.open); const candleX = x(index); const openY = y(Number(candle.open)); const closeY = y(Number(candle.close)); const color = rising ? "#22c3a0" : "#f4646c"; const bodyWidth = Math.max(2, Math.min(10, (plotRight - 44) / Math.max(1, candles.length) * 0.65)); return <g key={candle.timestamp} stroke={color} fill={color}><line x1={candleX} x2={candleX} y1={y(Number(candle.high))} y2={y(Number(candle.low))} strokeWidth="1" /><rect x={candleX - bodyWidth / 2} y={Math.min(openY, closeY)} width={bodyWidth} height={Math.max(1.5, Math.abs(closeY - openY))} /></g>; })}
          <PriceLine y={entryY} label={`ENTRY ${record.entryPrice}`} color="#60a5fa" width={plotRight} />
          {stopY !== null && <PriceLine y={stopY} label={`STOP ${record.stopLoss}`} color="#f4646c" width={plotRight} />}
          {targetY !== null && <PriceLine y={targetY} label={`TARGET ${record.takeProfit}`} color="#22c3a0" width={plotRight} />}
          <PriceLine y={exitY} label={`EXIT ${record.exitPrice}`} color="#fbbf24" width={plotRight} dashed />
          <line x1={tradeX1} x2={tradeX1} y1="18" y2={height - 18} stroke="rgba(96,165,250,.55)" strokeDasharray="3 5" />
          <line x1={tradeX2} x2={tradeX2} y1="18" y2={height - 18} stroke="rgba(251,191,36,.55)" strokeDasharray="3 5" />
        </svg></div> : <div className="grid min-h-80 place-items-center rounded-xl border border-dashed app-border text-sm app-muted">Chart snapshots are unavailable for this older trade.</div>}
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">{[
          ["Planned R:R", record.journal.plannedRR ? `1:${record.journal.plannedRR}` : "—"], ["Realized R", record.journal.realizedR ? `${record.journal.realizedR}R` : "—"], ["P/L", `${positive ? "+" : ""}${Number(record.pnl ?? 0).toFixed(2)}`], ["MFE", record.maxFavorablePnl ?? "—"], ["MAE", record.maxAdversePnl ?? "—"], ["Grade", record.journal.grade ?? "—"],
        ].map(([label, value]) => <div key={label} className="rounded-lg border app-border bg-[var(--app-panel)] p-3"><dt className="text-[10px] uppercase tracking-wide app-muted">{label}</dt><dd className="mt-1 font-mono text-sm font-semibold">{value}</dd></div>)}</dl>
      </div>
    </div>
  </div>;
}

function InteractiveReviewChart({ candles, record, loading, error }: { candles: Candle[]; record: ReviewRecord; loading: boolean; error: string | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, { autoSize: true, layout: { background: { type: ColorType.Solid, color: "#0b1220" }, textColor: "#94a3b8", fontFamily: "inherit" }, grid: { vertLines: { color: "rgba(148,163,184,.08)" }, horzLines: { color: "rgba(148,163,184,.08)" } }, rightPriceScale: { borderColor: "rgba(148,163,184,.18)" }, timeScale: { borderColor: "rgba(148,163,184,.18)", timeVisible: true, secondsVisible: false }, crosshair: { mode: CrosshairMode.Normal }, handleScroll: true, handleScale: true });
    const series = chart.addSeries(CandlestickSeries, { upColor: "#22c3a0", downColor: "#f4646c", wickUpColor: "#22c3a0", wickDownColor: "#f4646c", borderVisible: false });
    chartRef.current = chart; seriesRef.current = series;
    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, []);
  useEffect(() => {
    const chart = chartRef.current; const series = seriesRef.current;
    if (!chart || !series || !candles.length) return;
    series.setData(candles.map((candle) => ({ time: Math.floor(candle.timestamp / 1000) as UTCTimestamp, open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close) })));
    const lines = [
      { price: Number(record.entryPrice), title: `Entry ${record.entryPrice}`, color: "#60a5fa", style: LineStyle.Dotted },
      ...(record.stopLoss ? [{ price: Number(record.stopLoss), title: `Stop ${record.stopLoss}`, color: "#f4646c", style: LineStyle.Dotted }] : []),
      ...(record.takeProfit ? [{ price: Number(record.takeProfit), title: `Target ${record.takeProfit}`, color: "#22c3a0", style: LineStyle.Dotted }] : []),
      { price: Number(record.exitPrice), title: `Exit ${record.exitPrice}`, color: "#fbbf24", style: LineStyle.Dashed },
    ];
    const priceLines = lines.map((line) => series.createPriceLine({ ...line, lineWidth: 1, axisLabelVisible: true }));
    chart.timeScale().setVisibleRange({ from: Math.floor((record.entryTime - Math.max(1, record.exitTime - record.entryTime) * .35) / 1000) as Time, to: Math.floor((record.exitTime + Math.max(1, record.exitTime - record.entryTime) * .25) / 1000) as Time });
    return () => priceLines.forEach((line) => series.removePriceLine(line));
  }, [candles, record]);
  return <div className="relative h-[min(65vh,680px)] min-h-[380px] overflow-hidden rounded-xl border app-border bg-[#0b1220]"><div ref={containerRef} className="absolute inset-0" />{loading && <div className="absolute inset-0 grid place-items-center bg-[#0b1220]/75 text-sm app-muted">Loading {candles.length ? "timeframe" : "chart"}…</div>}{error && <div className="absolute inset-0 grid place-items-center bg-[#0b1220]/85 p-6 text-center text-sm text-bear">{error}</div>}{!loading && !error && !candles.length && <div className="absolute inset-0 grid place-items-center text-sm app-muted">No candles are available for this timeframe.</div>}<div className="pointer-events-none absolute left-3 top-3 rounded-lg border app-border bg-[#0b1220]/90 px-3 py-2 text-[10px] shadow-xl"><span className="text-brand-300">Green: planned reward</span><span className="mx-2 app-muted">·</span><span className="text-bear">Red: planned risk</span><span className="mx-2 app-muted">·</span><span className="text-amber-300">Gold: actual exit</span></div></div>;
}

function PriceLine({ y, label, color, width, dashed = false }: { y: number; label: string; color: string; width: number; dashed?: boolean }) {
  return <g><line x1="0" x2={width} y1={y} y2={y} stroke={color} strokeWidth="1.4" strokeDasharray={dashed ? "5 5" : "2 4"} opacity=".8" /><rect x={width} y={y - 12} width="120" height="24" rx="5" fill={color} opacity=".9" /><text x={width + 8} y={y + 4} fill="#071019" fontSize="11" fontWeight="700">{label}</text></g>;
}
