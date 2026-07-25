/**
 * Core types for the canvas drawing engine.
 *
 * Every drawing is stored purely in chart coordinates ({@link Point}: time in
 * seconds + price). Screen pixels are derived at render time via the
 * CoordinateMapper, so objects stay anchored to candles through pan / zoom /
 * resize / timeframe changes.
 */

export type ToolKind =
  | "trend"
  | "horizontal"
  | "vertical"
  | "ray"
  | "extended"
  | "arrow"
  | "rectangle"
  | "session"
  | "circle"
  | "ellipse"
  | "triangle"
  | "path"
  | "text"
  | "label"
  | "fib"
  | "channel"
  | "long"
  | "short"
  | "measure";

/** A drawing anchor in chart space. `time` is UTC seconds; 0 means "no time" (e.g. pure horizontal line). */
export interface Point {
  time: number;
  price: number;
}

export type LineStyleName = "solid" | "dashed" | "dotted";

export type MagnetMode = "off" | "weak" | "strong";

export interface DrawingStyle {
  color: string;
  opacity: number; // 0..1 — stroke alpha
  lineWidth: number;
  lineStyle: LineStyleName;
  fill: boolean;
  fillColor: string;
  fillOpacity: number; // 0..1
  showLabels: boolean;
  extendLeft: boolean;
  extendRight: boolean;
  background: boolean; // text/label background chip
  fontSize: number;
  text: string;
  // Text (available on every tool):
  bold?: boolean;
  italic?: boolean;
  textColor?: string;
  textAlign?: "left" | "center" | "right";
  textPlacement?: "inside" | "outside";
  // Position tools (long/short) only:
  accountSize?: number; // account currency size
  risk?: number; // risk per trade, interpreted by riskMode
  riskMode?: "percent" | "money";
  leverage?: number; // caps position size
  lotSize?: number; // contract/lot size
  // Fibonacci only:
  reverse?: boolean; // reflect levels vertically
}

/** Serializable form of any drawing — the single source of truth persisted / cloned / undone. */
export interface DrawingJSON {
  id: string;
  kind: ToolKind;
  points: Point[];
  style: DrawingStyle;
  locked: boolean;
  hidden: boolean;
  zIndex: number;
  /** null = visible on every timeframe; otherwise an allow-list of timeframe ids. */
  visibleTimeframes: string[] | null;
}

export const SELECTION_BLUE = "#3b82f6";
export const HANDLE_FILL = "#0b0f1a";

export function defaultStyle(kind: ToolKind): DrawingStyle {
  const base: DrawingStyle = {
    color: "#5b8bff",
    opacity: 1,
    lineWidth: 1, // low-end default; the user's last-used style is remembered per tool
    lineStyle: kind === "horizontal" || kind === "vertical" ? "dashed" : "solid",
    fill: kind === "rectangle" || kind === "session" || kind === "circle" || kind === "ellipse" || kind === "triangle" || kind === "fib",
    fillColor: "#5b8bff",
    fillOpacity: 0.12,
    showLabels: true,
    extendLeft: false,
    extendRight: kind === "ray" || kind === "extended",
    background: kind === "label",
    fontSize: 13,
    text: "",
    bold: false,
    italic: false,
    textColor: "#e5e7eb",
    textAlign: "center",
    textPlacement: "inside",
  };
  if (kind === "session") base.fillColor = "#fbbf24";
  if (kind === "long" || kind === "short") {
    base.accountSize = 10000;
    base.risk = 1;
    base.riskMode = "percent";
    base.leverage = 1;
    base.lotSize = 1;
  }
  return base;
}

/** Clicks required to finalise a tool. `path` is variable (finish via double-click / Enter / Escape). */
export const TOOL_POINTS: Record<ToolKind, number> = {
  trend: 2,
  horizontal: 1,
  vertical: 1,
  ray: 2,
  extended: 2,
  arrow: 2,
  rectangle: 2,
  session: 2,
  circle: 2,
  ellipse: 2,
  triangle: 3,
  path: Infinity,
  text: 1,
  label: 1,
  fib: 2,
  channel: 3,
  long: 3,
  short: 3,
  measure: 2,
};

export const TOOL_LABELS: Record<ToolKind, string> = {
  trend: "Trend line",
  horizontal: "Horizontal line",
  vertical: "Vertical line",
  ray: "Ray",
  extended: "Extended line",
  arrow: "Arrow",
  rectangle: "Rectangle",
  session: "Session box",
  circle: "Circle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  path: "Path",
  text: "Text",
  label: "Label",
  fib: "Fib retracement",
  channel: "Parallel channel",
  long: "Long position",
  short: "Short position",
  measure: "Measure",
};

export const TOOLS_NEEDING_TEXT: ReadonlySet<ToolKind> = new Set<ToolKind>(["text", "label"]);

/** TradingView's default visible Fibonacci retracement ratios (incl. extensions). */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236] as const;

export const DRAW_PALETTE = ["#5b8bff", "#22c3a0", "#f4646c", "#fbbf24", "#c084fc", "#e5e7eb", "#f97316", "#38bdf8"] as const;

export function dashPattern(style: LineStyleName, width: number): number[] {
  if (style === "dashed") return [Math.max(4, width * 3), Math.max(3, width * 2)];
  if (style === "dotted") return [width, Math.max(3, width * 2)];
  return [];
}

/** Convert a hex colour + alpha (0..1) to an rgba() string. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

let counter = 0;
export function nextId(): string {
  counter += 1;
  return `dw_${counter.toString(36)}_${Math.floor(performance.now())}`;
}
