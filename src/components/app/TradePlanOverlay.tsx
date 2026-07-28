"use client";

import { useEffect, useRef } from "react";
import type {
  IChartApi,
  ISeriesApi,
  SeriesType,
} from "lightweight-charts";

import type { TradePlan } from "@/lib/backtest/trade-plan";

type Level = "entryPrice" | "stopLoss" | "takeProfit";

interface TradePlanOverlayProps {
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
  plan: TradePlan;
  precision: number;
  viewVersion: number;
  onChange: (level: Level, value: string) => void;
}

const LEVELS: {
  key: Level;
  label: string;
  line: string;
  badge: string;
}[] = [
  {
    key: "entryPrice",
    label: "ENTRY",
    line: "border-sky-400",
    badge: "bg-sky-500 text-white",
  },
  {
    key: "stopLoss",
    label: "SL",
    line: "border-bear",
    badge: "bg-bear text-white",
  },
  {
    key: "takeProfit",
    label: "TP",
    line: "border-brand-400",
    badge: "bg-brand-500 text-surface-950",
  },
];

export function TradePlanOverlay({
  chart,
  series,
  plan,
  precision,
  viewVersion,
  onChange,
}: TradePlanOverlayProps) {
  const elements = useRef(new Map<Level, HTMLButtonElement>());
  const draft = useRef(plan);
  const dragging = useRef<Level | null>(null);

  useEffect(() => {
    draft.current = plan;
    if (!dragging.current) placeLines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, viewVersion, chart, series]);

  function placeLines() {
    for (const { key } of LEVELS) {
      const element = elements.current.get(key);
      const rawPrice = draft.current[key].trim();
      const price = Number(rawPrice);
      const coordinate = rawPrice !== "" && Number.isFinite(price)
        ? series.priceToCoordinate(price)
        : null;
      if (!element || coordinate == null) {
        if (element) element.style.visibility = "hidden";
        continue;
      }
      element.style.top = `${coordinate}px`;
      element.style.visibility = "visible";
      const badge = element.querySelector<HTMLElement>("[data-level-badge]");
      if (badge) {
        badge.textContent = `${LEVELS.find((level) => level.key === key)?.label ?? ""} ${price.toFixed(precision)}`;
      }
    }
  }

  function begin(level: Level, event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = level;
  }

  function move(level: Level, event: React.PointerEvent<HTMLButtonElement>) {
    if (dragging.current !== level) return;
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds) return;
    const price = series.coordinateToPrice(event.clientY - bounds.top);
    if (price == null || !Number.isFinite(price)) return;
    draft.current = {
      ...draft.current,
      [level]: price.toFixed(precision),
    };
    placeLines();
  }

  function end(level: Level, event: React.PointerEvent<HTMLButtonElement>) {
    if (dragging.current !== level) return;
    dragging.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onChange(level, draft.current[level]);
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      data-testid="trade-plan-overlay"
      data-direction={plan.direction}
      aria-label={`${plan.direction === "long" ? "Buy" : "Sell"} trade plan`}
    >
      {LEVELS.filter(({ key }) => plan[key].trim() !== "").map(({ key, line, badge }) => (
        <button
          key={key}
          ref={(element) => {
            if (element) elements.current.set(key, element);
            else elements.current.delete(key);
          }}
          type="button"
          data-testid={`trade-plan-${key}`}
          aria-label={`Drag planned ${key === "entryPrice" ? "entry" : key === "stopLoss" ? "stop loss" : "take profit"}`}
          onPointerDown={(event) => begin(key, event)}
          onPointerMove={(event) => move(key, event)}
          onPointerUp={(event) => end(key, event)}
          onPointerCancel={(event) => end(key, event)}
          className={`pointer-events-auto absolute left-0 right-16 h-5 -translate-y-1/2 touch-none cursor-ns-resize border-t border-dashed ${line}`}
          style={{ top: 0, visibility: "hidden" }}
        >
          <span
            data-level-badge
            className={`absolute right-1 top-[-12px] rounded px-1.5 py-0.5 font-mono text-[10px] font-bold shadow ${badge}`}
          />
        </button>
      ))}
    </div>
  );
}
