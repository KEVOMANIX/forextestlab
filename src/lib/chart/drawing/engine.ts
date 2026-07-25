/**
 * Canvas drawing engine.
 *
 * Owns two stacked canvases over the chart: a scene layer (all committed
 * objects) and an overlay layer (selection chrome, hover, magnet, in-progress
 * geometry). A single rAF scheduler coalesces redraws and only repaints dirty
 * layers, and only objects whose bounding box intersects the viewport.
 *
 * Interaction never uses stopPropagation: the host element's `pointer-events`
 * is toggled so that empty-space gestures fall through to the chart (pan/zoom)
 * while gestures over a drawing — or while a tool is active — are captured here.
 */

import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";

import { CoordinateMapper, type Candle } from "./coords";
import { DrawingObject, SELECTION_HANDLE, type RenderCtx } from "./object";
import { createObject, newDrawing } from "./objects";
import {
  HANDLE_FILL,
  SELECTION_BLUE,
  TOOL_POINTS,
  TOOLS_NEEDING_TEXT,
  nextId,
  type DrawingJSON,
  type MagnetMode,
  type Point,
  type ToolKind,
} from "./types";

type CreateMode = "single" | "drag" | "click";

function creationMode(kind: ToolKind): CreateMode {
  if (kind === "horizontal" || kind === "vertical" || kind === "text" || kind === "label") return "single";
  if (kind === "triangle" || kind === "channel" || kind === "path") return "click";
  return "drag";
}

interface EngineEnv {
  tool: ToolKind | null;
  magnet: MagnetMode;
  candles: Candle[];
  precision: number;
  pipSize: number;
  timeframe: string;
}

interface DragState {
  id: string;
  kind: "move" | "anchor";
  index: number;
  startPx: { x: number; y: number };
  origin: Point[];
}

interface CreateState {
  obj: DrawingObject;
  mode: CreateMode;
  placed: number;
}

export interface ContextMenuRequest {
  clientX: number;
  clientY: number;
  id: string;
}

export class DrawingEngine {
  private mapper: CoordinateMapper;
  private scene: HTMLCanvasElement;
  private overlay: HTMLCanvasElement;
  private sceneCtx: CanvasRenderingContext2D;
  private overlayCtx: CanvasRenderingContext2D;
  private dpr = 1;

  private objects: DrawingObject[] = [];
  private selectedId: string | null = null;
  private hoverId: string | null = null;

  private drag: DragState | null = null;
  private create: CreateState | null = null;
  private snapDot: { x: number; y: number } | null = null;

  private env: EngineEnv = { tool: null, magnet: "off", candles: [], precision: 5, pipSize: 0.0001, timeframe: "" };

  private history: DrawingJSON[][] = [];
  private future: DrawingJSON[][] = [];
  private clipboard: DrawingJSON[] = [];

  private sceneDirty = true;
  private overlayDirty = true;
  private frame = 0;
  private ro: ResizeObserver;

  // React callbacks
  onOpenSettings?: (json: DrawingJSON) => void;
  onContextMenu?: (req: ContextMenuRequest) => void;
  onToolConsumed?: () => void;
  onSelectionChange?: (json: DrawingJSON | null) => void;
  onObjectsChange?: (count: number) => void;
  private lastCount = -1;

  /** The chart's own root element — where we listen for drawing input. */
  private chartEl: HTMLElement;
  /** True while the chart's native pan/zoom is suspended for a drawing gesture. */
  private frozen = false;
  /** Ctrl/Cmd held → temporarily invert magnet (off↔strong), like TradingView. */
  private ctrlHeld = false;

  constructor(
    private chart: IChartApi,
    series: ISeriesApi<SeriesType>,
    private host: HTMLElement,
  ) {
    this.mapper = new CoordinateMapper(chart, series);
    this.scene = this.makeCanvas(1);
    this.overlay = this.makeCanvas(2);
    this.sceneCtx = this.scene.getContext("2d")!;
    this.overlayCtx = this.overlay.getContext("2d")!;
    this.chartEl = chart.chartElement();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();

    // The overlay never intercepts pointer events (host stays pointer-events:none).
    // We listen on the chart element so empty-space gestures pan/zoom natively,
    // and freeze the chart only while a drawing gesture is in progress.
    this.chartEl.addEventListener("pointerdown", this.onPointerDown, true);
    this.chartEl.addEventListener("dblclick", this.onDoubleClick);
    this.chartEl.addEventListener("contextmenu", this.onContext);
    window.addEventListener("pointermove", this.onWindowMove);
    window.addEventListener("pointerup", this.onWindowUp);
    window.addEventListener("pointercancel", this.onWindowUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    this.loop();
  }

  private freezeChart(): void {
    if (this.frozen) return;
    this.frozen = true;
    this.chart.applyOptions({ handleScroll: false, handleScale: false });
  }

  private unfreezeChart(): void {
    if (!this.frozen) return;
    this.frozen = false;
    this.chart.applyOptions({ handleScroll: true, handleScale: true });
  }

  private makeCanvas(z: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.style.position = "absolute";
    c.style.inset = "0";
    c.style.width = "100%";
    c.style.height = "100%";
    c.style.zIndex = String(z);
    this.host.appendChild(c);
    return c;
  }

  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.dpr = window.devicePixelRatio || 1;
    for (const c of [this.scene, this.overlay]) {
      c.width = Math.round(w * this.dpr);
      c.height = Math.round(h * this.dpr);
    }
    this.mapper.width = w;
    this.mapper.height = h;
    this.sceneCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.overlayCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.sceneDirty = true;
    this.overlayDirty = true;
  }

  // ---- public API (React) ----

  setEnv(env: Partial<EngineEnv>): void {
    const prevTool = this.env.tool;
    this.env = { ...this.env, ...env };
    if (env.candles) this.mapper.setCandles(env.candles);
    if (env.tool !== undefined && env.tool !== prevTool) {
      // Tool changed: cancel any half-drawn object and reset cursor.
      this.cancelCreate();
      this.chartEl.style.cursor = this.env.tool ? "crosshair" : "";
      if (this.env.tool) this.select(null);
    }
    this.sceneDirty = true;
  }

  onViewChanged(): void {
    this.sceneDirty = true;
    this.overlayDirty = true;
  }

  getSelected(): DrawingJSON | null {
    const o = this.objects.find((d) => d.id === this.selectedId);
    return o ? o.serialize() : null;
  }

  updateObject(id: string, patch: Partial<DrawingJSON>): void {
    const o = this.objects.find((d) => d.id === id);
    if (!o) return;
    this.pushHistory();
    if (patch.style) Object.assign(o.style, patch.style);
    if (patch.points) o.points = patch.points.map((p) => ({ ...p }));
    if (patch.locked !== undefined) o.locked = patch.locked;
    if (patch.hidden !== undefined) o.hidden = patch.hidden;
    if (patch.visibleTimeframes !== undefined) o.visibleTimeframes = patch.visibleTimeframes ? [...patch.visibleTimeframes] : null;
    if (patch.zIndex !== undefined) o.zIndex = patch.zIndex;
    this.sceneDirty = true;
    this.overlayDirty = true;
    this.emitSelection();
  }

  deleteSelected(): void {
    if (!this.selectedId) return;
    this.pushHistory();
    this.objects = this.objects.filter((d) => d.id !== this.selectedId);
    this.select(null);
    this.sceneDirty = true;
  }

  duplicateSelected(): void {
    const o = this.objects.find((d) => d.id === this.selectedId);
    if (!o) return;
    this.pushHistory();
    const json = o.serialize();
    json.id = nextId();
    json.zIndex = this.topZ() + 1;
    json.points = json.points.map((p) => ({ time: p.time, price: p.price * 0.999 }));
    const clone = createObject(json);
    this.objects.push(clone);
    this.select(clone.id);
    this.sceneDirty = true;
  }

  copy(): void {
    const o = this.objects.find((d) => d.id === this.selectedId);
    this.clipboard = o ? [o.serialize()] : [];
  }

  paste(): void {
    if (!this.clipboard.length) return;
    this.pushHistory();
    let last = "";
    for (const src of this.clipboard) {
      const json: DrawingJSON = JSON.parse(JSON.stringify(src));
      json.id = nextId();
      json.zIndex = this.topZ() + 1;
      json.points = json.points.map((p) => ({ time: p.time, price: p.price * 0.999 }));
      const o = createObject(json);
      this.objects.push(o);
      last = o.id;
    }
    if (last) this.select(last);
    this.sceneDirty = true;
  }

  bringToFront(): void {
    const o = this.objects.find((d) => d.id === this.selectedId);
    if (!o) return;
    this.pushHistory();
    o.zIndex = this.topZ() + 1;
    this.sceneDirty = true;
  }

  sendToBack(): void {
    const o = this.objects.find((d) => d.id === this.selectedId);
    if (!o) return;
    this.pushHistory();
    o.zIndex = this.bottomZ() - 1;
    this.sceneDirty = true;
  }

  toggleLock(): void {
    const o = this.objects.find((d) => d.id === this.selectedId);
    if (!o) return;
    this.pushHistory();
    o.locked = !o.locked;
    this.emitSelection();
    this.overlayDirty = true;
  }

  toggleHide(): void {
    const o = this.objects.find((d) => d.id === this.selectedId);
    if (!o) return;
    this.pushHistory();
    o.hidden = !o.hidden;
    this.select(null);
    this.sceneDirty = true;
  }

  clearAll(): void {
    if (!this.objects.length) return;
    this.pushHistory();
    this.objects = [];
    this.select(null);
    this.sceneDirty = true;
  }

  count(): number {
    return this.objects.length;
  }

  undo(): void {
    const snap = this.history.pop();
    if (!snap) return;
    this.future.push(this.objects.map((o) => o.serialize()));
    this.objects = snap.map(createObject);
    this.select(null);
    this.sceneDirty = true;
  }

  redo(): void {
    const snap = this.future.pop();
    if (!snap) return;
    this.history.push(this.objects.map((o) => o.serialize()));
    this.objects = snap.map(createObject);
    this.select(null);
    this.sceneDirty = true;
  }

  serialize(): DrawingJSON[] {
    return this.objects.map((o) => o.serialize());
  }

  load(list: DrawingJSON[]): void {
    this.objects = list.map(createObject);
    this.select(null);
    this.sceneDirty = true;
  }

  destroy(): void {
    this.unfreezeChart();
    this.ro.disconnect();
    cancelAnimationFrame(this.frame);
    this.chartEl.removeEventListener("pointerdown", this.onPointerDown, true);
    this.chartEl.removeEventListener("dblclick", this.onDoubleClick);
    this.chartEl.removeEventListener("contextmenu", this.onContext);
    window.removeEventListener("pointermove", this.onWindowMove);
    window.removeEventListener("pointerup", this.onWindowUp);
    window.removeEventListener("pointercancel", this.onWindowUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.scene.remove();
    this.overlay.remove();
  }

  // ---- history ----

  private pushHistory(): void {
    this.history.push(this.objects.map((o) => o.serialize()));
    if (this.history.length > 100) this.history.shift();
    this.future = [];
  }

  private topZ(): number {
    return this.objects.reduce((m, o) => Math.max(m, o.zIndex), 0);
  }
  private bottomZ(): number {
    return this.objects.reduce((m, o) => Math.min(m, o.zIndex), 0);
  }

  // ---- selection ----

  private select(id: string | null): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.overlayDirty = true;
    this.emitSelection();
  }

  private emitSelection(): void {
    this.onSelectionChange?.(this.getSelected());
  }

  // ---- hit testing ----

  private localPx(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private hitObject(x: number, y: number): DrawingObject | null {
    // Top-most first (descending zIndex).
    const sorted = [...this.objects].sort((a, b) => b.zIndex - a.zIndex);
    for (const o of sorted) {
      if (!o.visibleOn(this.env.timeframe)) continue;
      if (o.hitTest(x, y, this.mapper)) return o;
    }
    return null;
  }

  private anchorAt(o: DrawingObject, x: number, y: number): number | null {
    for (const a of o.anchors(this.mapper)) {
      if (Math.hypot(a.x - x, a.y - y) <= SELECTION_HANDLE + 3) return a.index;
    }
    return null;
  }

  private snap(p: Point): Point {
    let mode = this.env.magnet;
    if (this.ctrlHeld) mode = mode === "off" ? "strong" : "off";
    return this.mapper.snapPrice(p, mode, this.env.candles);
  }

  // ---- interaction ----

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button === 2) return; // context menu handled separately
    const px = this.localPx(e);
    if (px.x < 0 || px.y < 0 || px.x > this.mapper.width || px.y > this.mapper.height) return;

    if (this.env.tool) {
      // Drawing gesture: suspend the chart's own pan/zoom while we place points.
      this.freezeChart();
      this.beginCreateOrAdvance(px);
      return;
    }
    // Select mode. Grabbing an object / anchor freezes the chart so the drag
    // moves the object rather than panning; empty clicks leave the chart free.
    const sel = this.objects.find((d) => d.id === this.selectedId) ?? null;
    if (sel && !sel.locked) {
      const ai = this.anchorAt(sel, px.x, px.y);
      if (ai != null) {
        this.freezeChart();
        this.drag = { id: sel.id, kind: "anchor", index: ai, startPx: px, origin: sel.points.map((p) => ({ ...p })) };
        return;
      }
    }
    const hit = this.hitObject(px.x, px.y);
    if (hit) {
      this.select(hit.id);
      if (!hit.locked) {
        this.freezeChart();
        this.drag = { id: hit.id, kind: "move", index: -1, startPx: px, origin: hit.points.map((p) => ({ ...p })) };
      }
    } else {
      this.select(null);
    }
  };

  private beginCreateOrAdvance(px: { x: number; y: number }): void {
    const kind = this.env.tool!;
    const point = this.snap(this.mapper.pixelToPoint(px.x, px.y) ?? { time: 0, price: 0 });

    if (this.create) {
      // click-mode: commit floating anchor and advance
      this.create.placed += 1;
      const needed = TOOL_POINTS[kind];
      if (this.create.placed >= needed) this.finalizeCreate();
      else if (kind === "path") this.create.obj.points.push({ ...point });
      return;
    }

    const mode = creationMode(kind);
    let text = "";
    if (TOOLS_NEEDING_TEXT.has(kind)) {
      text = window.prompt("Text:")?.trim() || "";
      if (!text) {
        this.onToolConsumed?.();
        return;
      }
    }
    const count = kind === "path" ? 2 : Number.isFinite(TOOL_POINTS[kind]) ? TOOL_POINTS[kind] : 2;
    const obj = newDrawing(kind, point, this.topZ() + 1, count, text);
    this.objects.push(obj);
    this.select(obj.id);
    this.snapDot = this.env.magnet !== "off" ? px : null;

    if (mode === "single") {
      this.finalizeCreate(obj);
      return;
    }
    this.create = { obj, mode, placed: 1 };
    this.sceneDirty = true;
    this.overlayDirty = true;
  }

  private updateCreate(px: { x: number; y: number }): void {
    if (!this.create) return;
    const kind = this.create.obj.kind;
    const point = this.snap(this.mapper.pixelToPoint(px.x, px.y) ?? this.create.obj.points[0]!);
    this.snapDot = this.env.magnet !== "off" ? px : null;
    const obj = this.create.obj;

    if (kind === "long" || kind === "short") {
      const entry = obj.points[0]!;
      obj.points[2] = { ...point }; // target
      obj.points[1] = { time: entry.time, price: entry.price - (point.price - entry.price) }; // mirrored stop
    } else if (this.create.mode === "drag") {
      obj.points[1] = { ...point };
    } else {
      // click mode: the floating anchor is at index = placed
      obj.points[this.create.placed] = { ...point };
    }
    this.sceneDirty = true;
    this.overlayDirty = true;
  }

  private finalizeCreate(obj?: DrawingObject): void {
    const target = obj ?? this.create?.obj;
    this.create = null;
    this.snapDot = null;
    this.unfreezeChart();
    if (target) {
      this.pushHistoryBefore(target.id);
    }
    this.sceneDirty = true;
    this.overlayDirty = true;
    this.onToolConsumed?.();
    this.emitSelection();
  }

  /** Record a history snapshot that excludes the just-created object (so undo removes it). */
  private pushHistoryBefore(id: string): void {
    this.history.push(this.objects.filter((o) => o.id !== id).map((o) => o.serialize()));
    if (this.history.length > 100) this.history.shift();
    this.future = [];
  }

  private cancelCreate(): void {
    if (!this.create) return;
    const id = this.create.obj.id;
    this.objects = this.objects.filter((o) => o.id !== id);
    this.create = null;
    this.snapDot = null;
    this.unfreezeChart();
    this.sceneDirty = true;
    this.overlayDirty = true;
  }

  private onWindowMove = (e: PointerEvent): void => {
    const px = this.localPx(e);
    if (this.create) {
      this.updateCreate(px);
      return;
    }
    if (this.drag) {
      this.updateDrag(px);
      return;
    }
    // Hover feedback in select mode (cursor + highlight). No pointer-events games.
    const inside = px.x >= 0 && px.y >= 0 && px.x <= this.mapper.width && px.y <= this.mapper.height;
    if (this.env.tool) {
      this.chartEl.style.cursor = inside ? "crosshair" : "";
      return;
    }
    if (!inside) {
      if (this.hoverId) {
        this.hoverId = null;
        this.overlayDirty = true;
      }
      this.chartEl.style.cursor = "";
      return;
    }
    const hit = this.hitObject(px.x, px.y);
    const id = hit?.id ?? null;
    this.chartEl.style.cursor = id ? "move" : "";
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.overlayDirty = true;
    }
  };

  private updateDrag(px: { x: number; y: number }): void {
    if (!this.drag) return;
    const o = this.objects.find((d) => d.id === this.drag!.id);
    if (!o) return;
    if (this.drag.kind === "move") {
      const dx = px.x - this.drag.startPx.x;
      const dy = px.y - this.drag.startPx.y;
      o.points = this.drag.origin.map((p) => this.movePoint(p, dx, dy));
    } else {
      const point = this.snap(this.mapper.pixelToPoint(px.x, px.y) ?? this.drag.origin[this.drag.index]!);
      this.snapDot = this.env.magnet !== "off" ? px : null;
      o.setAnchor(this.drag.index, point);
    }
    this.sceneDirty = true;
    this.overlayDirty = true;
  }

  private movePoint(p: Point, dxPx: number, dyPx: number): Point {
    const y0 = this.mapper.priceToY(p.price);
    if (y0 == null) return p;
    const np = this.mapper.yToPrice(y0 + dyPx);
    let nt = p.time;
    if (p.time) {
      const x0 = this.mapper.timeToX(p.time);
      if (x0 != null) nt = this.mapper.xToTime(x0 + dxPx) || p.time;
    }
    return { time: nt, price: np ?? p.price };
  }

  private onWindowUp = (): void => {
    if (this.create) {
      if (this.create.mode === "drag") this.finalizeCreate();
      // click mode advances on pointerdown, not up
      return;
    }
    if (this.drag) {
      const o = this.objects.find((d) => d.id === this.drag!.id);
      if (o) {
        // commit: push a snapshot of the pre-drag state
        this.history.push(this.objects.map((d) => (d.id === o.id ? { ...d.serialize(), points: this.drag!.origin } : d.serialize())));
        if (this.history.length > 100) this.history.shift();
        this.future = [];
      }
      this.snapDot = null;
      this.drag = null;
      this.unfreezeChart();
      this.overlayDirty = true;
      this.emitSelection();
    }
  };

  private onDoubleClick = (e: MouseEvent): void => {
    if (this.env.tool) return;
    const px = this.localPx(e);
    const hit = this.hitObject(px.x, px.y);
    if (hit) {
      this.select(hit.id);
      this.onOpenSettings?.(hit.serialize());
    }
  };

  private onContext = (e: MouseEvent): void => {
    const px = this.localPx(e);
    const hit = this.hitObject(px.x, px.y);
    if (hit) {
      e.preventDefault();
      this.select(hit.id);
      this.onContextMenu?.({ clientX: e.clientX, clientY: e.clientY, id: hit.id });
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.ctrlHeld = e.ctrlKey || e.metaKey;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.ctrlHeld = e.ctrlKey || e.metaKey;
    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === "Escape") {
      if (this.create) {
        if (this.create.obj.kind === "path" && this.create.placed >= 2) this.finalizeCreate();
        else this.cancelCreate();
        this.onToolConsumed?.();
      } else {
        this.select(null);
      }
    } else if ((e.key === "Delete" || e.key === "Backspace") && this.selectedId && !this.env.tool) {
      e.preventDefault();
      this.deleteSelected();
    } else if (ctrl && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if (ctrl && e.key.toLowerCase() === "y") {
      e.preventDefault();
      this.redo();
    } else if (ctrl && e.key.toLowerCase() === "c") {
      this.copy();
    } else if (ctrl && e.key.toLowerCase() === "v") {
      e.preventDefault();
      this.paste();
    } else if (ctrl && e.key.toLowerCase() === "d") {
      e.preventDefault();
      this.duplicateSelected();
    } else if (e.key === "Enter" && this.create?.obj.kind === "path" && this.create.placed >= 2) {
      this.finalizeCreate();
      this.onToolConsumed?.();
    }
  };

  // ---- rendering ----

  /**
   * A cheap fingerprint of the current view. Captures horizontal range AND the
   * top/bottom visible prices, so vertical rescale / autoscale — which emit no
   * time-range event — still trigger a redraw and keep objects anchored.
   */
  private viewSignature(): string {
    const tr = this.chart.timeScale().getVisibleLogicalRange();
    const top = this.mapper.yToPrice(0);
    const bot = this.mapper.yToPrice(this.mapper.height);
    return `${tr?.from ?? 0}|${tr?.to ?? 0}|${top ?? 0}|${bot ?? 0}|${this.mapper.width}|${this.mapper.height}`;
  }

  private lastSig = "";

  private loop = (): void => {
    if (this.objects.length !== this.lastCount) {
      this.lastCount = this.objects.length;
      this.onObjectsChange?.(this.lastCount);
    }
    const sig = this.viewSignature();
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.sceneDirty = true;
      this.overlayDirty = true;
    }
    if (this.sceneDirty) {
      this.renderScene();
      this.sceneDirty = false;
    }
    if (this.overlayDirty) {
      this.renderOverlay();
      this.overlayDirty = false;
    }
    this.frame = requestAnimationFrame(this.loop);
  };

  private intersectsViewport(o: DrawingObject): boolean {
    const b = o.bbox(this.mapper);
    if (!b) return false;
    return b.x + b.w >= -20 && b.x <= this.mapper.width + 20 && b.y + b.h >= -20 && b.y <= this.mapper.height + 20;
  }

  private renderScene(): void {
    const ctx = this.sceneCtx;
    ctx.clearRect(0, 0, this.mapper.width, this.mapper.height);
    const sorted = [...this.objects].sort((a, b) => a.zIndex - b.zIndex);
    for (const o of sorted) {
      if (!o.visibleOn(this.env.timeframe)) continue;
      if (!this.intersectsViewport(o)) continue;
      const r: RenderCtx = {
        ctx,
        mapper: this.mapper,
        selected: o.id === this.selectedId,
        hover: o.id === this.hoverId,
        timeframe: this.env.timeframe,
        precision: this.env.precision,
        pipSize: this.env.pipSize,
      };
      ctx.save();
      o.render(r);
      ctx.restore();
    }
  }

  private renderOverlay(): void {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.mapper.width, this.mapper.height);

    // hover highlight
    if (this.hoverId && this.hoverId !== this.selectedId) {
      const o = this.objects.find((d) => d.id === this.hoverId);
      const b = o?.bbox(this.mapper);
      if (b) {
        ctx.save();
        ctx.strokeStyle = SELECTION_BLUE;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
        ctx.restore();
      }
    }

    // selection chrome
    const sel = this.objects.find((d) => d.id === this.selectedId);
    if (sel) {
      const b = sel.bbox(this.mapper);
      if (b) {
        ctx.save();
        ctx.strokeStyle = SELECTION_BLUE;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
        ctx.restore();
      }
      ctx.save();
      ctx.setLineDash([]);
      for (const a of sel.anchors(this.mapper)) {
        ctx.beginPath();
        ctx.arc(a.x, a.y, SELECTION_HANDLE, 0, Math.PI * 2);
        ctx.fillStyle = sel.locked ? "#94a3b8" : HANDLE_FILL;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = sel.locked ? "#94a3b8" : SELECTION_BLUE;
        ctx.stroke();
      }
      ctx.restore();
    }

    // magnet snap indicator
    if (this.snapDot) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.snapDot.x, this.snapDot.y, 4, 0, Math.PI * 2);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }
}
