/**
 * Abstract base for every drawing. Concrete tools live in ./objects.
 *
 * Objects hold only chart-space points; they project to pixels through the
 * CoordinateMapper at render/hit-test time and never cache pixel state.
 */

import type { CoordinateMapper } from "./coords";
import {
  TOOL_POINTS,
  dashPattern,
  withAlpha,
  type DrawingJSON,
  type DrawingStyle,
  type Point,
  type ToolKind,
} from "./types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderCtx {
  ctx: CanvasRenderingContext2D;
  mapper: CoordinateMapper;
  selected: boolean;
  hover: boolean;
  timeframe: string;
  precision: number;
  pipSize: number;
}

export const HIT_TOLERANCE = 6;

/** Radius of the blue selection anchor handles, in px. */
export const SELECTION_HANDLE = 5;

// ---- geometry helpers ----

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Shortest distance from point (px,py) to segment (ax,ay)-(bx,by). */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, ax + t * dx, ay + t * dy);
}

export function pointInRect(px: number, py: number, r: Rect, pad = 0): boolean {
  return px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad;
}

export function pointInPolygon(px: number, py: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x;
    const yi = poly[i]!.y;
    const xj = poly[j]!.x;
    const yj = poly[j]!.y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function rectFromPoints(pts: { x: number; y: number }[]): Rect | null {
  if (!pts.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export abstract class DrawingObject {
  id: string;
  kind: ToolKind;
  points: Point[];
  style: DrawingStyle;
  locked: boolean;
  hidden: boolean;
  zIndex: number;
  visibleTimeframes: string[] | null;

  constructor(json: DrawingJSON) {
    this.id = json.id;
    this.kind = json.kind;
    this.points = json.points.map((p) => ({ ...p }));
    this.style = { ...json.style };
    this.locked = json.locked;
    this.hidden = json.hidden;
    this.zIndex = json.zIndex;
    this.visibleTimeframes = json.visibleTimeframes ? [...json.visibleTimeframes] : null;
  }

  /** Paint the object onto the scene canvas. */
  abstract render(r: RenderCtx): void;

  /** True if a pixel is on/inside the object (used with an enlarged tolerance). */
  abstract hitTest(x: number, y: number, mapper: CoordinateMapper): boolean;

  minPoints(): number {
    return TOOL_POINTS[this.kind];
  }

  /** Draggable anchors in pixels (defaults to the projectable points). */
  anchors(mapper: CoordinateMapper): { x: number; y: number; index: number }[] {
    const out: { x: number; y: number; index: number }[] = [];
    this.points.forEach((p, index) => {
      const x = p.time ? mapper.timeToX(p.time) : mapper.width / 2;
      const y = mapper.priceToY(p.price);
      if (x != null && y != null) out.push({ x, y, index });
    });
    return out;
  }

  bbox(mapper: CoordinateMapper): Rect | null {
    return rectFromPoints(this.anchors(mapper));
  }

  translate(dTime: number, dPrice: number): void {
    this.points = this.points.map((p) => ({ time: p.time ? p.time + dTime : 0, price: p.price + dPrice }));
  }

  setAnchor(index: number, p: Point): void {
    if (this.points[index]) this.points[index] = { ...p };
  }

  visibleOn(timeframe: string): boolean {
    if (this.hidden) return false;
    if (!this.visibleTimeframes) return true;
    return this.visibleTimeframes.includes(timeframe);
  }

  serialize(): DrawingJSON {
    return {
      id: this.id,
      kind: this.kind,
      points: this.points.map((p) => ({ ...p })),
      style: { ...this.style },
      locked: this.locked,
      hidden: this.hidden,
      zIndex: this.zIndex,
      visibleTimeframes: this.visibleTimeframes ? [...this.visibleTimeframes] : null,
    };
  }

  // ---- shared draw helpers ----

  protected strokeColor(): string {
    return withAlpha(this.style.color, this.style.opacity);
  }

  protected fillPaint(): string {
    return withAlpha(this.style.fillColor, this.style.fillOpacity);
  }

  protected applyStroke(ctx: CanvasRenderingContext2D, widthOverride?: number): void {
    ctx.strokeStyle = this.strokeColor();
    ctx.lineWidth = widthOverride ?? this.style.lineWidth;
    ctx.setLineDash(dashPattern(this.style.lineStyle, ctx.lineWidth));
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  }

  /** Project a chart point to pixels (time 0 → canvas centre for pure-horizontal anchors). */
  protected px(mapper: CoordinateMapper, p: Point): { x: number; y: number } | null {
    const x = p.time ? mapper.timeToX(p.time) : mapper.width / 2;
    const y = mapper.priceToY(p.price);
    if (x == null || y == null) return null;
    return { x, y };
  }
}
