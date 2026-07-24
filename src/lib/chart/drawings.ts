/** Types + helpers for on-chart drawings. Framework-independent. */

export type DrawingTool =
  // line family
  | "trend"
  | "ray"
  | "extended"
  | "arrow"
  | "info"
  | "horizontal"
  | "hray"
  | "vertical"
  // channels
  | "parallel"
  // fibonacci
  | "fib"
  | "fibext"
  // shapes
  | "rectangle"
  | "ellipse"
  | "triangle"
  // trade projection
  | "long"
  | "short"
  // annotation
  | "text"
  | "callout";

export interface DrawingPoint {
  time: number; // seconds (UTCTimestamp) — 0 for pure horizontal lines
  price: number;
}

export interface Drawing {
  id: string;
  tool: DrawingTool;
  points: DrawingPoint[];
  color: string;
  /** Free text for the `text` and `callout` tools. */
  text?: string;
}

/** How many clicks a tool needs before it is complete. */
export const DRAWING_POINTS: Record<DrawingTool, number> = {
  trend: 2,
  ray: 2,
  extended: 2,
  arrow: 2,
  info: 2,
  horizontal: 1,
  hray: 1,
  vertical: 1,
  parallel: 3,
  fib: 2,
  fibext: 3,
  rectangle: 2,
  ellipse: 2,
  triangle: 3,
  long: 3,
  short: 3,
  text: 1,
  callout: 2,
};

export const DRAWING_LABELS: Record<DrawingTool, string> = {
  trend: "Trend line",
  ray: "Ray",
  extended: "Extended line",
  arrow: "Arrow",
  info: "Info line",
  horizontal: "Horizontal line",
  hray: "Horizontal ray",
  vertical: "Vertical line",
  parallel: "Parallel channel",
  fib: "Fibonacci retracement",
  fibext: "Fib extension",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  long: "Long position",
  short: "Short position",
  text: "Text",
  callout: "Callout",
};

/** Standard Fibonacci retracement ratios (0 = first point, 1 = second point). */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/** Fibonacci extension ratios projected from the third point. */
export const FIB_EXT_LEVELS = [0, 0.382, 0.618, 1, 1.618, 2.618] as const;

/** Tools whose completion needs a text prompt. */
export const TEXT_TOOLS: ReadonlySet<DrawingTool> = new Set<DrawingTool>(["text", "callout"]);

let counter = 0;
export function drawingId(): string {
  counter += 1;
  return `dw_${counter.toString(36)}_${Math.floor(performance.now())}`;
}
