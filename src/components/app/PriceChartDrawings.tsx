"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Trash2, Type as TypeIcon } from "lucide-react";
import type { IChartApi, ISeriesApi, SeriesType, Time, UTCTimestamp } from "lightweight-charts";

import {
  DRAWING_POINTS,
  DRAW_PALETTE,
  FIB_LEVELS,
  FIB_EXT_LEVELS,
  TEXT_TOOLS,
  dashArray,
  drawingId,
  type Drawing,
  type DrawingPoint,
  type DrawingTool,
  type LineStyleName,
} from "@/lib/chart/drawings";
import type { OHLCV } from "@/lib/chart/indicators";

type Tool = DrawingTool | "measure" | null;

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
  /** When true, anchors and new points snap to the nearest candle OHLC. */
  magnet: boolean;
  /** Currently displayed candles, used for magnet snapping. */
  candles: OHLCV[];
}

interface Px {
  x: number;
  y: number;
}

type Drag =
  | { id: string; kind: "move"; startPx: Px; orig: DrawingPoint[]; current: DrawingPoint[] }
  | { id: string; kind: "anchor"; index: number; startPx: Px; orig: DrawingPoint[]; current: DrawingPoint[] };

/** Default stroke width per tool when the drawing has no explicit width. */
function defaultWidth(tool: DrawingTool): number {
  switch (tool) {
    case "trend":
    case "ray":
    case "extended":
    case "arrow":
      return 2;
    case "fib":
    case "fibext":
      return 1;
    default:
      return 1.5;
  }
}

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
  magnet,
  candles,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pending, setPending] = useState<DrawingPoint[]>([]);
  const [cursor, setCursor] = useState<Px | null>(null);
  const [measure, setMeasure] = useState<{ a: DrawingPoint; b: DrawingPoint } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const measuring = useRef(false);

  // Keep the latest candles/drag reachable from event handlers without re-binding.
  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => setSize({ w: host.clientWidth, h: host.clientHeight }));
    ro.observe(host);
    setSize({ w: host.clientWidth, h: host.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Reset in-progress state when the tool changes; deselect when a tool becomes active.
  useEffect(() => {
    setPending([]);
    setCursor(null);
    if (tool !== "measure") setMeasure(null);
    if (tool) setSelectedId(null);
  }, [tool]);

  // Deselect when the empty chart area is clicked (events that miss every drawing
  // fall through to the chart canvas below this transparent overlay).
  useEffect(() => {
    if (!chart) return;
    const handler = () => setSelectedId(null);
    chart.subscribeClick(handler);
    return () => chart.unsubscribeClick(handler);
  }, [chart]);

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

  /** Snap a point's price to the nearest OHLC of the closest candle (magnet mode). */
  const snapPoint = (pt: DrawingPoint | null): DrawingPoint | null => {
    if (!pt) return pt;
    if (!magnet || pt.time === 0) return pt;
    const data = candlesRef.current;
    if (!data.length) return pt;
    let candle = data[0]!;
    let bestDT = Infinity;
    for (const c of data) {
      const dt = Math.abs(c.time - pt.time);
      if (dt < bestDT) {
        bestDT = dt;
        candle = c;
      }
    }
    let price = pt.price;
    let bestDP = Infinity;
    for (const v of [candle.open, candle.high, candle.low, candle.close]) {
      const dp = Math.abs(v - pt.price);
      if (dp < bestDP) {
        bestDP = dp;
        price = v;
      }
    }
    return { time: pt.time, price };
  };

  /** Translate one point by a pixel delta, preserving pure-horizontal/vertical semantics. */
  const movePoint = (p: DrawingPoint, dxPx: number, dyPx: number): DrawingPoint => {
    const y0 = toY(p.price);
    if (y0 == null || !series) return p;
    const np = series.coordinateToPrice(y0 + dyPx);
    let nt = p.time;
    if (p.time !== 0 && chart) {
      const x0 = toX(p.time);
      if (x0 != null) {
        const t = chart.timeScale().coordinateToTime((x0 + dxPx) as unknown as number) as Time | null | undefined;
        if (typeof t === "number") nt = t;
      }
    }
    return { time: nt, price: np ?? p.price };
  };

  function localPx(e: React.PointerEvent): Px {
    const rect = hostRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ---- Creation (only while a tool is active) ----
  function onPointerDown(e: React.PointerEvent) {
    if (!tool || !chart || !series) return;
    const px = localPx(e);
    const point = snapPoint(fromPx(px));
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
      const point = snapPoint(fromPx(px));
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

  // ---- Selection & dragging (only while no tool is active) ----
  function beginMove(e: React.PointerEvent, d: Drawing) {
    if (tool) return;
    e.stopPropagation();
    setSelectedId(d.id);
    setDrag({ id: d.id, kind: "move", startPx: localPx(e), orig: d.points, current: d.points });
  }

  function beginAnchor(e: React.PointerEvent, d: Drawing, index: number) {
    if (tool) return;
    e.stopPropagation();
    setSelectedId(d.id);
    setDrag({ id: d.id, kind: "anchor", index, startPx: localPx(e), orig: d.points, current: d.points });
  }

  // Drive an active drag from window-level pointer events (survives leaving the shape).
  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      const rect = hostRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setDrag((prev) => {
        if (!prev) return prev;
        if (prev.kind === "move") {
          const dx = px.x - prev.startPx.x;
          const dy = px.y - prev.startPx.y;
          return { ...prev, current: prev.orig.map((p) => movePoint(p, dx, dy)) };
        }
        const np = snapPoint(fromPx(px)) ?? prev.orig[prev.index]!;
        return { ...prev, current: prev.orig.map((p, i) => (i === prev.index ? np : p)) };
      });
    }
    function onUp() {
      const d = dragRef.current;
      if (d) onDrawingsChange(drawingsRef.current.map((dw) => (dw.id === d.id ? { ...dw, points: d.current } : dw)));
      setDrag(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // Bind once per drag; view is stable mid-drag so captured closures are fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, drag?.kind, (drag as { index?: number } | null)?.index]);

  // Keyboard: Escape cancels/deselects, Delete removes the selection.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") {
        setPending([]);
        setMeasure(null);
        setSelectedId(null);
        onToolComplete();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !tool) {
        e.preventDefault();
        onDrawingsChange(drawings.filter((d) => d.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToolComplete, selectedId, tool, drawings, onDrawingsChange]);

  const updateSelected = (patch: Partial<Drawing>) => {
    if (!selectedId) return;
    onDrawingsChange(drawings.map((d) => (d.id === selectedId ? { ...d, ...patch } : d)));
  };

  const duplicateSelected = () => {
    const src = drawings.find((d) => d.id === selectedId);
    if (!src) return;
    const id = drawingId();
    onDrawingsChange([...drawings, { ...src, id, points: src.points.map((p) => movePoint(p, 18, 18)) }]);
    setSelectedId(id);
  };

  // Live view of the drawings with the in-progress drag applied.
  const live = useMemo(
    () => (drag ? drawings.map((d) => (d.id === drag.id ? { ...d, points: drag.current } : d)) : drawings),
    [drawings, drag],
  );

  // Recompute pixel geometry whenever the view changes.
  const geometry = useMemo(() => {
    void viewVersion;
    void size;
    if (!chart || !series) return null;
    const W = size.w;
    const H = size.h;
    const groups: React.ReactNode[] = [];
    const anchors: { x: number; y: number; index: number }[] = [];
    let toolbar: { x: number; y: number } | null = null;
    const selectable = tool == null;

    live.forEach((d) => {
      const sw = d.width ?? defaultWidth(d.tool);
      const dash = dashArray(d.style);
      const body: React.ReactNode[] = [];
      const hit: React.ReactNode[] = [];
      const hitLine = (x1: number, y1: number, x2: number, y2: number, key: string) => (
        <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} pointerEvents="stroke" />
      );

      if (d.tool === "horizontal") {
        const y = toY(d.points[0]!.price);
        if (y == null) return;
        body.push(
          <line key="l" x1={0} x2={W} y1={y} y2={y} stroke={d.color} strokeWidth={sw} strokeDasharray={dash ?? "6 3"} />,
          <rect key="r" x={4} y={y - 9} width={70} height={16} rx={3} fill={d.color} opacity={0.9} />,
          <text key="t" x={8} y={y + 3} fontSize={10} fill="#0b0f1a" fontFamily="monospace">
            {d.points[0]!.price.toFixed(precision)}
          </text>,
        );
        hit.push(hitLine(0, y, W, y, "h"));
      } else if (d.tool === "vertical") {
        const x = toX(d.points[0]!.time);
        if (x == null) return;
        body.push(<line key="l" x1={x} x2={x} y1={0} y2={H} stroke={d.color} strokeWidth={sw} strokeDasharray={dash ?? "6 3"} />);
        hit.push(hitLine(x, 0, x, H, "v"));
      } else if (d.tool === "trend") {
        const x1 = toX(d.points[0]!.time);
        const y1 = toY(d.points[0]!.price);
        const x2 = toX(d.points[1]!.time);
        const y2 = toY(d.points[1]!.price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) return;
        body.push(<line key="l" x1={x1} x2={x2} y1={y1} y2={y2} stroke={d.color} strokeWidth={sw} strokeDasharray={dash} />);
        hit.push(hitLine(x1, y1, x2, y2, "t"));
      } else if (d.tool === "rectangle") {
        const x1 = toX(d.points[0]!.time);
        const y1 = toY(d.points[0]!.price);
        const x2 = toX(d.points[1]!.time);
        const y2 = toY(d.points[1]!.price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) return;
        body.push(
          <rect
            key="r"
            x={Math.min(x1, x2)}
            y={Math.min(y1, y2)}
            width={Math.abs(x2 - x1)}
            height={Math.abs(y2 - y1)}
            fill={d.color}
            fillOpacity={0.08}
            stroke={d.color}
            strokeWidth={sw}
            strokeDasharray={dash}
          />,
        );
      } else if (d.tool === "fib") {
        const p0 = d.points[0]!;
        const p1 = d.points[1]!;
        const x1 = toX(p0.time);
        const x2 = toX(p1.time);
        if (x1 == null || x2 == null) return;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        FIB_LEVELS.forEach((lvl) => {
          const price = p0.price + (p1.price - p0.price) * (1 - lvl);
          const y = toY(price);
          if (y == null) return;
          body.push(
            <line key={`l${lvl}`} x1={left} x2={right} y1={y} y2={y} stroke={d.color} strokeWidth={sw} strokeOpacity={0.75} strokeDasharray={dash} />,
            <text key={`x${lvl}`} x={right + 4} y={y + 3} fontSize={9} fill={d.color} fontFamily="monospace">
              {lvl.toFixed(3)} · {price.toFixed(precision)}
            </text>,
          );
          hit.push(hitLine(left, y, right, y, `fh${lvl}`));
        });
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
        body.push(<line key="l" x1={ext.sx} y1={ext.sy} x2={ext.ex} y2={ext.ey} stroke={d.color} strokeWidth={sw} strokeDasharray={dash} />);
        if (d.tool === "arrow") body.push(<polygon key="a" points={arrowHead(x1, y1, x2, y2, 11)} fill={d.color} />);
        if (d.tool === "info")
          body.push(
            <text key="i" x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2 - 6} fontSize={10} fill={d.color} fontFamily="monospace">
              {pips >= 0 ? "+" : ""}
              {pips.toFixed(1)} pips · {pct.toFixed(2)}%
            </text>,
          );
        hit.push(hitLine(ext.sx, ext.sy, ext.ex, ext.ey, "e"));
      } else if (d.tool === "hray") {
        const x = toX(d.points[0]!.time);
        const y = toY(d.points[0]!.price);
        if (x == null || y == null) return;
        body.push(
          <line key="l" x1={x} x2={W} y1={y} y2={y} stroke={d.color} strokeWidth={sw} strokeDasharray={dash} />,
          <rect key="r" x={x + 6} y={y - 9} width={70} height={16} rx={3} fill={d.color} opacity={0.9} />,
          <text key="t" x={x + 10} y={y + 3} fontSize={10} fill="#0b0f1a" fontFamily="monospace">
            {d.points[0]!.price.toFixed(precision)}
          </text>,
        );
        hit.push(hitLine(x, y, W, y, "hr"));
      } else if (d.tool === "ellipse") {
        const x1 = toX(d.points[0]!.time);
        const y1 = toY(d.points[0]!.price);
        const x2 = toX(d.points[1]!.time);
        const y2 = toY(d.points[1]!.price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) return;
        body.push(
          <ellipse
            key="e"
            cx={(x1 + x2) / 2}
            cy={(y1 + y2) / 2}
            rx={Math.abs(x2 - x1) / 2}
            ry={Math.abs(y2 - y1) / 2}
            fill={d.color}
            fillOpacity={0.08}
            stroke={d.color}
            strokeWidth={sw}
            strokeDasharray={dash}
          />,
        );
      } else if (d.tool === "triangle") {
        const pts = d.points.map((p) => ({ x: toX(p.time), y: toY(p.price) }));
        if (pts.some((p) => p.x == null || p.y == null)) return;
        body.push(
          <polygon
            key="p"
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill={d.color}
            fillOpacity={0.08}
            stroke={d.color}
            strokeWidth={sw}
            strokeDasharray={dash}
          />,
        );
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
        body.push(
          <polygon key="fill" points={`${x0},${y0} ${x1},${y1} ${x1 + vx},${y1 + vy} ${x0 + vx},${y0 + vy}`} fill={d.color} fillOpacity={0.07} stroke="none" />,
          <line key="l1" x1={x0} y1={y0} x2={x1} y2={y1} stroke={d.color} strokeWidth={sw} strokeDasharray={dash} />,
          <line key="l2" x1={x0 + vx} y1={y0 + vy} x2={x1 + vx} y2={y1 + vy} stroke={d.color} strokeWidth={sw} strokeDasharray={dash} />,
        );
      } else if (d.tool === "fibext") {
        const p0 = d.points[0]!;
        const p1 = d.points[1]!;
        const p2 = d.points[2]!;
        const xl = toX(p2.time);
        if (xl == null) return;
        const diff = p1.price - p0.price;
        FIB_EXT_LEVELS.forEach((lvl) => {
          const price = p2.price + diff * lvl;
          const y = toY(price);
          if (y == null) return;
          body.push(
            <line key={`l${lvl}`} x1={xl} x2={W} y1={y} y2={y} stroke={d.color} strokeWidth={sw} strokeOpacity={0.75} strokeDasharray={dash} />,
            <text key={`x${lvl}`} x={xl + 4} y={y - 2} fontSize={9} fill={d.color} fontFamily="monospace">
              {lvl.toFixed(3)} · {price.toFixed(precision)}
            </text>,
          );
          hit.push(hitLine(xl, y, W, y, `fe${lvl}`));
        });
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
        body.push(
          <rect key="p" x={left} y={Math.min(yE, yT)} width={width} height={Math.abs(yT - yE)} fill={green} fillOpacity={0.14} stroke={green} strokeWidth={1} />,
          <rect key="l" x={left} y={Math.min(yE, yS)} width={width} height={Math.abs(yS - yE)} fill={red} fillOpacity={0.14} stroke={red} strokeWidth={1} />,
          <line key="e" x1={left} x2={left + width} y1={yE} y2={yE} stroke={d.color} strokeWidth={sw} strokeDasharray="4 2" />,
          <text key="t" x={left + 4} y={yE - 3} fontSize={9} fill={d.color} fontFamily="monospace">
            {d.tool === "long" ? "LONG" : "SHORT"} · R/R {rr.toFixed(2)}
          </text>,
        );
      } else if (d.tool === "text") {
        const x = toX(d.points[0]!.time);
        const y = toY(d.points[0]!.price);
        if (x == null || y == null) return;
        const w = Math.max(20, (d.text?.length ?? 4) * 8);
        body.push(
          <text key="t" x={x} y={y} fontSize={13} fill={d.color} fontFamily="sans-serif" style={{ userSelect: "none" }}>
            {d.text}
          </text>,
        );
        hit.push(<rect key="hb" x={x} y={y - 13} width={w} height={18} fill="transparent" pointerEvents="all" />);
      } else if (d.tool === "callout") {
        const x1 = toX(d.points[0]!.time);
        const y1 = toY(d.points[0]!.price);
        const x2 = toX(d.points[1]!.time);
        const y2 = toY(d.points[1]!.price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) return;
        const w = Math.max(40, (d.text?.length ?? 4) * 7 + 12);
        body.push(
          <line key="l" x1={x1} y1={y1} x2={x2} y2={y2} stroke={d.color} strokeWidth={sw} strokeDasharray={dash} />,
          <rect key="b" x={x2} y={y2 - 11} width={w} height={22} rx={4} fill={d.color} fillOpacity={0.15} stroke={d.color} strokeWidth={1} />,
          <text key="t" x={x2 + 6} y={y2 + 4} fontSize={11} fill={d.color} fontFamily="sans-serif">
            {d.text}
          </text>,
        );
        hit.push(hitLine(x1, y1, x2, y2, "c"));
      }

      if (!body.length) return;

      const isSelected = d.id === selectedId && selectable;
      groups.push(
        <g
          key={d.id}
          onPointerDown={selectable ? (e) => beginMove(e, d) : undefined}
          style={{
            pointerEvents: tool ? "none" : "visiblePainted",
            cursor: selectable ? "move" : "default",
          }}
        >
          {hit}
          {body}
        </g>,
      );

      if (isSelected) {
        d.points.forEach((p, i) => {
          const ax = p.time === 0 ? W / 2 : toX(p.time);
          const ay = toY(p.price);
          if (ax != null && ay != null) anchors.push({ x: ax, y: ay, index: i });
        });
      }
    });

    // Toolbar anchored above the selected drawing's bounding box.
    if (selectable && anchors.length) {
      const minX = Math.min(...anchors.map((a) => a.x));
      const minY = Math.min(...anchors.map((a) => a.y));
      toolbar = { x: Math.max(4, Math.min(minX, W - 210)), y: Math.max(4, minY - 40) };
    }

    // In-progress creation preview.
    if (tool && tool !== "measure" && pending.length && cursor) {
      const start = pending[0]!;
      const sx = toX(start.time);
      const sy = toY(start.price);
      if (sx != null && sy != null) {
        groups.push(
          <line key="preview" x1={sx} x2={cursor.x} y1={sy} y2={cursor.y} stroke={color} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />,
        );
      }
    }

    return { W, H, groups, anchors, toolbar };
    // toX/toY are pure closures over chart+series, which are already deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, pending, cursor, tool, color, precision, pipSize, viewVersion, size, chart, series, selectedId]);

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

  const selected = drawings.find((d) => d.id === selectedId) ?? null;
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
        {geometry?.groups}

        {/* Anchor handles for the selected drawing */}
        {!tool &&
          geometry?.anchors.map((a) => (
            <circle
              key={`anchor-${a.index}`}
              cx={a.x}
              cy={a.y}
              r={5}
              fill="var(--app-panel, #0b0f1a)"
              stroke={selected?.color ?? "#5b8bff"}
              strokeWidth={2}
              style={{ pointerEvents: "all", cursor: "grab" }}
              onPointerDown={(e) => selected && beginAnchor(e, selected, a.index)}
            />
          ))}

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
            <line x1={measureInfo.ax} y1={measureInfo.ay} x2={measureInfo.bx} y2={measureInfo.by} stroke={measureInfo.up ? "#22c3a0" : "#f4646c"} strokeWidth={1.5} />
          </g>
        )}
      </svg>

      {/* Inline edit toolbar for the selected drawing */}
      {selected && geometry?.toolbar && !tool && (
        <div
          className="pointer-events-auto absolute flex items-center gap-1 rounded-lg border app-border bg-[var(--app-panel)]/95 p-1 shadow-xl backdrop-blur"
          style={{ left: geometry.toolbar.x, top: geometry.toolbar.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {DRAW_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              onClick={() => updateSelected({ color: c })}
              className="h-4 w-4 rounded-full border"
              style={{ backgroundColor: c, borderColor: selected.color === c ? "#fff" : "transparent" }}
            />
          ))}
          <span className="mx-0.5 h-4 w-px bg-[var(--app-border)]" />
          <button
            type="button"
            aria-label="Cycle line width"
            title="Line width"
            onClick={() => updateSelected({ width: ((selected.width ?? defaultWidth(selected.tool)) % 4) + 1 })}
            className="grid h-5 min-w-5 place-items-center rounded px-1 text-[10px] font-bold app-muted hover:bg-[var(--app-panel-2)]"
          >
            {Math.round(selected.width ?? defaultWidth(selected.tool))}px
          </button>
          <button
            type="button"
            aria-label="Cycle line style"
            title="Line style"
            onClick={() => {
              const order: LineStyleName[] = ["solid", "dashed", "dotted"];
              const cur = selected.style ?? "solid";
              updateSelected({ style: order[(order.indexOf(cur) + 1) % order.length] });
            }}
            className="grid h-5 min-w-5 place-items-center rounded px-1 text-[11px] app-muted hover:bg-[var(--app-panel-2)]"
          >
            {selected.style === "dashed" ? "╌" : selected.style === "dotted" ? "···" : "—"}
          </button>
          {TEXT_TOOLS.has(selected.tool) && (
            <button
              type="button"
              aria-label="Edit text"
              title="Edit text"
              onClick={() => {
                const t = window.prompt("Text:", selected.text ?? "")?.trim();
                if (t) updateSelected({ text: t });
              }}
              className="grid h-5 w-5 place-items-center rounded app-muted hover:bg-[var(--app-panel-2)]"
            >
              <TypeIcon size={12} aria-hidden />
            </button>
          )}
          <button
            type="button"
            aria-label="Duplicate drawing"
            title="Duplicate"
            onClick={duplicateSelected}
            className="grid h-5 w-5 place-items-center rounded app-muted hover:bg-[var(--app-panel-2)]"
          >
            <Copy size={12} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Delete drawing"
            title="Delete"
            onClick={() => {
              onDrawingsChange(drawings.filter((d) => d.id !== selected.id));
              setSelectedId(null);
            }}
            className="grid h-5 w-5 place-items-center rounded text-bear hover:bg-bear/20"
          >
            <Trash2 size={12} aria-hidden />
          </button>
        </div>
      )}

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
