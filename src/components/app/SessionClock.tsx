"use client";

import { useEffect, useRef, useState } from "react";

import { formatInZone, zoneOffsetLabel } from "@/lib/chart/timezones";
import { TIMEFRAME_MS, type Timeframe } from "@/lib/market-data/types";

/**
 * The session's own clock, ticking in simulated time.
 *
 * Candles arrive one per cadence, so a clock that only showed the latest candle
 * would jump a whole timeframe at a time and sit frozen in between. Between
 * candles this advances at the replay speed — the same rate the engine is
 * moving the market — so the seconds read like a live feed and never run past
 * the bar being formed.
 */

export function SessionClock({
  /** Timestamp of the candle currently in play. */
  candleTime,
  timeframe,
  /** Simulated seconds per real second. */
  speed,
  running,
  zone,
}: {
  candleTime: number | null;
  timeframe: Timeframe;
  speed: number;
  running: boolean;
  zone: string;
}) {
  const [now, setNow] = useState(candleTime);
  const candleArrivedAt = useRef<number>(0);

  useEffect(() => {
    candleArrivedAt.current = performance.now();
    setNow(candleTime);
  }, [candleTime]);

  useEffect(() => {
    if (!running || candleTime == null) return;
    const barMs = TIMEFRAME_MS[timeframe];
    const tick = window.setInterval(() => {
      const elapsed = performance.now() - candleArrivedAt.current;
      // Never overshoot the bar in progress: the next candle owns that moment.
      setNow(candleTime + Math.min(elapsed * speed, barMs - 1000));
    }, 200);
    return () => window.clearInterval(tick);
  }, [candleTime, timeframe, speed, running]);

  const at = now ?? candleTime;
  return (
    <div
      className="flex flex-col justify-center gap-0.5 leading-none"
      data-testid="session-clock"
      // The strip has no room for the date, which still matters in a replay.
      title={
        at == null
          ? undefined
          : formatInZone(at, zone, {
              weekday: "long",
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            })
      }
    >
      <span className="text-[10px] font-medium app-muted">
        Session time <span className="font-mono">{at == null ? "" : zoneOffsetLabel(zone, at)}</span>
      </span>
      <span className="font-mono text-xs font-semibold">
        {at == null
          ? "--:--:--"
          : formatInZone(at, zone, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hourCycle: "h23",
            })}
      </span>
    </div>
  );
}
