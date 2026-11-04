import { formatInZone } from "@/lib/chart/timezones";
import { newYorkDateEnd, newYorkDateStart, toNewYorkDateInput } from "@/lib/date-time";

const DAY_MS = 86_400_000;

export function blindDayLabel(at: number, startTime: number): string {
  const day = Math.round((Date.parse(`${toNewYorkDateInput(at)}T12:00:00Z`) - Date.parse(`${toNewYorkDateInput(startTime)}T12:00:00Z`)) / DAY_MS) + 1;
  return day > 0 ? `Day ${day}` : "Warm-up";
}

export interface BlindHistoryRange { startTime: number; endTime: number }

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

function candidates(ranges: BlindHistoryRange[], days: number) {
  return ranges.map((range) => {
    const first = toNewYorkDateInput(range.startTime);
    const last = addDays(toNewYorkDateInput(range.endTime), 1 - days);
    const slots = last >= first ? Math.round((Date.parse(`${last}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / DAY_MS) + 1 : 0;
    return { range, first, slots };
  }).filter((item) => item.slots > 0);
}

export function randomBlindWindowAvailable(ranges: BlindHistoryRange[], days: number): boolean {
  return candidates(ranges, days).length > 0;
}

export function randomBlindWindow(ranges: BlindHistoryRange[], days: number, draw?: (total: number) => number): BlindHistoryRange | null {
  const options = candidates(ranges, days);
  const total = options.reduce((sum, item) => sum + item.slots, 0);
  if (!total) return null;
  const random = new Uint32Array(1);
  const slotDraw = draw ? draw(total) : (crypto.getRandomValues(random), random[0]! % total);
  let slot = Math.max(0, Math.min(total - 1, Math.floor(slotDraw)));
  for (const option of options) {
    if (slot < option.slots) {
      const firstDay = addDays(option.first, slot);
      const lastDay = addDays(firstDay, days - 1);
      return {
        startTime: Math.max(option.range.startTime, newYorkDateStart(firstDay)),
        endTime: Math.min(option.range.endTime, newYorkDateEnd(lastDay)),
      };
    }
    slot -= option.slots;
  }
  return null;
}

export function blindTimeLabel(at: number, startTime: number, zone: string, includeClock = true): string {
  const day = blindDayLabel(at, startTime);
  if (!includeClock) return day;
  const clock = formatInZone(at, zone, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} · ${clock}`;
}

export function blindTickLabel(at: number, tickMarkType: number, startTime: number, zone: string): string {
  return tickMarkType >= 3
    ? formatInZone(at, zone, { hour: "2-digit", minute: "2-digit", hour12: false })
    : blindDayLabel(at, startTime);
}
