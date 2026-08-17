import type { ClosedTrade } from "@/lib/backtest/types";
import { formatNewYorkDate, getNewYorkDateParts } from "@/lib/date-time";

export type CalendarCell = { day: number | null; value: number | null };
export type CalendarMonth = { key: string; label: string; cells: CalendarCell[] };

/**
 * One grid per month that contains a trade, oldest first.
 *
 * This used to build a single month, chosen with
 * `trades.reduce(Math.max, Date.now())` — and since every replayed trade is
 * historical, today always won that comparison. The card drew the current
 * real-world month and summed the trades that closed in it, which for a
 * backtest of 2019 data is none of them: an empty grid, every time, for
 * anyone not looking at the sample.
 */
export function createCalendar(trades: ClosedTrade[]): CalendarMonth[] {
  const totals = new Map<string, Map<number, number>>();
  for (const trade of trades) {
    const point = getNewYorkDateParts(trade.exitTime);
    const key = `${point.year}-${String(point.month).padStart(2, "0")}`;
    const days = totals.get(key) ?? new Map<number, number>();
    days.set(point.day, (days.get(point.day) ?? 0) + Number(trade.pnl));
    totals.set(key, days);
  }
  if (totals.size === 0) {
    const now = getNewYorkDateParts(Date.now());
    return [buildCalendarMonth(now.year, now.month, new Map())];
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, days]) => {
      const [year, month] = key.split("-").map(Number);
      return buildCalendarMonth(year!, month!, days);
    });
}

function buildCalendarMonth(year: number, month: number, totals: Map<number, number>): CalendarMonth {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Only the rows the month actually needs. A fixed six left a dead strip
  // under most months.
  const rows = Math.ceil((firstWeekday + days) / 7);
  const cells: CalendarCell[] = Array.from({ length: rows * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day < 1 || day > days ? { day: null, value: null } : { day, value: totals.get(day) ?? 0 };
  });
  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    // Mid-month, so the New York offset cannot spill the label into a
    // neighbouring month.
    label: formatNewYorkDate(Date.UTC(year, month - 1, 15), { month: "long", year: "numeric" }),
    cells,
  };
}
