"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { IChartApi, ISeriesApi, SeriesType, Time, UTCTimestamp } from "lightweight-charts";

import {
  DRAWING_POINTS,
  FIB_LEVELS,
  FIB_EXT_LEVELS,
  TEXT_TOOLS,
  drawingId,
  type Drawing,
  type DrawingPoint,
  type DrawingTool,
} from "@/lib/chart/drawings";

type Tool = DrawingTool | "measure" | null;

/** Parameter at which a ray leaving (px,py) in direction (dx,dy) hits the canvas edge. */
function borderT(px: number, py: number, dx: number, dy: number, W: number, H: number): number {
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (W - px) / dx);
  else if (dx < 0) t = Math.min(t, -px / dx);
  if (dy > 0) t = Math.min(t, (H - py) / dy);
  else if (dy < 0) t = Math.min(t, -py / dy);
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}

/** Extend a segment to the canvas borders in either/both directions. */
function extendSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  W: number,
  H: number,
  extendStart: boolean,
  extendEnd: boolean,
): { sx: number; sy: number; ex: number; ey: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let sx = x1;
  let sy = y1;
  let ex = x2;
  let ey = y2;
  if (extendEnd) {
    const t = borderT(x1, y1, dx, dy, W, H);
    ex = x1 + dx * t;
    ey = y1 + dy * t;
  }
  if (extendStart) {
    const t = borderT(x1, y1, -dx, -dy, W, H);
    sx = x1 - dx * t;
    sy = y1 - dy * t;
  }
  return { sx, sy, ex, ey };
}

/** SVG polygon points for a filled arrowhead at (x2,y2) pointing away from (x1,y1). */
function arrowHead(x1: number, y1: number, x2: number, y2: number, size = 10): string {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const a1 = ang + Math.PI - 0.42;
  const a2 = ang + Math.PI + 0.42;
  return `${x2},${y2} ${x2 + size * Math.cos(a1)},${y2 + size * Math.sin(a1)} ${x2 + size * Math.cos(a2)},${y2 + size * Math.sin(a2)}`;
}

interface Props {
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType> | null;
  tool: Tool;
  drawings: Drawing[];
  onDrawingsChange: (next: Drawing[]) => void;
  onToolComplete: () => void;
  viewVersion: number;
  precision: number;
  pipSize: number;
  color: string;
}

interface Px {
  x: number;
  y: number;
}

export function PriceChartDrawings({
  chart,
  series,
  tool,
  drawings,
  onDrawingsChange,
  onToolComplete,
  viewVersion,
  precision,
  pipSize,
  color,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pending, setPending] = useState<DrawingPoint[]>([]);
  const [cursor, setCursor] = useState<Px | null>(null);
  const [measure, setMeasure] = useState<{ a: DrawingPoint; b: DrawingPoint } | null>(null);
  const measuring = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => setSize({ w: host.clientWidth, h: host.clientHeight }));
    ro.observe(host);
    setSize({ w: host.clientWidth, h: host.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Reset in-progress state when the tool changes or is cleared.
  useEffect(() => {
    setPending([]);
    setCursor(null);
    if (tool !== "measure") setMeasure(null);
  }, [tool]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPending([]);
        setMeasure(null);
        onToolComplete();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToolComplete]);

  const toX = (time: number): number | null => {
    const c = chart?.timeScale().timeToCoordinate(time as UTCTimestamp);
    return typeof c === "number" ? c : null;
  };
  const toY = (price: number): number | null => {
    const c = series?.priceToCoordinate(price);
    return typeof c === "number" ? c : null;
  };
  const fromPx = (px: Px): DrawingPoint | null => {
    const t = chart?.timeScale().coordinateToTime(px.x) as Time | null | undefined;
    const p = series?.coordinateToPrice(px.y);
    if (p == null) return null;
    const time = typeof t === "number" ? t : 0;
    return { time, price: p };
  };

  function localPx(e: React.PointerEvent): Px {
    const rect = hostRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!tool || !chart || !series) return;
    const px = localPx(e);
    const point = fromPx(px);
    if (!point) return;
    if (tool === "measure") {
      measuring.current = true;
      hostRef.current?.setPointerCapture(e.pointerId);
      setMeasure({ a: point, b: point });
      return;
    }
    const next = [...pending, point];
    if (next.length >= DRAWING_POINTS[tool]) {
      let text: string | undefined;
      if (TEXT_TOOLS.has(tool)) {
        text = window.prompt("Text:")?.trim() || "";
        if (!text) {
          // Cancelled or empty — discard.
          setPending([]);
          setCursor(null);
          onToolComplete();
          return;
        }
      }
      onDrawingsChange([...drawings, { id: drawingId(), tool, points: next, color, text }]);
      setPending([]);
      setCursor(null);
      onToolComplete();
    } else {
      setPending(next);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!tool) return;
    const px = localPx(e);
    if (tool === "measure" && measuring.current) {
      const point = fromPx(px);
      if (point) setMeasure((m) => (m ? { ...m, b: point } : m));
      return;
    }
    setCursor(px);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (tool === "measure" && measuring.current) {
      measuring.current = false;
      if (hostRef.current?.hasPointerCapture(e.pointerId)) hostRef.current.releasePointerCapture(e.pointerId);
      onToolComplete();
    }
  }

  // Recompute pixel geometry whenever the view changes.
  const geometry = useMemo(() => {
    void viewVersion;
    void size;
    if (!chart || !series) return null;
    const W = size.w;
    const H = size.h;
    const lines: React.ReactNode[] = [];
    const handles: { id: string; x: number; y: number }[] = [];

    drawings.forEach((d) => {
      if (d.tool === "horizontal") {
        const y = toY(d.points[0]!.price);
        if (y == null) return;
        lines.push(
          <g key={d.id}>
            <line x1={0} x2={W} y1={y} y2={y} stroke={d.color} strokeWidth={1.5} strokeDasharray="6 3" />
            <rect x={4} y={y - 9} width={70} height={16} rx={3} fill={d.color} opacity={0.9} />
            <text x={8} y={y + 3} fontSize={10} fill="#0b0f1a" fontFamily="monospace">
              {d.points[0]!.price.toFixed(precision)}
            </text>
          </g>,
        );
        handles.push({ id: d.id, x: W - 22, y: y - 8 });
      } else if (d.tool === "vertical") {
        const x = toX(d.points[0]!.time);
        if (x == null) return;
        lines.push(
          <line key={d.id} x1={x} x2={x} y1={0} y2={H} stroke={d.color} strokeWidth={1.5} strokeDasharray="6 3" />,
        );
        handles.push({ id: d.id, x: x + 4, y: 6 });
      } else if (d.tool === "trend") {
        const x1 = toX(d.points[0]!.time);
        const y1 = toY(d.points[0]!.price);
        const x2 = toX(d.points[1]!.time);
        const y2 = toY(d.points[1]!.price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) return;
        lines.push(
          <g key={d.id}>
            <line x1={x1} x2={x2} y1={y1} y2={y2} stroke={d.color} strokeWidth={2} />
            <circle cx={x1} cy={y1} r={3} fill={d.color} />
            <circle cx={x2} cy={y2} r={3} fill={d.color} />
          </g>,
        );
        handles.push({ id: d.id, x: Math.max(x1, x2) + 4, y: (y1 + y2) / 2 - 8 });
      } else if (d.tool === "rectangle") {
        const x1 = toX(d.points[0]!.time);
        const y1 = toY(d.points[0]!.price);
        const x2 = toX(d.points[1]!.time);
        const y2 = toY(d.points[1]!.price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) return;
        lines.push(
          <rect
            key={d.id}
            x={Math.min(x1, x2)}
            y={Math.min(y1, y2)}
            width={Math.abs(x2 - x1)}
            height={Math.abs(y2 - y1)}
            fill={d.color}
            fillOpacity={0.08}
            stroke={d.color}
            strokeWidth={1.5}
          />,
        );
        handles.push({ id: d.id, x: Math.max(x1, x2) - 18, y: Math.min(y1, y2) + 2 });
      } else if (d.tool === "fib") {
        const p0 = d.points[0]!;
        const p1 = d.points[1]!;
        const x1 = toX(p0.time);
        const x2 = toX(p1.time);
        if (x1 == null || x2 == null) return;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        lines.push(
          <g key={d.id}>
            {FIB_LEVELS.map((lvl) => {
              const price = p0.price + (p1.price - p0.price) * (1 - lvl);
              const y = toY(price);
              if (y == null) return null;
              return (
                <g key={lvl}>
                  <line x1={left} x2={right} y1={y} y2={y} stroke={d.color} strokeWidth={1} strokeOpacity={0.75} />
                  <text x={right + 4} y={y + 3} fontSize={9} fill={d.color} fontFamily="monospace">
                    {lvl.toFixed(3)} · {price.toFixed(precision)}
                  </text>
                </g>
              );
            })}
          </g>,
        );
        handles.push({ id: d.id, x: left - 18, y: (toY(p0.price) ?? 0) - 8 });
      } else if (d.tool === "ray" || d.tool === "extended" || d.tool === "arrow" || d.tool === "info") {
        const x1 = toX(d.points[0]!.time);
        const y1 = toY(d.points[0]!.price);
        const x2 = toX(d.points[1]!.time);
        const y2 = toY(d.points[1]!.price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) return;
        const ext = extendSegment(x1, y1, x2, y2, W, H, d.tool === "extended", d.tool === "ray" || d.tool === "extended");
        const dP = d.points[1]!.price - d.points[0]!.price;
        const pips = dP / pipSize;
        const pct = d.points[0]!.price ? (dP / d.points[0]!.price) * 100 : 0;
        lines.push(
          <g key={d.id}>
            <line x1={ext.sx} y1={ext.sy} x2={ext.ex} y2={ext.ey} stroke={d.color} strokeWidth={d.tool === "info" ? 1.5 : 2} />
            {d.tool === "arrow" && <polygon points={arrowHead(x1, y1, x2, y2, 11)} fill={d.color} />}
            <circle cx={x1} cy={y1} r={3} fill={d.color} />
            <circle cx={x2} cy={y2} r={3} fill={d.color} />
            {d.tool === "info" && (
              <text x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2 - 6} fontSize={10} fill={d.color} fontFamily="monospace">
                {pips >= 0 ? "+" : ""}
                {pips.toFixed(1)} pips · {pct.toFixed(2)}%
              </text>
            )}
          </g>,
        );
        handles.push({ id: d.id, x: Math.max(x1, x2) + 4, y: (y1 + y2) / 2 - 8 });
      } else if (d.tool === "hray") {
        const x = toX(d.points[0]!.time);
        const y = toY(d.points[0]!.price);
        if (x == null || y == null) return;
        lines.push(
          <g key={d.id}>
            <line x1={x} x2={W} y1={y} y2={y} stroke={d.color} strokeWidth={1.5} />
            <circle cx={x} cy={y} r={3} fill={d.color} />
            <rect x={x + 6} y={y - 9} width={70} height={16} rx={3} fill={d.color} opacity={0.9} />
            <text x={x + 10} y={y + 3} fontSize={10} fill="#0b0f1a" fontFamily="monospace">
              {d.points[0]!.price.toFixed(precision)}
            </text>
          </g>,
        );
        handles.push({ id: d.id, x: x - 20, y: y - 8 });
      } else if (d.tool === "ellipse") {
        const x1 = toX(d.points[0]!.time);
        const y1 = toY(d.points[0]!.price);
        const x2 = toX(d.points[1]!.time);
        const y2 = toY(d.points[1]!.price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) return;
        lines.push(
          <ellipse
            key={d.id}
            cx={(x1 + x2) / 2}
            cy={(y1 + y2) / 2}
            rx={Math.abs(x2 - x1) / 2}
            ry={Math.abs(y2 - y1) / 2}
            fill={d.color}
            fillOpacity={0.08}
            stroke={d.color}
            strokeWidth={1.5}
          />,
        );
        handles.push({ id: d.id, x: Math.max(x1, x2) - 18, y: Math.min(y1, y2) + 2 });
      } else if (d.tool === "triangle") {
        const pts = d.points.map((p) => ({ x: toX(p.time), y: toY(p.price) }));
        if (pts.some((p) => p.x == null || p.y == null)) return;
        lines.push(
          <polygon
            key={d.id}
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill={d.color}
            fillOpacity={0.08}
            stroke={d.color}
            strokeWidth={1.5}
          />,
        );
        handles.push({ id: d.id, x: (pts[0]!.x as number) + 4, y: (pts[0]!.y as number) - 8 });
      } else if (d.tool === "parallel") {
        const x0 = toX(d.points[0]!.time);
        const y0 = toY(d.points[0]!.price);
        const x1 = toX(d.points[1]!.time);
        const y1 = toY(d.points[1]!.price);
        const x2 = toX(d.points[2]!.time);
        const y2 = toY(d.points[2]!.price);
        if (x0 == null || y0 == null || x1 == null || y1 == null || x2 == null || y2 == null) return;
        const vx = x2 - x0;
        const vy = y2 - y0;
        lines.push(
          <g key={d.id}>
            <polygon
              points={`${x0},${y0} ${x1},${y1} ${x1 + vx},${y1 + vy} ${x0 + vx},${y0 + vy}`}
              fill={d.color}
              fillOpacity={0.07}
              stroke="none"
            />
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={d.color} strokeWidth={1.5} />
            <line x1={x0 + vx} y1={y0 + vy} x2={x1 + vx} y2={y1 + vy} stroke={d.color} strokeWidth={1.5} />
          </g>,
        );
        handles.push({ id: d.id, x: Math.max(x0, x1) + 4, y: Math.min(y0, y1) - 8 });
      } else if (d.tool === "fibext") {
        const p0 = d.points[0]!;
        const p1 = d.points[1]!;
        const p2 = d.points[2]!;
        const xl = toX(p2.time);
        if (xl == null) return;
        const diff = p1.price - p0.price;
        lines.push(
          <g key={d.id}>
            {FIB_EXT_LEVELS.map((lvl) => {
              const price = p2.price + diff * lvl;
              const y = toY(price);
              if (y == null) return null;
              return (
                <g key={lvl}>
                  <line x1={xl} x2={W} y1={y} y2={y} stroke={d.color} strokeWidth={1} strokeOpacity={0.75} />
                  <text x={xl + 4} y={y - 2} fontSize={9} fill={d.color} fontFamily="monospace">
                    {lvl.toFixed(3)} · {price.toFixed(precision)}
                  </text>
                </g>
              );
            })}
          </g>,
        );
        handles.push({ id: d.id, x: xl - 18, y: (toY(p2.price) ?? 0) - 8 });
      } else if (d.tool === "long" || d.tool === "short") {
        const entry = d.points[0]!;
        const stop = d.points[1]!;
        const target = d.points[2]!;
        const xL = toX(entry.time);
        const xR = toX(target.time);
        const yE = toY(entry.price);
        const yS = toY(stop.price);
        const yT = toY(target.price);
        if (xL == null || xR == null || yE == null || yS == null || yT == null) return;
        const left = Math.min(xL, xR);
        const right = Math.max(xL, xR);
        const width = Math.max(right - left, 8);
        const reward = Math.abs(target.price - entry.price);
        const risk = Math.abs(entry.price - stop.price);
        const rr = risk ? reward / risk : 0;
        const green = "#22c3a0";
        const red = "#f4646c";
        lines.push(
          <g key={d.id}>
            <rect x={left} y={Math.min(yE, yT)} width={width} height={Math.abs(yT - yE)} fill={green} fillOpacity={0.14} stroke={green} strokeWidth={1} />
            <rect x={left} y={Math.min(yE, yS)} width={width} height={Math.abs(yS - yE)} fill={red} fillOpacity={0.14} stroke={red} strokeWidth={1} />
            <line x1={left} x2={left + width} y1={yE} y2={yE} stroke={d.color} strokeWidth={1.5} strokeDasharray="4 2" />
            <text x={left + 4} y={yE - 3} fontSize={9} fill={d.color} fontFamily="monospace">
              {d.tool === "long" ? "LONG" : "SHORT"} · R/R {rr.toFixed(2)}
            </text>
          </g>,
        );
        handles.push({ id: d.id, x: right + 4, y: yE - 8 });
      } else if (d.tool === "text") {
        const x = toX(d.points[0]!.time);
        const y = toY(d.points[0]!.price);
        if (x == null || y == null) return;
        lines.push(
          <text key={d.id} x={x} y={y} fontSize={13} fill={d.color} fontFamily="sans-serif" style={{ userSelect: "none" }}>
            {d.text}
          </text>,
        );
        handles.push({ id: d.id, x: x - 4, y: y - 20 });
      } else if (d.tool === "callout") {
        const x1 = toX(d.points[0]!.time);
        const y1 = toY(d.points[0]!.price);
        const x2 = toX(d.points[1]!.time);
        const y2 = toY(d.points[1]!.price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) return;
        const w = Math.max(40, (d.text?.length ?? 4) * 7 + 12);
        lines.push(
          <g key={d.id}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={d.color} strokeWidth={1.5} />
            <circle cx={x1} cy={y1} r={3} fill={d.color} />
            <rect x={x2} y={y2 - 11} width={w} height={22} rx={4} fill={d.color} fillOpacity={0.15} stroke={d.color} strokeWidth={1} />
            <text x={x2 + 6} y={y2 + 4} fontSize={11} fill={d.color} fontFamily="sans-serif">
              {d.text}
            </text>
          </g>,
        );
        handles.push({ id: d.id, x: x2 + w + 2, y: y2 - 18 });
      }
    });

    // In-progress preview.
    if (tool && tool !== "measure" && pending.length && cursor) {
      const start = pending[0]!;
      const sx = toX(start.time);
      const sy = toY(start.price);
      if (sx != null && sy != null) {
        lines.push(
          <line
            key="preview"
            x1={sx}
            x2={cursor.x}
            y1={sy}
            y2={cursor.y}
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={0.7}
          />,
        );
      }
    }

    return { W, H, lines, handles };
    // toX/toY are pure closures over chart+series, which are already deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, pending, cursor, tool, color, precision, pipSize, viewVersion, size, chart, series]);

  const measureInfo = useMemo(() => {
    if (!measure || !chart || !series) return null;
    const { a, b } = measure;
    const ax = toX(a.time);
    const ay = toY(a.price);
    const bx = toX(b.time);
    const by = toY(b.price);
    if (ax == null || ay == null || bx == null || by == null) return null;
    const dPrice = b.price - a.price;
    const pips = dPrice / pipSize;
    const pct = a.price ? (dPrice / a.price) * 100 : 0;
    const minutes = Math.abs(b.time - a.time) / 60;
    const timeLabel =
      minutes >= 1440 ? `${(minutes / 1440).toFixed(1)}d` : minutes >= 60 ? `${(minutes / 60).toFixed(1)}h` : `${Math.round(minutes)}m`;
    const up = dPrice >= 0;
    return { ax, ay, bx, by, dPrice, pips, pct, timeLabel, up };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, viewVersion, chart, series, pipSize]);

  const interactive = tool != null;

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 z-10"
      style={{ pointerEvents: interactive ? "auto" : "none", cursor: interactive ? "crosshair" : "default" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg width={size.w} height={size.h} className="absolute inset-0 overflow-visible">
        {geometry?.lines}
        {measureInfo && (
          <g>
            <rect
              x={Math.min(measureInfo.ax, measureInfo.bx)}
              y={Math.min(measureInfo.ay, measureInfo.by)}
              width={Math.abs(measureInfo.bx - measureInfo.ax)}
              height={Math.abs(measureInfo.by - measureInfo.ay)}
              fill={measureInfo.up ? "#22c3a0" : "#f4646c"}
              fillOpacity={0.12}
              stroke={measureInfo.up ? "#22c3a0" : "#f4646c"}
              strokeWidth={1}
            />
            <line
              x1={measureInfo.ax}
              y1={measureInfo.ay}
              x2={measureInfo.bx}
              y2={measureInfo.by}
              stroke={measureInfo.up ? "#22c3a0" : "#f4646c"}
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>

      {/* Delete handles (visible only in select mode, i.e. no active tool) */}
      {!tool &&
        geometry?.handles.map((h) => (
          <button
            key={h.id}
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onDrawingsChange(drawings.filter((d) => d.id !== h.id));
            }}
            className="pointer-events-auto absolute grid h-4 w-4 place-items-center rounded-full border app-border bg-[var(--app-panel)] text-bear shadow hover:bg-bear/20"
            style={{ left: h.x, top: h.y }}
            aria-label="Delete drawing"
          >
            <X size={10} />
          </button>
        ))}

      {measureInfo && (
        <div
          className="pointer-events-none absolute rounded-md border app-border bg-[var(--app-panel)]/95 px-2 py-1 font-mono text-[10px] shadow-lg"
          style={{ left: measureInfo.bx + 8, top: measureInfo.by - 8 }}
        >
          <span className={measureInfo.up ? "text-brand-300" : "text-bear"}>
            {measureInfo.up ? "▲" : "▼"} {measureInfo.pips.toFixed(1)} pips
          </span>{" "}
          · {measureInfo.pct.toFixed(2)}% · {measureInfo.timeLabel}
        </div>
      )}
    </div>
  );
}
