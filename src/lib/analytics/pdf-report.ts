import { jsPDF } from "jspdf";
import type { AnalyticsModel } from "@/components/app/AnalyticsDesignPrototype";
import type { ClosedTrade } from "@/lib/backtest/types";
import { analyticsTrades } from "./trade-scope";
import { formatNewYorkDateTime } from "@/lib/date-time";

export interface AnalyticsPdfInput {
  name: string;
  symbols: string[];
  period: string;
  model: AnalyticsModel;
  trades: ClosedTrade[];
  excludedTrades: number;
  realisedOnly: boolean;
  currency?: string;
  generatedAt?: Date;
}

// Built-in PDF fonts support Latin-1. Normalize punctuation and replace unsupported glyphs.
const clean = (value: unknown) => String(value ?? "Not available").replace(/[−–—]/g, "-").replace(/∞/g, "Infinity").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
const num = (value: number | null, digits = 2) => value == null || !Number.isFinite(value) ? "Not available" : value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (value: number | null) => value == null ? "Not available" : `${num(value)}%`;
export const analyticsPdfFilename = (name: string) => `${name.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "session"}-analytics.pdf`;

/** Vector text/charts: readable when printed, with no screenshots or external upload. */
export function createAnalyticsPdf(input: AnalyticsPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const left = 40, width = W - 80, bottom = H - 55;
  const ink = "#172e28", muted = "#61736d", green = "#087e66", red = "#bc4252";
  const m = input.model;
  let y = 0;
  const text = (value: unknown, x: number, top: number, size = 10, color = ink, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(color);
    doc.text(clean(value), x, top);
  };
  const wrap = (value: unknown, maxWidth: number, size = 10): string[] => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(size);
    return doc.splitTextToSize(clean(value), maxWidth);
  };
  const page = (title: string, first = false) => {
    if (!first) doc.addPage();
    doc.setFillColor(ink); doc.rect(0, 0, W, 43, "F");
    text("ForexTestLab", left, 27, 12, "#ffffff", true);
    text("ANALYTICS REPORT", W - 155, 27, 9, "#a4e7d4");
    text(title, left, 79, 22, ink, true);
    const lines = wrap(input.name, width, 10);
    doc.text(lines, left, 100); y = 100 + lines.length * 12 + 15;
  };
  const table = (title: string, headers: string[], rows: string[][], widths: number[]) => {
    const heading = (continued = false) => {
      if (y + 65 > bottom) page("Performance breakdown");
      text(title + (continued ? " (continued)" : ""), left, y, 13, ink, true); y += 14;
      doc.setFillColor("#eaf3ef"); doc.rect(left, y, width, 23, "F");
      let x = left;
      headers.forEach((label, i) => { text(label, x + 7, y + 15, 8, ink, true); x += widths[i]!; });
      y += 23;
    };
    heading();
    if (!rows.length) { text("No data available for this section.", left + 7, y + 18, 10, muted); y += 40; return; }
    rows.forEach((row, index) => {
      const lines = row.map((cell, i) => wrap(cell, widths[i]! - 14, 8));
      const height = Math.max(27, ...lines.map(item => item.length * 11 + 12));
      if (y + height > bottom) { page(title); heading(true); }
      if (index % 2 === 0) { doc.setFillColor("#f6f8f7"); doc.rect(left, y, width, height, "F"); }
      let x = left;
      lines.forEach((item, i) => { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(ink); doc.text(item, x + 7, y + 16); x += widths[i]!; });
      y += height;
    });
    y += 25;
  };
  const chart = (title: string, values: number[], color: string, height: number) => {
    if (y + height + 45 > bottom) page("Performance charts");
    text(title, left, y, 13, ink, true); y += 20;
    if (values.length < 2) { text("Not enough recorded data to plot.", left, y + 20, 10, muted); y += height; return; }
    let low = Infinity, high = -Infinity;
    for (const value of values) { if (Number.isFinite(value)) { low = Math.min(low, value); high = Math.max(high, value); } }
    if (!Number.isFinite(low)) { y += height; return; }
    const spread = high - low || Math.max(1, Math.abs(high) * .01);
    const min = low - spread * .05, max = high + spread * .05;
    const x0 = left + 65, plotWidth = width - 70, plotHeight = height - 30;
    for (let i = 0; i <= 4; i++) {
      const top = y + i * plotHeight / 4;
      doc.setDrawColor("#dfe7e3"); doc.setLineWidth(.5); doc.line(x0, top, left + width, top);
      text(num(max - i * (max - min) / 4), left, top + 3, 7, muted);
    }
    doc.setDrawColor(color); doc.setLineWidth(1);
    // Keep both extrema per pixel bucket so short drawdowns are not lost in long sessions.
    const step = Math.max(1, Math.ceil(values.length / 600));
    const points: { index: number; value: number }[] = [];
    for (let start = 0; start < values.length; start += step) {
      const end = Math.min(values.length, start + step);
      let minIndex = start, maxIndex = start;
      for (let i = start; i < end; i++) { if (values[i]! < values[minIndex]!) minIndex = i; if (values[i]! > values[maxIndex]!) maxIndex = i; }
      for (const index of [...new Set([start, minIndex, maxIndex, end - 1])].sort((a, b) => a - b)) points.push({ index, value: values[index]! });
    }
    let previous: [number, number] | null = null;
    for (const point of points) {
      if (!Number.isFinite(point.value)) { previous = null; continue; }
      const x = x0 + point.index / (values.length - 1) * plotWidth, top = y + (max - point.value) / (max - min) * plotHeight;
      if (previous) doc.line(previous[0], previous[1], x, top);
      previous = [x, top];
    }
    text("First recorded point", x0, y + plotHeight + 14, 7, muted);
    text("Latest recorded point", left + width - 85, y + plotHeight + 14, 7, muted);
    y += height + 20;
  };

  page("Session performance", true);
  text(input.symbols.join(" / "), left, y, 10, green, true); y += 17;
  text(input.period, left, y, 9, muted); y += 24;
  text(`Account currency: ${input.currency ?? "USD"}`, left, y - 9, 8, muted);
  const cards = [
    ["Net profit", num(m.netProfit)], ["Return", pct(m.returnPercent)], ["Win rate", m.winRate === "Not available" ? m.winRate : `${m.winRate}%`],
    ["Closed trades", String(m.closedTrades)], ["Profit factor", m.profitFactor], ["Maximum drawdown", num(m.maxDrawdown)],
  ];
  cards.forEach(([label, value], i) => {
    const x = left + i % 3 * (width / 3), top = y + Math.floor(i / 3) * 65;
    doc.setFillColor("#f0f6f3"); doc.roundedRect(x, top, width / 3 - 9, 55, 4, 4, "F");
    text(label, x + 10, top + 17, 8, muted); text(value, x + 10, top + 39, 15, ink, true);
  });
  y += 150;
  chart(input.realisedOnly ? "Realised balance (included trades)" : "Recorded equity", m.equity, green, 145);
  chart(input.realisedOnly ? "Realised drawdown" : "Recorded drawdown", m.drawdown, red, 120);
  const notes = `Experimental trades excluded: ${input.excludedTrades}. Closed trades only in trade metrics. ${input.realisedOnly ? "Equity and balance paths are reconstructed from included trades; intratrade drawdown is unavailable." : "Equity includes recorded unrealised changes; the ledger contains closed trades."} Dates and trade times use America/New_York. Monetary values are in account currency. This is a simulated trading report.`;
  const noteLines = wrap(notes, width, 9);
  if (y + noteLines.length * 12 > bottom) page("Report notes");
  doc.setFontSize(9); doc.setTextColor(muted); doc.text(noteLines, left, y);

  page("Detailed statistics");
  const metrics: [string, string][] = [
    ["Ending balance", num(m.endingBalance)], ["Net profit", num(m.netProfit)], ["Return", pct(m.returnPercent)],
    ["Winning / losing / breakeven trades", `${m.winningTrades} / ${m.losingTrades} / ${m.closedTrades - m.winningTrades - m.losingTrades}`],
    ["Gross profit / gross loss", `${num(m.grossProfit)} / ${num(m.grossLoss)}`], ["Expectancy", num(m.expectancy)],
    ["Average win / average loss", `${num(m.averageWin)} / ${num(m.averageLoss)}`], ["Best / worst trade", `${num(m.bestTrade)} / ${num(m.worstTrade)}`],
    ["Average R", m.averageR], ["Payoff ratio", m.payoffRatio], ["Maximum drawdown (%)", pct(m.maxDrawdownPercent)],
    ["Recovery factor", m.maxDrawdown == null ? "Not available" : num(m.recoveryFactor)], ["Average holding time", m.averageHold],
    ["Longest win / loss streak", `${m.maxConsecutiveWins} / ${m.maxConsecutiveLosses}`], ["Trading days", String(m.tradingDays)],
    ["Trades per trading day", num(m.tradesPerDay)], ["Trades per month", num(m.tradesPerMonth)], ["Maximum lot size", num(m.maxLot)],
  ];
  table("Performance and risk", ["Metric", "Value"], metrics, [width * .6, width * .4]);
  page("Performance breakdown");
  table("Monthly returns", ["Month", "Net profit", "Return"], m.monthlyReturns.map(row => [row.key, num(row.profit), pct(row.percent)]), [width * .4, width * .3, width * .3]);
  for (const [title, rows] of [["By direction", [m.directions.long, m.directions.short]], ["By trading session", m.sessions], ["By weekday", m.weekdays], ["By exit reason", m.exits], ["By position size", m.sizes], ["By holding time", m.holding]] as const) {
    table(title, ["Group", "Trades", "Net profit", "Win rate"], rows.map(row => [row.label, String(row.trades), num(row.value), row.winRate == null && row.rate == null ? "-" : `${row.winRate ?? row.rate}%`]), [width * .4, width * .15, width * .25, width * .2]);
  }
  table("R distribution", ["Range", "Trades"], m.rDistribution.map(row => [row.label, String(row.count)]), [width * .6, width * .4]);
  if (y + 160 > bottom) page("Trade ledger");
  table("Included closed trades", ["Closed (New York)", "Symbol / side", "Lots", "Entry / exit", "Net P&L"], analyticsTrades(input.trades).map(trade => [
    formatNewYorkDateTime(trade.exitTime, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    `${trade.symbol ?? input.symbols[0] ?? "-"} / ${trade.direction === "long" ? "Buy" : "Sell"}`, trade.lots,
    `${trade.entryPrice} / ${trade.exitPrice}`, num(Number(trade.pnl)),
  ]), [width * .23, width * .21, width * .08, width * .30, width * .18]);
  const generated = (input.generatedAt ?? new Date()).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  for (let index = 1; index <= doc.getNumberOfPages(); index++) {
    doc.setPage(index); doc.setDrawColor("#dfe7e3"); doc.line(left, H - 39, W - left, H - 39);
    text(`Generated ${generated}`, left, H - 23, 7, muted);
    text(`${index} / ${doc.getNumberOfPages()}`, W - left - 28, H - 23, 8, muted);
  }
  doc.setProperties({ title: `${clean(input.name)} - Analytics`, author: "ForexTestLab", subject: "Simulated trading performance" });
  return doc;
}
