/** Types + helpers for on-chart drawings. Framework-independent. */

export type DrawingTool = "trend" | "horizontal" | "vertical" | "rectangle" | "fib";

export interface DrawingPoint {
  time: number; // seconds (UTCTimestamp) — 0 for pure horizontal lines
  price: number;
}

export interface Drawing {
  id: string;
  tool: DrawingTool;
  points: DrawingPoint[];
  color: string;
}

/** How many clicks a tool needs before it is complete. */
export const DRAWING_POINTS: Record<DrawingTool, number> = {
  trend: 2,
  horizontal: 1,
  vertical: 1,
  rectangle: 2,
  fib: 2,
};

export const DRAWING_LABELS: Record<DrawingTool, string> = {
  trend: "Trend line",
  horizontal: "Horizontal line",
  vertical: "Vertical line",
  rectangle: "Rectangle",
  fib: "Fibonacci retracement",
};

/** Standard Fibonacci retracement ratios (0 = first point, 1 = second point). */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

let counter = 0;
export function drawingId(): string {
  counter += 1;
  return `dw_${counter.toString(36)}_${Math.floor(performance.now())}`;
}
