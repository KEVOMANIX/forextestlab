"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers, type IChartApi, type SeriesMarker, type Time, type UTCTimestamp } from "lightweight-charts";

import { AXIS_FONT_SIZES, PRICE_AXIS_TICK_DENSITY } from "@/lib/chart/axis-layout";
import { formatCrosshairLabel, formatTickMark, timeframeTickMarkMaxCharacters } from "@/lib/chart/tick-marks";
import { TIMEFRAME_MS, type Timeframe } from "@/lib/market-data/types";

export type LabCandles = { time: number[]; open: number[]; high: number[]; low: number[]; close: number[] };
export type LabPlot = { title: string; color: string; style: string; linewidth: number; values: (number | null)[] };
export type LabTrade = { number: number; direction: "long" | "short"; entryTime: number; exitTime: number; entryPrice: number; exitPrice: number; quantity: number; pnl: number; entryId: string; exitId: string | null };

const seconds = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;
const timeMs = (time: Time) => (typeof time === "number" ? time * 1000 : typeof time === "string" ? Date.parse(`${time}T00:00:00Z`) : Date.UTC(time.year, time.month - 1, time.day));
const plotColor = (color: string) => (/^#[0-9a-f]{6,8}$/i.test(color) || /^rgba?\(/i.test(color) ? color : "#2962FF");

function palette(theme: "dark" | "light") {
  return theme === "light"
    ? { background: "#f7faf8", text: "#52675f", grid: "rgba(16,35,28,.08)", border: "rgba(16,35,28,.16)" }
    : { background: "#14231e", text: "#aac8bc", grid: "rgba(170,200,188,.08)", border: "rgba(170,200,188,.18)" };
}

function baseChart(container: HTMLElement, theme: "dark" | "light", timeframe: Timeframe, timeVisible: boolean): IChartApi {
  const colors = palette(theme);
  return createChart(container, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: colors.background }, textColor: colors.text, fontFamily: "inherit", fontSize: AXIS_FONT_SIZES.medium, panes: { separatorColor: colors.border } },
    grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
    rightPriceScale: { borderColor: colors.border, tickMarkDensity: PRICE_AXIS_TICK_DENSITY, ticksVisible: true, scaleMargins: { top: 0.1, bottom: 0.08 } },
    timeScale: { borderColor: colors.border, tickMarkMaxCharacterLength: timeframeTickMarkMaxCharacters(timeframe), tickMarkFormatter: (time: Time, type: number) => formatTickMark(timeMs(time), type, "America/New_York", timeframe), timeVisible, secondsVisible: false, rightOffset: 4, minBarSpacing: 0.5 },
    localization: { timeFormatter: (time: Time) => formatCrosshairLabel(timeMs(time), "America/New_York", TIMEFRAME_MS[timeframe]) },
    crosshair: { mode: CrosshairMode.Normal },
  });
}

/** First candle index at or after `time` (the bar a trade happened on). */
function barAt(times: number[], time: number) {
  let low = 0, high = times.length - 1;
  while (low < high) { const mid = (low + high) >> 1; if (times[mid]! < time) low = mid + 1; else high = mid; }
  return Math.min(low, times.length - 1);
}

/** The tested market with the script's plots and every trade's entry and exit. */
export function StrategyLabChart({ candles, plots, overlay, trades, focusTrade, timeframe, theme, precision }: {
  candles: LabCandles | null; plots: LabPlot[]; overlay: boolean; trades: LabTrade[]; focusTrade: number | null; timeframe: Timeframe; theme: "dark" | "light"; precision: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !candles || candles.time.length < 2) return;
    const chart = baseChart(container, theme, timeframe, timeframe !== "1d");
    chartRef.current = chart;
    const series = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#f05b67", wickUpColor: "#22c55e", wickDownColor: "#f05b67", borderVisible: false, priceLineVisible: false, priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
    series.setData(candles.time.map((time, index) => ({ time: seconds(time), open: candles.open[index]!, high: candles.high[index]!, low: candles.low[index]!, close: candles.close[index]! })));
    for (const plot of plots) {
      const line = chart.addSeries(LineSeries, { color: plotColor(plot.color), lineWidth: Math.max(1, Math.min(4, plot.linewidth)) as 1 | 2 | 3 | 4, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } }, overlay ? 0 : 1);
      line.setData(candles.time.map((time, index) => { const value = plot.values[index]; return typeof value === "number" ? { time: seconds(time), value } : { time: seconds(time) }; }));
    }
    if (!overlay && plots.length) chart.panes()[1]?.setHeight(Math.round(container.clientHeight * 0.28));
    const markers: SeriesMarker<Time>[] = [];
    for (const trade of trades) {
      const long = trade.direction === "long";
      markers.push({ time: seconds(candles.time[barAt(candles.time, trade.entryTime)]!), position: long ? "belowBar" : "aboveBar", shape: long ? "arrowUp" : "arrowDown", color: long ? "#2962FF" : "#F23645", text: long ? "Long" : "Short", id: `in-${trade.number}` });
      markers.push({ time: seconds(candles.time[barAt(candles.time, trade.exitTime)]!), position: long ? "aboveBar" : "belowBar", shape: "circle", color: trade.pnl >= 0 ? "#22c55e" : "#f05b67", text: `${trade.pnl >= 0 ? "+" : "−"}${Math.abs(trade.pnl).toFixed(2)}`, id: `out-${trade.number}` });
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    createSeriesMarkers(series, markers);
    const bars = candles.time.length;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars - 150), to: bars + 4 });
    return () => { chart.remove(); chartRef.current = null; };
  }, [candles, plots, overlay, trades, timeframe, theme, precision]);

  useEffect(() => {
    const chart = chartRef.current;
    const trade = trades.find((item) => item.number === focusTrade);
    if (!chart || !candles || !trade) return;
    const from = barAt(candles.time, trade.entryTime), to = barAt(candles.time, trade.exitTime);
    const pad = Math.max(20, Math.round((to - from) * 0.6));
    chart.timeScale().setVisibleLogicalRange({ from: from - pad, to: to + pad });
  }, [focusTrade, trades, candles]);

  return <div ref={containerRef} className="absolute inset-0" data-testid="strategy-lab-chart" />;
}

/** Realized equity with drawdown bars underneath. */
export function StrategyEquityChart({ equity, startingBalance, timeframe, theme }: { equity: { time: number; balance: number }[]; startingBalance: number; timeframe: Timeframe; theme: "dark" | "light" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || equity.length < 2) return;
    const chart = baseChart(container, theme, "1d", false);
    chart.applyOptions({ crosshair: { horzLine: { visible: false } }, rightPriceScale: { scaleMargins: { top: 0.08, bottom: 0.3 } }, handleScroll: false, handleScale: false });
    const points = equity.filter((point, index) => index === 0 || point.time > equity[index - 1]!.time);
    const area = chart.addSeries(AreaSeries, { lineColor: "#45d6a8", topColor: "rgba(69,214,168,.28)", bottomColor: "rgba(69,214,168,.02)", lineWidth: 2, priceLineVisible: false, priceFormat: { type: "price", precision: 2, minMove: 0.01 } });
    area.setData(points.map((point) => ({ time: seconds(point.time), value: point.balance })));
    area.createPriceLine({ price: startingBalance, color: palette(theme).border, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "" });
    let peak = -Infinity;
    const drawdown = chart.addSeries(HistogramSeries, { priceScaleId: "drawdown", color: "rgba(240,91,103,.55)", priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "price", precision: 2, minMove: 0.01 } });
    chart.priceScale("drawdown").applyOptions({ scaleMargins: { top: 0.75, bottom: 0 }, visible: false });
    drawdown.setData(points.map((point) => { peak = Math.max(peak, point.balance); return { time: seconds(point.time), value: peak - point.balance }; }));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [equity, startingBalance, timeframe, theme]);
  return <div ref={containerRef} className="absolute inset-0" data-testid="strategy-equity-chart" />;
}
