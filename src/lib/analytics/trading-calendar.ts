import type { ClosedTrade } from "@/lib/backtest/types";
import { formatNewYorkDate, getNewYorkDateParts } from "@/lib/date-time";

export type CalendarCell = { day: number | null; value: number | null };
export type CalendarMonth = {
  key: string;
  label: string;
  /** Weekday indexes (0 = Sunday) this grid has a column for. */
  weekdays: number[];
  cells: CalendarCell[];
};

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Which weekday columns are worth drawing.
 *
 * Forex is shut from Friday evening until Sunday evening, so a Saturday column
 * is dead space on every month and Sunday is dead on almost all of them —
 * together nearly a third of the grid, spent on days the market does not open.
 *
 * Sunday cannot simply be assumed away, though. The week reopens at 21:00 UTC,
 * which is 17:00 in New York, so a trade opened and closed on Sunday evening is
 * real and belongs in a Sunday cell. The weekend therefore appears only when a
 * trade actually landed in it, and the decision is made once across the whole
 * session rather than per month, so the grid does not change width as the
 * reader steps between months.
 */
function tradedWeekdays(trades: ClosedTrade[]): number[] {
  const weekdays = new Set([1, 2, 3, 4, 5]);
  for (const trade of trades) {
    const weekday = getNewYorkDateParts(trade.exitTime).weekday;
    if (weekday === 0 || weekday === 6) weekdays.add(weekday);
  }
  return [...weekdays].sort((a, b) => a - b);
}

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
  const weekdays = tradedWeekdays(trades);
  if (totals.size === 0) {
    const now = getNewYorkDateParts(Date.now());
    return [buildCalendarMonth(now.year, now.month, new Map(), weekdays)];
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, days]) => {
      const [year, month] = key.split("-").map(Number);
      return buildCalendarMonth(year!, month!, days, weekdays);
    });
}

function buildCalendarMonth(
  year: number,
  month: number,
  totals: Map<number, number>,
  weekdays: number[],
): CalendarMonth {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Rows are still reckoned across the true seven-day week, so each date keeps
  // its real weekday column; the hidden days are dropped afterwards.
  const rows = Math.ceil((firstWeekday + days) / 7);
  const cells: CalendarCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    const week = weekdays.map((weekday): CalendarCell => {
      const day = row * 7 + weekday - firstWeekday + 1;
      return day < 1 || day > days ? { day: null, value: null } : { day, value: totals.get(day) ?? 0 };
    });
    // A week whose only dates were weekend days is not a row of this month —
    // February 2025 begins on a Saturday, and without this it would open with
    // a blank strip.
    if (week.some((cell) => cell.day !== null)) cells.push(...week);
  }
  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    // Mid-month, so the New York offset cannot spill the label into a
    // neighbouring month.
    label: formatNewYorkDate(Date.UTC(year, month - 1, 15), { month: "long", year: "numeric" }),
    weekdays,
    cells,
  };
}
