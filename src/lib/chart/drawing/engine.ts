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
import { PositionZonesPrimitive, type PositionZone } from "./position-zones";
import {
  HANDLE_FILL,
  POSITION_LOSS,
  POSITION_PROFIT,
  SELECTION_BLUE,
  TOOL_POINTS,
  TOOLS_NEEDING_TEXT,
  nextId,
  type DrawingJSON,
  type DrawingStyle,
  type MagnetMode,
  type Point,
  type ToolKind,
} from "./types";

/** Per-tool remembered styles: a new drawing starts from the last-used style. */
export type ToolDefaults = Partial<Record<ToolKind, DrawingStyle>>;

type CreateMode = "single" | "drag" | "click" | "stream";

function creationMode(kind: ToolKind): CreateMode {
  if (kind === "horizontal" || kind === "vertical" || kind === "horizontalRay" || kind === "crossline" || kind === "priceLabel" || kind === "text" || kind === "label") return "single";
  // Position tools drop a default 1:1 box on a single click, then the user
  // drags the handles to place stop/target.
  if (kind === "long" || kind === "short") return "single";
  if (kind === "triangle" || kind === "channel" || kind === "flatChannel" || kind === "disjointChannel" || kind === "fibExtension" || kind === "anchoredText" || kind === "callout" || kind === "path") return "click";
  // A brush/highlighter stroke is pressed, dragged and released — points are
  // sampled continuously while the pointer moves, not placed one click at a
  // time like `path`.
  if (kind === "brush" || kind === "highlighter") return "stream";
  return "drag";
}

/** Minimum pixel travel before a stream stroke samples another point. */
const STREAM_MIN_SAMPLE_PX = 4;

interface EngineEnv {
  tool: ToolKind | null;
  selectionEnabled: boolean;
  magnet: MagnetMode;
  candles: Candle[];
  /** Bar times the chart's time axis continues through past the last candle. */
  futureTimes: number[];
  precision: number;
  pipSize: number;
  timeframe: string;
}

interface DragState {
  id: string;
  kind: "move" | "anchor" | "resize";
  index: number;
  resize?: ResizeHandle;
  startPx: { x: number; y: number };
  origin: Point[];
  originBounds?: { x: number; y: number; w: number; h: number };
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

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

  private env: EngineEnv = { tool: null, selectionEnabled: true, magnet: "off", candles: [], futureTimes: [], precision: 5, pipSize: 0.0001, timeframe: "" };

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
  /** Fired after a user action commits drawing data. Loading a shared snapshot does not fire it. */
  onDrawingsChange?: () => void;
  onToolDefaultsChange?: (defaults: ToolDefaults) => void;
  /** Ask React to open an inline text editor at (x,y) for a just-placed text/label. */
  onRequestTextEdit?: (req: { id: string; x: number; y: number }) => void;
  private lastCount = -1;

  /** Last-used style per tool kind; seeds new drawings so settings persist. */
  private toolDefaults: ToolDefaults = {};

  /** The chart's own root element — where we listen for drawing input. */
  private chartEl: HTMLElement;
  /** Draws the position tools' profit/loss fills beneath the price. */
  private zonesPrimitive: PositionZonesPrimitive | null = null;
  private zonesSeries: ISeriesApi<SeriesType> | null = null;
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

    // Position zones are the one thing that must draw *under* the candles; see
    // position-zones.ts. Attaching can fail on a series the chart has already
    // disposed, and a missing fill is not worth taking the whole engine down.
    this.zonesSeries = series;
    this.zonesPrimitive = new PositionZonesPrimitive(() => this.positionZones());
    try {
      series.attachPrimitive(this.zonesPrimitive);
    } catch {
      this.zonesPrimitive = null;
    }

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

  /**
   * The layer holding every committed drawing, for compositing into a chart
   * screenshot. The interaction overlay is deliberately not exposed: it carries
   * selection handles and half-drawn previews, which belong to the editing
   * session rather than to a picture of the chart.
   */
  get sceneCanvas(): HTMLCanvasElement {
    return this.scene;
  }

  /**
   * Calendar range represented by the full drawing canvas, including empty
   * future/past space. Lightweight Charts' getVisibleRange can omit whitespace
   * carried by the forward time series, which cuts off drawings extended past
   * the latest candle when a timeframe changes.
   */
  getVisibleTimeRange(): { from: number; to: number } | null {
    if (this.mapper.width <= 0) return null;
    // The chart carries an explicit whitespace series through the forward
    // runway, so both canvas edges normally resolve to authoritative UTC times.
    // Prefer those over rebuilding from logical indexes: multiple series can
    // shift the chart's global logical origin away from the mapper's candle 0.
    const scale = this.chart.timeScale();
    const chartFrom = scale.coordinateToTime(0);
    const chartTo = scale.coordinateToTime(this.mapper.width);
    const from = typeof chartFrom === "number" ? chartFrom : this.mapper.xToTime(0);
    const to = typeof chartTo === "number" ? chartTo : this.mapper.xToTime(this.mapper.width);
    return from && to && from < to ? { from, to } : null;
  }

  /**
   * Where a moment falls across the canvas, in pixels from its left edge, or
   * null when it lies outside. Shared with the calendar layer so a news badge is
   * placed by the same projection as a drawing anchored to the same minute —
   * including across weekend gaps and out along the forward runway, neither of
   * which the chart's own `timeToCoordinate` handles for a time no bar occupies.
   */
  timeToX(time: number): number | null {
    return this.mapper.timeToX(time);
  }

  /** Canvas width in CSS pixels; 0 before the first layout. */
  get width(): number {
    return this.mapper.width;
  }

  /** Canvas height in CSS pixels; 0 before the first layout. */
  get height(): number {
    return this.mapper.height;
  }

  setEnv(env: Partial<EngineEnv>): void {
    const prevTool = this.env.tool;
    const prevSelectionEnabled = this.env.selectionEnabled;
    const geometryChanged =
      (env.precision !== undefined && env.precision !== this.env.precision) ||
      (env.pipSize !== undefined && env.pipSize !== this.env.pipSize) ||
      (env.timeframe !== undefined && env.timeframe !== this.env.timeframe);
    this.env = { ...this.env, ...env };
    // Candle updates happen before the chart completes its own replay paint.
    // Updating the mapper is necessary for dragging/future extrapolation, but
    // forcing an immediate scene repaint here races the chart and produces an
    // alternating old/new frame. View-signature changes repaint the scene once
    // the chart's time/price scales have settled.
    if (env.candles) this.mapper.setCandles(env.candles);
    if (env.futureTimes) this.mapper.setFutureTimes(env.futureTimes);
    if (env.tool !== undefined && env.tool !== prevTool) {
      // Tool changed: cancel any half-drawn object and reset cursor.
      this.cancelCreate();
      this.chartEl.style.cursor = this.env.tool ? "crosshair" : "";
      // React can commit the rail's pressed state a frame before this effect
      // runs, so the armed tool is published from here — the point at which a
      // pointer-down would actually start drawing it.
      this.host.dataset.drawingTool = this.env.tool ?? "";
      if (this.env.tool) this.select(null);
    }
    if (env.selectionEnabled !== undefined && env.selectionEnabled !== prevSelectionEnabled) {
      if (!this.env.selectionEnabled) this.select(null);
      this.chartEl.style.cursor = this.env.selectionEnabled ? "" : "crosshair";
    }
    if (geometryChanged) {
      this.sceneDirty = true;
      this.overlayDirty = true;
    }
  }

  onViewChanged(): void {
    this.sceneDirty = true;
    this.overlayDirty = true;
  }

  loadToolDefaults(defaults: ToolDefaults): void {
    this.toolDefaults = defaults ?? {};
  }

  /** Temporarily hide/show every drawing without deleting anything. */
  private allHidden = false;
  setHideAll(hidden: boolean): void {
    if (this.allHidden === hidden) return;
    this.allHidden = hidden;
    this.sceneDirty = true;
    this.overlayDirty = true;
  }
  isHiddenAll(): boolean {
    return this.allHidden;
  }

  /**
   * Freeze every drawing against move/resize without touching any object's
   * own `locked` flag — the same relationship `setHideAll` has to a drawing's
   * own `hidden` flag. Unlocking this restores each drawing to whatever its
   * individual lock state already was, rather than force-unlocking ones a
   * trader had locked on purpose.
   */
  private allLocked = false;
  setAllLocked(locked: boolean): void {
    if (this.allLocked === locked) return;
    this.allLocked = locked;
    this.overlayDirty = true;
  }
  isLockedAll(): boolean {
    return this.allLocked;
  }
  private isLocked(o: DrawingObject): boolean {
    return this.allLocked || o.locked;
  }

  /** Live-update an object's text (used by the inline text editor; no history). */
  setObjectText(id: string, text: string): void {
    const o = this.objects.find((d) => d.id === id);
    if (!o) return;
    o.style.text = text;
    this.sceneDirty = true;
    this.emitSelection();
    this.onDrawingsChange?.();
  }

  /** Remove an object by id (e.g. an empty text box the user abandoned). */
  removeObject(id: string): void {
    const before = this.objects.length;
    this.objects = this.objects.filter((o) => o.id !== id);
    if (this.objects.length === before) return;
    if (this.selectedId === id) this.select(null);
    this.sceneDirty = true;
    this.onDrawingsChange?.();
  }

  getSelected(): DrawingJSON | null {
    const o = this.objects.find((d) => d.id === this.selectedId);
    return o ? o.serialize() : null;
  }

  /** Position a compact editing toolbar just above the selected object. */
  getSelectionToolbarPosition(): { x: number; y: number } | null {
    const o = this.objects.find((d) => d.id === this.selectedId);
    const b = o?.bbox(this.mapper);
    if (!b) return null;
    const halfToolbar = Math.min(170, this.mapper.width / 2);
    return {
      x: Math.max(halfToolbar, Math.min(this.mapper.width - halfToolbar, b.x + b.w / 2)),
      y: Math.max(48, Math.min(this.mapper.height - 8, b.y - 10)),
    };
  }

  updateObject(id: string, patch: Partial<DrawingJSON>): void {
    const o = this.objects.find((d) => d.id === id);
    if (!o) return;
    this.pushHistory();
    if (patch.style) {
      Object.assign(o.style, patch.style);
      // Remember this style as the starting point for future drawings of this kind.
      this.toolDefaults[o.kind] = { ...o.style };
      this.onToolDefaultsChange?.(this.toolDefaults);
    }
    if (patch.points) o.points = patch.points.map((p) => ({ ...p }));
    if (patch.locked !== undefined) o.locked = patch.locked;
    if (patch.hidden !== undefined) o.hidden = patch.hidden;
    if (patch.visibleTimeframes !== undefined) o.visibleTimeframes = patch.visibleTimeframes ? [...patch.visibleTimeframes] : null;
    if (patch.zIndex !== undefined) o.zIndex = patch.zIndex;
    this.sceneDirty = true;
    this.overlayDirty = true;
    this.emitSelection();
    this.onDrawingsChange?.();
  }

  deleteSelected(): void {
    if (!this.selectedId) return;
    this.pushHistory();
    this.objects = this.objects.filter((d) => d.id !== this.selectedId);
    this.select(null);
    this.sceneDirty = true;
    this.onDrawingsChange?.();
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
    this.onDrawingsChange?.();
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
    this.onDrawingsChange?.();
  }

  bringToFront(): void {
    const o = this.objects.find((d) => d.id === this.selectedId);
    if (!o) return;
    this.pushHistory();
    o.zIndex = this.topZ() + 1;
    this.sceneDirty = true;
    this.onDrawingsChange?.();
  }

  sendToBack(): void {
    const o = this.objects.find((d) => d.id === this.selectedId);
    if (!o) return;
    this.pushHistory();
    o.zIndex = this.bottomZ() - 1;
    this.sceneDirty = true;
    this.onDrawingsChange?.();
  }

  toggleLock(): void {
    const o = this.objects.find((d) => d.id === this.selectedId);
    if (!o) return;
    this.pushHistory();
    o.locked = !o.locked;
    this.emitSelection();
    this.overlayDirty = true;
    this.onDrawingsChange?.();
  }

  toggleHide(): void {
    const o = this.objects.find((d) => d.id === this.selectedId);
    if (!o) return;
    this.pushHistory();
    o.hidden = !o.hidden;
    this.select(null);
    this.sceneDirty = true;
    this.onDrawingsChange?.();
  }

  clearAll(): void {
    if (!this.objects.length) return;
    this.pushHistory();
    this.objects = [];
    this.select(null);
    this.sceneDirty = true;
    this.onDrawingsChange?.();
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
    this.onDrawingsChange?.();
  }

  redo(): void {
    const snap = this.future.pop();
    if (!snap) return;
    this.history.push(this.objects.map((o) => o.serialize()));
    this.objects = snap.map(createObject);
    this.select(null);
    this.sceneDirty = true;
    this.onDrawingsChange?.();
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
    if (this.zonesPrimitive && this.zonesSeries) {
      try {
        this.zonesSeries.detachPrimitive(this.zonesPrimitive);
      } catch {
        // The series may already be gone with the chart; nothing left to detach.
      }
    }
    this.zonesPrimitive = null;
    this.zonesSeries = null;
    this.scene.remove();
    this.overlay.remove();
  }

  /**
   * The profit/loss rectangles for every visible position tool, in chart pane
   * pixels. Hidden and unprojectable positions drop out here rather than in the
   * renderer, so the primitive can skip its pane view entirely when there are
   * none to draw.
   */
  private positionZones(): PositionZone[] {
    if (!this.env.selectionEnabled && this.objects.length === 0) return [];
    const zones: PositionZone[] = [];
    for (const object of this.objects) {
      if (object.kind !== "long" && object.kind !== "short") continue;
      if (object.hidden) continue;
      const [entry, stop, target] = object.points;
      if (!entry || !stop || !target) continue;
      const xE = this.mapper.timeToX(entry.time);
      const xT = this.mapper.timeToX(target.time);
      const yEntry = this.mapper.priceToY(entry.price);
      const yStop = this.mapper.priceToY(stop.price);
      const yTarget = this.mapper.priceToY(target.price);
      if (xE == null || xT == null || yEntry == null || yStop == null || yTarget == null) continue;
      const selected = object.id === this.selectedId;
      zones.push({
        left: Math.min(xE, xT),
        right: Math.max(xE, xT),
        yEntry,
        yStop,
        yTarget,
        profitColor: POSITION_PROFIT,
        lossColor: POSITION_LOSS,
        // Behind the candles the fill can carry real weight, so this is a good
        // deal stronger than the 0.14 wash it used while painting over the
        // price. Sampling TradingView's own zones against a near-black
        // background puts them at roughly this alpha — enough that the box
        // reads as a solid region, not so much that it becomes the loudest
        // thing on the pane.
        profitAlpha: selected ? 0.28 : 0.22,
        lossAlpha: selected ? 0.28 : 0.22,
      });
    }
    return zones;
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
    // Some objects (e.g. position tool) render selection-dependent chrome in
    // the scene layer, so a selection change must repaint the scene too.
    this.sceneDirty = true;
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

  private anchorAt(
    o: DrawingObject,
    x: number,
    y: number,
  ): { kind: "anchor"; index: number } | { kind: "resize"; handle: ResizeHandle } | null {
    if (this.hasNoHandles(o)) return null;
    if (!this.usesOnlyResizeHandles(o)) {
      for (const a of o.anchors(this.mapper)) {
        if (Math.hypot(a.x - x, a.y - y) <= SELECTION_HANDLE + 3) {
          return { kind: "anchor", index: a.index };
        }
      }
    }
    if (!this.usesOnlyAnchorHandles(o)) {
      for (const a of this.resizeHandles(o)) {
        if (Math.hypot(a.x - x, a.y - y) <= SELECTION_HANDLE + 3) {
          return { kind: "resize", handle: a.handle };
        }
      }
    }
    return null;
  }

  /** Area shapes are clearer with their eight resize handles alone. */
  private usesOnlyResizeHandles(o: DrawingObject): boolean {
    return o.kind === "rectangle" || o.kind === "session" ||
      o.kind === "circle" || o.kind === "ellipse";
  }

  /** Line-based tools need only their real control points, not a bounding box. */
  private usesOnlyAnchorHandles(o: DrawingObject): boolean {
    return o.kind === "trend" || o.kind === "ray" || o.kind === "extended" ||
      o.kind === "arrow" || o.kind === "horizontal" || o.kind === "vertical" ||
      o.kind === "channel" || o.kind === "horizontalRay" || o.kind === "crossline" ||
      o.kind === "infoLine" || o.kind === "trendAngle" || o.kind === "regression" ||
      o.kind === "flatChannel" || o.kind === "disjointChannel" || o.kind === "fibExtension" ||
      o.kind === "priceRange" || o.kind === "dateRange" || o.kind === "datePriceRange" ||
      o.kind === "callout" || o.kind === "priceLabel" || o.kind === "anchoredText" ||
      // A position's three points are an entry, a stop and a target, each of
      // which means something on its own. Bounding-box handles rescaled all
      // three proportionally, so reaching for the stop moved the entry with it.
      o.kind === "long" || o.kind === "short";
  }

  /**
   * A freehand stroke's points are automatic samples, not placed anchors —
   * a long stroke can carry dozens of them, and a handle at every one reads
   * as clutter instead of control. It still moves by dragging its body; the
   * contextual toolbar that appears on selection is feedback enough that
   * something is selected.
   */
  private hasNoHandles(o: DrawingObject): boolean {
    return o.kind === "brush" || o.kind === "highlighter";
  }

  private resizeHandles(o: DrawingObject): { x: number; y: number; handle: ResizeHandle }[] {
    const b = o.bbox(this.mapper);
    if (!b) return [];
    const left = b.x;
    const centerX = b.x + b.w / 2;
    const right = b.x + b.w;
    const top = b.y;
    const centerY = b.y + b.h / 2;
    const bottom = b.y + b.h;
    const candidates: { x: number; y: number; handle: ResizeHandle }[] = [
      { x: left, y: top, handle: "nw" },
      { x: centerX, y: top, handle: "n" },
      { x: right, y: top, handle: "ne" },
      { x: right, y: centerY, handle: "e" },
      { x: right, y: bottom, handle: "se" },
      { x: centerX, y: bottom, handle: "s" },
      { x: left, y: bottom, handle: "sw" },
      { x: left, y: centerY, handle: "w" },
    ];
    // Zero-width/height objects produce duplicate handles. Keep one at each
    // physical point while their original anchors remain independently usable.
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      const key = `${Math.round(candidate.x)}:${Math.round(candidate.y)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
    if (!this.env.selectionEnabled) {
      this.select(null);
      return;
    }
    // Select mode. Grabbing an object / anchor freezes the chart so the drag
    // moves the object rather than panning; empty clicks leave the chart free.
    const sel = this.objects.find((d) => d.id === this.selectedId) ?? null;
    if (sel && !this.isLocked(sel)) {
      const handle = this.anchorAt(sel, px.x, px.y);
      if (handle) {
        this.freezeChart();
        this.drag = {
          id: sel.id,
          kind: handle.kind,
          index: handle.kind === "anchor" ? handle.index : -1,
          resize: handle.kind === "resize" ? handle.handle : undefined,
          startPx: px,
          origin: sel.points.map((p) => ({ ...p })),
          originBounds: sel.bbox(this.mapper) ?? undefined,
        };
        return;
      }
    }
    const hit = this.hitObject(px.x, px.y);
    if (hit) {
      this.select(hit.id);
      if (!this.isLocked(hit)) {
        this.freezeChart();
        this.drag = hit.kind === "anchoredText" || hit.kind === "callout"
          ? { id: hit.id, kind: "anchor", index: 1, startPx: px, origin: hit.points.map((p) => ({ ...p })) }
          : { id: hit.id, kind: "move", index: -1, startPx: px, origin: hit.points.map((p) => ({ ...p })) };
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
    const count = kind === "path" || kind === "brush" || kind === "highlighter" ? 2 : Number.isFinite(TOOL_POINTS[kind]) ? TOOL_POINTS[kind] : 2;
    const obj = newDrawing(kind, point, this.topZ() + 1, count, "");
    // Seed from the user's last-used style for this tool (text is never inherited).
    const saved = this.toolDefaults[kind];
    if (saved) {
      const ownText = obj.style.text; // never inherit the previous drawing's text
      obj.style = { ...obj.style, ...saved, text: ownText };
    }
    if (kind === "long" || kind === "short") this.applyDefaultPosition(obj, px, kind);
    this.objects.push(obj);
    // Keep creation visually clean: the scene paints the real in-progress
    // geometry, while selection handles and the contextual toolbar wait until
    // the drawing is committed.
    this.selectedId = obj.id;
    this.snapDot = this.env.magnet !== "off" ? px : null;

    if (mode === "single") {
      this.finalizeCreate(obj);
      // Text/label: drop a cursor on the chart and let the user type directly.
      if (TOOLS_NEEDING_TEXT.has(kind)) this.onRequestTextEdit?.({ id: obj.id, x: px.x, y: px.y });
      return;
    }
    this.create = { obj, mode, placed: 1 };
    this.sceneDirty = true;
    this.overlayDirty = true;
  }

  /** Seed a long/short position with a default 1:1 box (entry at click). */
  private applyDefaultPosition(obj: DrawingObject, px: { x: number; y: number }, kind: ToolKind): void {
    const entry = obj.points[0]!;
    const yE = this.mapper.priceToY(entry.price);
    const xE = this.mapper.timeToX(entry.time) ?? px.x;
    if (yE == null) return;
    const halfPx = 80; // default vertical half-height → equal risk & reward
    const widthPx = 150; // default box width
    const up = kind === "long";
    const targetPrice = this.mapper.yToPrice(up ? yE - halfPx : yE + halfPx) ?? entry.price;
    const stopPrice = this.mapper.yToPrice(up ? yE + halfPx : yE - halfPx) ?? entry.price;
    const targetTime = this.mapper.xToTime(xE + widthPx) || entry.time;
    obj.points[1] = { time: entry.time, price: stopPrice }; // stop
    obj.points[2] = { time: targetTime, price: targetPrice }; // target
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
    } else if (this.create.mode === "stream") {
      // Sample a new point only once the pointer has actually travelled —
      // otherwise a long stroke's array grows by one point per pointermove
      // event, most of them a fraction of a pixel apart. Below the threshold
      // the trailing point still tracks the cursor, so the stroke has no dead
      // zone between samples.
      const lastIndex = obj.points.length - 1;
      const last = obj.points[lastIndex]!;
      const lastX = last.time ? this.mapper.timeToX(last.time) ?? px.x : px.x;
      const lastY = this.mapper.priceToY(last.price) ?? px.y;
      if (Math.hypot(px.x - lastX, px.y - lastY) >= STREAM_MIN_SAMPLE_PX) {
        obj.points.push({ ...point });
      } else {
        obj.points[lastIndex] = { ...point };
      }
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
      if (!obj && (target.kind === "callout" || target.kind === "anchoredText")) {
        const anchor = target.anchors(this.mapper).at(-1);
        if (anchor) this.onRequestTextEdit?.({ id: target.id, x: anchor.x, y: anchor.y });
      }
    }
    this.sceneDirty = true;
    this.overlayDirty = true;
    // A brush/highlighter mark is one of several a trader sketches in a
    // row — unlike a trend line, placed once and reconsidered — so leave the
    // tool armed instead of sending them back to the Brushes menu after
    // every stroke. Escape or picking another tool still stops it.
    const stayArmed = target?.kind === "brush" || target?.kind === "highlighter";
    if (!stayArmed) this.onToolConsumed?.();
    this.emitSelection();
    this.onDrawingsChange?.();
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
    if (!this.env.selectionEnabled) {
      if (this.hoverId) {
        this.hoverId = null;
        this.overlayDirty = true;
      }
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
    const selected = this.objects.find((drawing) => drawing.id === this.selectedId);
    const selectedHandle = selected && !this.isLocked(selected)
      ? this.anchorAt(selected, px.x, px.y)
      : null;
    if (selectedHandle) {
      const resizeCursor: Record<ResizeHandle, string> = {
        nw: "nwse-resize",
        n: "ns-resize",
        ne: "nesw-resize",
        e: "ew-resize",
        se: "nwse-resize",
        s: "ns-resize",
        sw: "nesw-resize",
        w: "ew-resize",
      };
      this.chartEl.style.cursor = selectedHandle.kind === "resize"
        ? resizeCursor[selectedHandle.handle]
        : "crosshair";
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
    } else if (this.drag.kind === "anchor") {
      const point = this.snap(this.mapper.pixelToPoint(px.x, px.y) ?? this.drag.origin[this.drag.index]!);
      this.snapDot = this.env.magnet !== "off" ? px : null;
      o.setAnchor(this.drag.index, point);
    } else {
      this.resizeObject(o, px);
    }
    this.sceneDirty = true;
    this.overlayDirty = true;
  }

  private resizeObject(o: DrawingObject, px: { x: number; y: number }): void {
    const drag = this.drag;
    const bounds = drag?.originBounds;
    const handle = drag?.resize;
    if (!drag || !bounds || !handle) return;
    let left = bounds.x;
    let right = bounds.x + bounds.w;
    let top = bounds.y;
    let bottom = bounds.y + bounds.h;
    if (handle.includes("w")) left = px.x;
    if (handle.includes("e")) right = px.x;
    if (handle.includes("n")) top = px.y;
    if (handle.includes("s")) bottom = px.y;
    const width = bounds.w;
    const height = bounds.h;
    o.points = drag.origin.map((point) => {
      const oldX = point.time ? this.mapper.timeToX(point.time) : this.mapper.width / 2;
      const oldY = this.mapper.priceToY(point.price);
      if (oldX == null || oldY == null) return point;
      const tx = width === 0 ? 0.5 : (oldX - bounds.x) / width;
      const ty = height === 0 ? 0.5 : (oldY - bounds.y) / height;
      return this.mapper.pixelToPoint(
        left + tx * (right - left),
        top + ty * (bottom - top),
      ) ?? point;
    });
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
      if (this.create.mode === "drag" || this.create.mode === "stream") this.finalizeCreate();
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
      this.onDrawingsChange?.();
    }
  };

  private onDoubleClick = (e: MouseEvent): void => {
    if (this.create?.obj.kind === "path" && this.create.placed >= 3) {
      e.preventDefault();
      e.stopPropagation();
      // A native double-click dispatches two pointer-down events before this
      // handler. The first commits the intended final point; the second and
      // its new floating point are duplicates, so discard those two tails.
      this.create.obj.points.splice(-2, 2);
      this.finalizeCreate();
      return;
    }
    if (this.env.tool || !this.env.selectionEnabled) return;
    const px = this.localPx(e);
    const hit = this.hitObject(px.x, px.y);
    if (hit) {
      this.select(hit.id);
      this.onOpenSettings?.(hit.serialize());
    }
  };

  private onContext = (e: MouseEvent): void => {
    if (this.env.tool || !this.env.selectionEnabled) return;
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
      this.host.dataset.drawingCount = String(this.lastCount);
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
    if (this.allHidden) return;
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
        candles: this.env.candles,
      };
      ctx.save();
      o.render(r);
      // Text/label tools paint their own text; every other tool gets the shared label.
      if (o.kind !== "text" && o.kind !== "label" && o.kind !== "callout" && o.kind !== "anchoredText") o.drawLabel(r);
      ctx.restore();
    }
  }

  private renderOverlay(): void {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.mapper.width, this.mapper.height);
    if (this.allHidden) return;

    // Selection chrome follows the actual object. There is deliberately no
    // generic dotted bounding rectangle: a circle stays visually a circle
    // while drawing and selecting it.
    const sel = this.objects.find((d) => d.id === this.selectedId);
    if (sel && !this.create && !this.hasNoHandles(sel)) {
      ctx.save();
      ctx.setLineDash([]);
      if (!this.usesOnlyAnchorHandles(sel)) {
        for (const a of this.resizeHandles(sel)) {
          ctx.beginPath();
          if (a.handle.length === 1) {
            ctx.rect(a.x - SELECTION_HANDLE, a.y - SELECTION_HANDLE, SELECTION_HANDLE * 2, SELECTION_HANDLE * 2);
          } else {
            ctx.arc(a.x, a.y, SELECTION_HANDLE, 0, Math.PI * 2);
          }
          ctx.fillStyle = this.isLocked(sel) ? "#94a3b8" : HANDLE_FILL;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = this.isLocked(sel) ? "#94a3b8" : SELECTION_BLUE;
          ctx.stroke();
        }
      }
      if (!this.usesOnlyResizeHandles(sel)) {
        for (const a of sel.anchors(this.mapper)) {
          ctx.beginPath();
          ctx.arc(a.x, a.y, SELECTION_HANDLE, 0, Math.PI * 2);
          ctx.fillStyle = this.isLocked(sel) ? "#94a3b8" : HANDLE_FILL;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = this.isLocked(sel) ? "#94a3b8" : SELECTION_BLUE;
          ctx.stroke();
        }
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
