/**
 * Concrete drawing tools. Each class stores chart-space points and knows how to
 * render itself to a 2D canvas and hit-test against pixels. Geometry helpers are
 * shared from ./object to keep the tools compact.
 */

import type { CoordinateMapper } from "./coords";
import {
  DrawingObject,
  HIT_TOLERANCE,
  distToSegment,
  dist,
  pointInPolygon,
  pointInRect,
  rectFromPoints,
  type Rect,
  type RenderCtx,
} from "./object";
import {
  FIB_LEVELS,
  defaultStyle,
  nextId,
  withAlpha,
  type DrawingJSON,
  type Point,
  type ToolKind,
} from "./types";

// ---- local helpers ----

function extendSeg(
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
  const t = (px: number, py: number, ddx: number, ddy: number): number => {
    let tt = Infinity;
    if (ddx > 0) tt = Math.min(tt, (W - px) / ddx);
    else if (ddx < 0) tt = Math.min(tt, -px / ddx);
    if (ddy > 0) tt = Math.min(tt, (H - py) / ddy);
    else if (ddy < 0) tt = Math.min(tt, -py / ddy);
    return Number.isFinite(tt) ? Math.max(0, tt) : 0;
  };
  let sx = x1;
  let sy = y1;
  let ex = x2;
  let ey = y2;
  if (extendEnd) {
    const tt = t(x1, y1, dx, dy);
    ex = x1 + dx * tt;
    ey = y1 + dy * tt;
  }
  if (extendStart) {
    const tt = t(x1, y1, -dx, -dy);
    sx = x1 - dx * tt;
    sy = y1 - dy * tt;
  }
  return { sx, sy, ex, ey };
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, size: number, color: string): void {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 + size * Math.cos(ang + Math.PI - 0.42), y2 + size * Math.sin(ang + Math.PI - 0.42));
  ctx.lineTo(x2 + size * Math.cos(ang + Math.PI + 0.42), y2 + size * Math.sin(ang + Math.PI + 0.42));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function chip(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, fg: string, font: number): void {
  ctx.save();
  ctx.font = `${font}px ui-sans-serif, system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 10;
  const h = font + 6;
  ctx.setLineDash([]);
  ctx.fillStyle = bg;
  ctx.beginPath();
  const r = 3;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 5, y + h / 2 + 0.5);
  ctx.restore();
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A pill of one or more centred text lines, centred on (cx,cy). */
function centerChip(ctx: CanvasRenderingContext2D, cx: number, cy: number, lines: string[], bg: string, fg: string, font: number): void {
  ctx.save();
  ctx.font = `${font}px ui-sans-serif, system-ui, sans-serif`;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
  const lh = font + 4;
  const h = lines.length * lh + 6;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.setLineDash([]);
  ctx.fillStyle = bg;
  roundRectPath(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, cx, y + 3 + lh * (i + 0.5)));
  ctx.restore();
}

// ---- line family ----

class TrendLine extends DrawingObject {
  render({ ctx, mapper }: RenderCtx): void {
    const a = this.px(mapper, this.points[0]!);
    const b = this.px(mapper, this.points[1]!);
    if (!a || !b) return;
    this.applyStroke(ctx);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const a = this.px(mapper, this.points[0]!);
    const b = this.px(mapper, this.points[1]!);
    if (!a || !b) return false;
    return distToSegment(x, y, a.x, a.y, b.x, b.y) <= HIT_TOLERANCE + this.style.lineWidth;
  }
}

class RayLine extends DrawingObject {
  render({ ctx, mapper }: RenderCtx): void {
    const a = this.px(mapper, this.points[0]!);
    const b = this.px(mapper, this.points[1]!);
    if (!a || !b) return;
    const e = extendSeg(a.x, a.y, b.x, b.y, mapper.width, mapper.height, this.style.extendLeft, this.style.extendRight || this.kind === "ray");
    this.applyStroke(ctx);
    ctx.beginPath();
    ctx.moveTo(e.sx, e.sy);
    ctx.lineTo(e.ex, e.ey);
    ctx.stroke();
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const a = this.px(mapper, this.points[0]!);
    const b = this.px(mapper, this.points[1]!);
    if (!a || !b) return false;
    const e = extendSeg(a.x, a.y, b.x, b.y, mapper.width, mapper.height, this.style.extendLeft, this.style.extendRight || this.kind === "ray");
    return distToSegment(x, y, e.sx, e.sy, e.ex, e.ey) <= HIT_TOLERANCE + this.style.lineWidth;
  }
}

class ExtendedLine extends RayLine {
  render(r: RenderCtx): void {
    this.style.extendLeft = true;
    this.style.extendRight = true;
    super.render(r);
  }
}

class ArrowLine extends DrawingObject {
  render({ ctx, mapper }: RenderCtx): void {
    const a = this.px(mapper, this.points[0]!);
    const b = this.px(mapper, this.points[1]!);
    if (!a || !b) return;
    this.applyStroke(ctx);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    drawArrowHead(ctx, a.x, a.y, b.x, b.y, 6 + this.style.lineWidth * 2, this.strokeColor());
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const a = this.px(mapper, this.points[0]!);
    const b = this.px(mapper, this.points[1]!);
    if (!a || !b) return false;
    return distToSegment(x, y, a.x, a.y, b.x, b.y) <= HIT_TOLERANCE + this.style.lineWidth;
  }
}

class HorizontalLine extends DrawingObject {
  render({ ctx, mapper, precision }: RenderCtx): void {
    const y = mapper.priceToY(this.points[0]!.price);
    if (y == null) return;
    this.applyStroke(ctx);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(mapper.width, y);
    ctx.stroke();
    if (this.style.showLabels) chip(ctx, 4, y - (this.style.fontSize + 6) / 2, this.points[0]!.price.toFixed(precision), this.strokeColor(), "#0b0f1a", 10);
  }
  anchors(mapper: CoordinateMapper) {
    const y = mapper.priceToY(this.points[0]!.price);
    return y == null ? [] : [{ x: mapper.width / 2, y, index: 0 }];
  }
  bbox(mapper: CoordinateMapper): Rect | null {
    const y = mapper.priceToY(this.points[0]!.price);
    return y == null ? null : { x: 0, y: y - 2, w: mapper.width, h: 4 };
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const yy = mapper.priceToY(this.points[0]!.price);
    return yy != null && Math.abs(y - yy) <= HIT_TOLERANCE + this.style.lineWidth;
  }
}

class VerticalLine extends DrawingObject {
  render({ ctx, mapper }: RenderCtx): void {
    const x = mapper.timeToX(this.points[0]!.time);
    if (x == null) return;
    this.applyStroke(ctx);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, mapper.height);
    ctx.stroke();
  }
  bbox(mapper: CoordinateMapper): Rect | null {
    const x = mapper.timeToX(this.points[0]!.time);
    return x == null ? null : { x: x - 2, y: 0, w: 4, h: mapper.height };
  }
  hitTest(x: number, _y: number, mapper: CoordinateMapper): boolean {
    const xx = mapper.timeToX(this.points[0]!.time);
    return xx != null && Math.abs(x - xx) <= HIT_TOLERANCE + this.style.lineWidth;
  }
}

// ---- boxes & shapes ----

class Rectangle extends DrawingObject {
  render({ ctx, mapper }: RenderCtx): void {
    const a = this.px(mapper, this.points[0]!);
    const b = this.px(mapper, this.points[1]!);
    if (!a || !b) return;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (this.style.fill) {
      ctx.fillStyle = this.fillPaint();
      ctx.fillRect(x, y, w, h);
    }
    this.applyStroke(ctx);
    ctx.strokeRect(x, y, w, h);
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const r = this.bbox(mapper);
    if (!r) return false;
    if (this.style.fill && pointInRect(x, y, r)) return true;
    // near any edge
    return (
      Math.abs(x - r.x) <= HIT_TOLERANCE ||
      Math.abs(x - (r.x + r.w)) <= HIT_TOLERANCE ||
      Math.abs(y - r.y) <= HIT_TOLERANCE ||
      Math.abs(y - (r.y + r.h)) <= HIT_TOLERANCE
    ) && pointInRect(x, y, r, HIT_TOLERANCE);
  }
}

class SessionBox extends DrawingObject {
  render({ ctx, mapper }: RenderCtx): void {
    const x1 = mapper.timeToX(this.points[0]!.time);
    const x2 = mapper.timeToX(this.points[1]!.time);
    if (x1 == null || x2 == null) return;
    const x = Math.min(x1, x2);
    const w = Math.abs(x2 - x1);
    ctx.fillStyle = this.fillPaint();
    ctx.fillRect(x, 0, w, mapper.height);
    this.applyStroke(ctx, 1);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, mapper.height);
    ctx.moveTo(x + w, 0);
    ctx.lineTo(x + w, mapper.height);
    ctx.stroke();
  }
  bbox(mapper: CoordinateMapper): Rect | null {
    const x1 = mapper.timeToX(this.points[0]!.time);
    const x2 = mapper.timeToX(this.points[1]!.time);
    if (x1 == null || x2 == null) return null;
    return { x: Math.min(x1, x2), y: 0, w: Math.abs(x2 - x1), h: mapper.height };
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const r = this.bbox(mapper);
    return !!r && pointInRect(x, y, r, HIT_TOLERANCE);
  }
}

class CircleObj extends DrawingObject {
  private radius(mapper: CoordinateMapper): { cx: number; cy: number; r: number } | null {
    const c = this.px(mapper, this.points[0]!);
    const e = this.px(mapper, this.points[1]!);
    if (!c || !e) return null;
    return { cx: c.x, cy: c.y, r: dist(c.x, c.y, e.x, e.y) };
  }
  render({ ctx, mapper }: RenderCtx): void {
    const g = this.radius(mapper);
    if (!g) return;
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
    if (this.style.fill) {
      ctx.fillStyle = this.fillPaint();
      ctx.fill();
    }
    this.applyStroke(ctx);
    ctx.stroke();
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const g = this.radius(mapper);
    if (!g) return false;
    const d = dist(x, y, g.cx, g.cy);
    if (this.style.fill && d <= g.r + HIT_TOLERANCE) return true;
    return Math.abs(d - g.r) <= HIT_TOLERANCE + this.style.lineWidth;
  }
}

class EllipseObj extends DrawingObject {
  private geo(mapper: CoordinateMapper): { cx: number; cy: number; rx: number; ry: number } | null {
    const a = this.px(mapper, this.points[0]!);
    const b = this.px(mapper, this.points[1]!);
    if (!a || !b) return null;
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx: Math.abs(b.x - a.x) / 2, ry: Math.abs(b.y - a.y) / 2 };
  }
  render({ ctx, mapper }: RenderCtx): void {
    const g = this.geo(mapper);
    if (!g) return;
    ctx.beginPath();
    ctx.ellipse(g.cx, g.cy, g.rx, g.ry, 0, 0, Math.PI * 2);
    if (this.style.fill) {
      ctx.fillStyle = this.fillPaint();
      ctx.fill();
    }
    this.applyStroke(ctx);
    ctx.stroke();
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const g = this.geo(mapper);
    if (!g || g.rx === 0 || g.ry === 0) return false;
    const norm = ((x - g.cx) / g.rx) ** 2 + ((y - g.cy) / g.ry) ** 2;
    if (this.style.fill && norm <= 1.15) return true;
    return norm >= 0.8 && norm <= 1.25;
  }
}

class TriangleObj extends DrawingObject {
  private poly(mapper: CoordinateMapper) {
    return this.points.map((p) => this.px(mapper, p)).filter((p): p is { x: number; y: number } => p != null);
  }
  render({ ctx, mapper }: RenderCtx): void {
    const pts = this.poly(mapper);
    if (pts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    if (this.style.fill) {
      ctx.fillStyle = this.fillPaint();
      ctx.fill();
    }
    this.applyStroke(ctx);
    ctx.stroke();
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const pts = this.poly(mapper);
    if (pts.length < 3) return false;
    if (this.style.fill && pointInPolygon(x, y, pts)) return true;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= HIT_TOLERANCE + this.style.lineWidth) return true;
    }
    return false;
  }
}

class PathObj extends DrawingObject {
  private poly(mapper: CoordinateMapper) {
    return this.points.map((p) => this.px(mapper, p)).filter((p): p is { x: number; y: number } => p != null);
  }
  render({ ctx, mapper }: RenderCtx): void {
    const pts = this.poly(mapper);
    if (pts.length < 2) return;
    this.applyStroke(ctx);
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const pts = this.poly(mapper);
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(x, y, pts[i]!.x, pts[i]!.y, pts[i + 1]!.x, pts[i + 1]!.y) <= HIT_TOLERANCE + this.style.lineWidth) return true;
    }
    return false;
  }
}

// ---- text ----

class TextObj extends DrawingObject {
  render({ ctx, mapper }: RenderCtx): void {
    const p = this.px(mapper, this.points[0]!);
    if (!p) return;
    ctx.save();
    ctx.setLineDash([]);
    ctx.font = `${this.style.fontSize}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    if (this.style.background || this.kind === "label") {
      chip(ctx, p.x, p.y - (this.style.fontSize + 6) / 2, this.style.text || "Text", withAlpha(this.style.fillColor, Math.max(0.15, this.style.fillOpacity)), this.style.color, this.style.fontSize);
    } else {
      ctx.fillStyle = this.strokeColor();
      ctx.fillText(this.style.text || "Text", p.x, p.y);
    }
    ctx.restore();
  }
  bbox(mapper: CoordinateMapper): Rect | null {
    const p = this.px(mapper, this.points[0]!);
    if (!p) return null;
    const w = Math.max(24, (this.style.text || "Text").length * this.style.fontSize * 0.6);
    return { x: p.x, y: p.y - this.style.fontSize, w, h: this.style.fontSize * 2 };
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const r = this.bbox(mapper);
    return !!r && pointInRect(x, y, r, HIT_TOLERANCE);
  }
}

// ---- fibonacci ----

class FibObj extends DrawingObject {
  render({ ctx, mapper, precision }: RenderCtx): void {
    const p0 = this.points[0]!;
    const p1 = this.points[1]!;
    const x1 = mapper.timeToX(p0.time);
    const x2 = mapper.timeToX(p1.time);
    if (x1 == null || x2 == null) return;
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    ctx.save();
    ctx.font = "9px ui-monospace, monospace";
    ctx.textBaseline = "middle";
    for (const lvl of FIB_LEVELS) {
      const price = p0.price + (p1.price - p0.price) * (1 - lvl);
      const y = mapper.priceToY(price);
      if (y == null) continue;
      this.applyStroke(ctx, this.style.lineWidth);
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (this.style.showLabels) {
        ctx.fillStyle = this.strokeColor();
        ctx.fillText(`${lvl.toFixed(3)}  ${price.toFixed(precision)}`, right + 4, y);
      }
    }
    ctx.restore();
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const p0 = this.points[0]!;
    const p1 = this.points[1]!;
    const x1 = mapper.timeToX(p0.time);
    const x2 = mapper.timeToX(p1.time);
    if (x1 == null || x2 == null) return false;
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    if (x < left - HIT_TOLERANCE || x > right + HIT_TOLERANCE) return false;
    for (const lvl of FIB_LEVELS) {
      const yy = mapper.priceToY(p0.price + (p1.price - p0.price) * (1 - lvl));
      if (yy != null && Math.abs(y - yy) <= HIT_TOLERANCE) return true;
    }
    return false;
  }
}

// ---- parallel channel ----

class Channel extends DrawingObject {
  render({ ctx, mapper }: RenderCtx): void {
    const a = this.px(mapper, this.points[0]!);
    const b = this.px(mapper, this.points[1]!);
    const c = this.px(mapper, this.points[2]!);
    if (!a || !b || !c) return;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x + vx, b.y + vy);
    ctx.lineTo(a.x + vx, a.y + vy);
    ctx.closePath();
    ctx.fillStyle = withAlpha(this.style.fillColor, Math.min(0.1, this.style.fillOpacity + 0.02));
    ctx.fill();
    this.applyStroke(ctx);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.moveTo(a.x + vx, a.y + vy);
    ctx.lineTo(b.x + vx, b.y + vy);
    ctx.stroke();
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const a = this.px(mapper, this.points[0]!);
    const b = this.px(mapper, this.points[1]!);
    const c = this.px(mapper, this.points[2]!);
    if (!a || !b || !c) return false;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    return (
      distToSegment(x, y, a.x, a.y, b.x, b.y) <= HIT_TOLERANCE + this.style.lineWidth ||
      distToSegment(x, y, a.x + vx, a.y + vy, b.x + vx, b.y + vy) <= HIT_TOLERANCE + this.style.lineWidth
    );
  }
}

// ---- long / short position ----

/** Notional cash risk used to derive quantity / amounts for the position labels. */
const POSITION_RISK_BUDGET = 1000;

class PositionTool extends DrawingObject {
  render({ ctx, mapper, precision, pipSize }: RenderCtx): void {
    const entry = this.points[0]!;
    const stop = this.points[1]!;
    const target = this.points[2]!;
    const xE = mapper.timeToX(entry.time);
    const xT = mapper.timeToX(target.time);
    const yE = mapper.priceToY(entry.price);
    const yS = mapper.priceToY(stop.price);
    const yT = mapper.priceToY(target.price);
    if (xE == null || xT == null || yE == null || yS == null || yT == null) return;
    const left = Math.min(xE, xT);
    const right = Math.max(xE, xT);
    const w = Math.max(right - left, 8);
    const cx = left + w / 2;
    const green = "#22c3a0";
    const red = "#f4646c";

    ctx.save();
    ctx.setLineDash([]);
    // profit (entry → target) and loss (entry → stop) zones
    ctx.fillStyle = withAlpha(green, 0.16);
    ctx.fillRect(left, Math.min(yE, yT), w, Math.abs(yT - yE));
    ctx.fillStyle = withAlpha(red, 0.16);
    ctx.fillRect(left, Math.min(yE, yS), w, Math.abs(yS - yE));

    // horizontal boundaries
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(green, 0.9);
    ctx.beginPath();
    ctx.moveTo(left, yT);
    ctx.lineTo(right, yT);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(red, 0.9);
    ctx.beginPath();
    ctx.moveTo(left, yS);
    ctx.lineTo(right, yS);
    ctx.stroke();
    // entry line
    ctx.strokeStyle = "#cbd5e1";
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(left, yE);
    ctx.lineTo(right, yE);
    ctx.stroke();
    ctx.setLineDash([]);

    if (this.style.showLabels) {
      const rewardPU = Math.abs(target.price - entry.price);
      const riskPU = Math.abs(entry.price - stop.price);
      const rr = riskPU ? rewardPU / riskPU : 0;
      const qty = riskPU ? POSITION_RISK_BUDGET / riskPU : 0;
      const profit = POSITION_RISK_BUDGET * rr;
      const pctT = entry.price ? (rewardPU / entry.price) * 100 : 0;
      const pctS = entry.price ? (riskPU / entry.price) * 100 : 0;
      const tPips = rewardPU / pipSize;
      const sPips = riskPU / pipSize;
      centerChip(
        ctx,
        cx,
        yT,
        [`Target: ${target.price.toFixed(precision)} (${pctT.toFixed(3)}%) ${tPips.toFixed(1)}  Amount: ${profit.toFixed(2)}`],
        green,
        "#04231b",
        10,
      );
      centerChip(
        ctx,
        cx,
        yS,
        [`Stop: ${stop.price.toFixed(precision)} (${pctS.toFixed(3)}%) ${sPips.toFixed(1)}  Amount: ${POSITION_RISK_BUDGET.toFixed(2)}`],
        red,
        "#ffffff",
        10,
      );
      centerChip(ctx, cx, yE, [`Qty: ${qty.toFixed(0)}`, `Risk/reward ratio: ${rr.toFixed(2)}`], withAlpha(red, 0.92), "#ffffff", 10);
    }
    ctx.restore();
  }
  bbox(mapper: CoordinateMapper): Rect | null {
    return rectFromPoints(this.anchors(mapper).map((a) => ({ x: a.x, y: a.y })));
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const r = this.bbox(mapper);
    return !!r && pointInRect(x, y, r, HIT_TOLERANCE);
  }
}

// ---- measurement ruler ----

class Measure extends DrawingObject {
  render({ ctx, mapper, pipSize, precision }: RenderCtx): void {
    const a = this.px(mapper, this.points[0]!);
    const b = this.px(mapper, this.points[1]!);
    if (!a || !b) return;
    const dPrice = this.points[1]!.price - this.points[0]!.price;
    const up = dPrice >= 0;
    const col = up ? "#22c3a0" : "#f4646c";
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = withAlpha(col, 0.12);
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const pips = dPrice / pipSize;
    const pct = this.points[0]!.price ? (dPrice / this.points[0]!.price) * 100 : 0;
    const bars = Math.abs(this.points[1]!.time - this.points[0]!.time);
    void precision;
    chip(ctx, b.x + 8, b.y - 10, `${up ? "▲" : "▼"} ${pips.toFixed(1)} pips · ${pct.toFixed(2)}% · ${Math.round(bars / 60)}m`, withAlpha("#0b0f1a", 0.92), col, 10);
    ctx.restore();
  }
  hitTest(x: number, y: number, mapper: CoordinateMapper): boolean {
    const a = this.px(mapper, this.points[0]!);
    const b = this.px(mapper, this.points[1]!);
    if (!a || !b) return false;
    return distToSegment(x, y, a.x, a.y, b.x, b.y) <= HIT_TOLERANCE + 2;
  }
}

// ---- factory ----

const REGISTRY: Record<ToolKind, new (json: DrawingJSON) => DrawingObject> = {
  trend: TrendLine,
  horizontal: HorizontalLine,
  vertical: VerticalLine,
  ray: RayLine,
  extended: ExtendedLine,
  arrow: ArrowLine,
  rectangle: Rectangle,
  session: SessionBox,
  circle: CircleObj,
  ellipse: EllipseObj,
  triangle: TriangleObj,
  path: PathObj,
  text: TextObj,
  label: TextObj,
  fib: FibObj,
  channel: Channel,
  long: PositionTool,
  short: PositionTool,
  measure: Measure,
};

export function createObject(json: DrawingJSON): DrawingObject {
  const Ctor = REGISTRY[json.kind];
  return new Ctor(json);
}

/** Build a fresh drawing (all anchors coincident on the first point). */
export function newDrawing(kind: ToolKind, first: Point, zIndex: number, count: number, text = ""): DrawingObject {
  const points: Point[] = Array.from({ length: Math.max(1, count) }, () => ({ ...first }));
  const style = defaultStyle(kind);
  if (text) style.text = text;
  return createObject({
    id: nextId(),
    kind,
    points,
    style,
    locked: false,
    hidden: false,
    zIndex,
    visibleTimeframes: null,
  });
}
