"use client";

import { Clock3, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { MetricInfo } from "@/components/app/MetricInfo";
import {
  EXCHANGE_ZONE,
  TIME_ZONES,
  resolveZone,
  zoneOffsetLabel,
} from "@/lib/chart/timezones";
import { DISPLAY_TIME_ZONE, DISPLAY_TIME_ZONE_LABEL } from "@/lib/date-time";

/**
 * Which zone the report is read in, said out loud.
 *
 * It used to appear once, in small print under the page title, and nowhere on
 * the dashboard at all — while the zone silently decides which calendar cell
 * and which weekday bucket a trade lands in.
 *
 * The warning is the more important half. Charts have their own zone picker,
 * and its own documentation promises that choosing a zone "re-labels every
 * chart's axis and crosshair, and the session clock, together". The reports do
 * not follow it, so a trader who moved their charts to London would read these
 * dates as London and be wrong, with nothing on screen admitting the two views
 * disagree. When that setting differs, this says so.
 */
export function ReportTimeZone({
  sessionId,
  startTime,
  endTime,
  className = "",
}: {
  /**
   * The session whose chart preference to check. Chart settings are stored per
   * session, so without one there is no divergence to report.
   */
  sessionId?: string;
  /** The report's period, used to decide whether one offset covers all of it. */
  startTime?: number;
  endTime?: number;
  className?: string;
}) {
  const chartZone = useChartZone(sessionId);
  const offset = fixedOffsetLabel(startTime, endTime);
  const diverges = chartZone !== null && resolveZone(chartZone) !== DISPLAY_TIME_ZONE;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
        diverges
          ? "border-amber-300/30 bg-amber-300/[0.08] text-amber-200"
          : "app-border bg-[var(--app-panel-2)] app-muted"
      } ${className}`}
    >
      {diverges ? <TriangleAlert size={11} aria-hidden /> : <Clock3 size={11} aria-hidden />}
      {DISPLAY_TIME_ZONE_LABEL} time{offset ? ` · ${offset}` : ""}
      {diverges && (
        <span className="font-normal">
          — your charts use {zoneLabel(chartZone)}
        </span>
      )}
      <MetricInfo
        term="New York time"
        detail={
          diverges
            ? `Your charts for this session are set to ${zoneLabel(chartZone)}. Chart axes, the crosshair and the session clock use that zone; this report does not, so a trade late in your evening can sit on a different day here than it does on the chart.`
            : undefined
        }
      />
    </span>
  );
}

/**
 * One offset, but only when it is true for the whole report.
 *
 * An offset belongs to a moment rather than to a place: New York is UTC−5 in
 * January and UTC−4 in July. Printing a single figure over a period that
 * crosses a daylight-saving boundary would be wrong for half the data, so in
 * that case the badge names the zone alone and the (i) explains the shift.
 */
export function fixedOffsetLabel(startTime?: number, endTime?: number): string | null {
  if (startTime == null || endTime == null) return null;
  const start = zoneOffsetLabel(EXCHANGE_ZONE, startTime);
  return start === zoneOffsetLabel(EXCHANGE_ZONE, endTime) ? start : null;
}

function zoneLabel(zone: string): string {
  return TIME_ZONES.find((option) => option.id === zone)?.label ?? zone.replaceAll("_", " ");
}

/**
 * The chart zone this session was last read in.
 *
 * Read after mount, never during render: it lives in local storage, so a
 * server-rendered badge cannot know it and claiming otherwise would mismatch
 * on hydration. Until it resolves the badge simply states the report's zone,
 * which is true either way.
 */
function useChartZone(sessionId?: string): string | null {
  const [zone, setZone] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    try {
      const raw = window.localStorage.getItem(`forextestlab:chart-settings:${sessionId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { timeZone?: unknown };
      if (typeof parsed.timeZone === "string" && parsed.timeZone) setZone(parsed.timeZone);
    } catch {
      // A malformed or unreadable preference is not worth surfacing; the badge
      // still tells the truth about the report.
    }
  }, [sessionId]);

  return zone;
}
