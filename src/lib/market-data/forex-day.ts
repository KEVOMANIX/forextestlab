const DAY = 86_400_000;
const closes = new Map<number, number>();
const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" });

/** 17:00 New York on a UTC calendar date, including daylight saving time. */
function closeOnDate(date: number): number {
  const cached = closes.get(date);
  if (cached !== undefined) return cached;
  // Noon UTC is safely away from the DST transition; New York is UTC-4 or -5.
  const localHour = Number(clock.format(date + 12 * 3_600_000));
  const close = date + (17 + 12 - localHour) * 3_600_000;
  if (closes.size >= 10_000) closes.clear();
  closes.set(date, close);
  return close;
}

/** Actual opening instant of a daily forex bar, never later than its input. */
export function forexDailyStart(at: number): number {
  const date = Math.floor(at / DAY) * DAY;
  const close = closeOnDate(date);
  return at >= close ? close : closeOnDate(date - DAY);
}

export function nextForexDailyBoundary(start: number, count = 1): number {
  return closeOnDate(Math.floor(start / DAY) * DAY + count * DAY);
}

/** Daily bars are named for their closing trading date, independent of display zone. */
export function forexDailyLabelDate(start: number): number {
  return Math.floor(nextForexDailyBoundary(forexDailyStart(start)) / DAY) * DAY;
}

export function isForexDailyTradingDay(start: number): boolean {
  const day = new Date(forexDailyLabelDate(start)).getUTCDay();
  return day >= 1 && day <= 5;
}
