import type { ComponentType, ReactNode, SVGProps } from "react";

import type { ToolKind } from "@/lib/chart/drawing/types";

/**
 * Drawing tool glyphs.
 *
 * One visual language, so forty tools in a rail read as a set:
 *  - a 24-unit box drawn with hairline strokes and round caps
 *  - a hollow {@link Ring} wherever the tool takes a placed point, which is what
 *    separates a drawing from an abstract shape
 *  - one motif per tool and no second accent competing with it
 *
 * Colour appears exactly once, on the long and short position tools. Those two
 * are the only ones that express a trade rather than a mark on the chart, and the
 * terminal already speaks bull/bear everywhere that money is involved.
 */

export type DrawingIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number | string;
};

export type DrawingIcon = ComponentType<DrawingIconProps>;

/** Bull and bear, matching tailwind.config.ts. */
const BULL = "#22c3a0";
const BEAR = "#f4646c";

function Glyph({
  size = 18,
  className,
  children,
  style,
  strokeWidth = 1.4,
  ...props
}: DrawingIconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ color: "var(--chart-text, #ffffff)", ...style }}
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/**
 * A placed point. Hollow rather than solid: a filled dot at 14px merges with the
 * line it sits on, while a ring keeps the line visibly passing through it.
 */
function Ring({ cx, cy, r = 1.9 }: { cx: number; cy: number; r?: number }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill="var(--app-panel-solid, #111725)"
      strokeWidth={1.2}
    />
  );
}

// ---- lines ----

export function TrendLineIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="5" y1="18.5" x2="19" y2="5.5" /><Ring cx={5} cy={18.5} /><Ring cx={19} cy={5.5} /></Glyph>;
}

/** One placed point, running past the second to the pane edge. */
export function RayIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="5" y1="18.5" x2="22" y2="2.8" /><Ring cx={5} cy={18.5} /><Ring cx={13.5} cy={10.7} /></Glyph>;
}

/** Both ends leave the box; the two rings stay inside it. */
export function ExtendedLineIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="2" y1="21.5" x2="22" y2="2.5" /><Ring cx={8.5} cy={15.3} /><Ring cx={15.5} cy={8.7} /></Glyph>;
}

export function ArrowLineIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="4.5" y1="19" x2="17.5" y2="6.5" /><path d="M12.6 5.6h5.9v5.7" /><Ring cx={4.5} cy={19} /></Glyph>;
}

/**
 * A trend line that reports. The readout rules beside it are the differentiator:
 * the "i" bubble this replaced turned to mush below 18px.
 */
export function InfoLineIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <line x1="4.5" y1="19.5" x2="17" y2="8" />
      <path d="M13.5 4.5h7M13.5 7.5h4.5" strokeWidth={1.2} opacity=".85" />
      <Ring cx={4.5} cy={19.5} /><Ring cx={17} cy={8} />
    </Glyph>
  );
}

export function TrendAngleIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="M5 19h15" /><path d="M5 19 18 6.5" />
      <path d="M12.5 19a7.5 7.5 0 0 0-2.2-5.3" strokeWidth={1.1} opacity=".75" />
      <Ring cx={5} cy={19} /><Ring cx={18} cy={6.5} />
    </Glyph>
  );
}

/** Full width, one ring: a level, not a segment. */
export function HorizontalLineIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="2.5" y1="12" x2="21.5" y2="12" /><Ring cx={8} cy={12} /></Glyph>;
}

export function HorizontalRayIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="6" y1="12" x2="22" y2="12" /><Ring cx={6} cy={12} /></Glyph>;
}

export function VerticalLineIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="12" y1="2.5" x2="12" y2="21.5" /><Ring cx={12} cy={12} /></Glyph>;
}

export function CrossLineIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="2.5" y1="12" x2="21.5" y2="12" /><line x1="12" y1="2.5" x2="12" y2="21.5" /><Ring cx={12} cy={12} /></Glyph>;
}

// ---- channels ----

export function ParallelChannelIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <line x1="3.5" y1="16" x2="17" y2="4.5" /><line x1="7" y1="20.5" x2="20.5" y2="9" />
      <Ring cx={3.5} cy={16} /><Ring cx={17} cy={4.5} /><Ring cx={7} cy={20.5} />
    </Glyph>
  );
}

export function RegressionIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <line x1="4" y1="16" x2="20" y2="7" />
      <path d="M4 20.5 20 11.5M4 11.5 20 2.5" strokeWidth={1.1} opacity=".55" />
      <Ring cx={4} cy={16} /><Ring cx={20} cy={7} />
    </Glyph>
  );
}

/** Two level rails — the point of the tool, and what tells it from a channel. */
export function FlatChannelIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="17" x2="20" y2="17" />
      <Ring cx={4} cy={7} /><Ring cx={20} cy={7} /><Ring cx={4} cy={17} />
    </Glyph>
  );
}

/** Two rails placed independently, so they deliberately do not align. */
export function DisjointChannelIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <line x1="3.5" y1="14.5" x2="14" y2="6" /><line x1="9" y1="21" x2="20.5" y2="14" />
      <Ring cx={3.5} cy={14.5} /><Ring cx={14} cy={6} /><Ring cx={9} cy={21} /><Ring cx={20.5} cy={14} />
    </Glyph>
  );
}

// ---- fibonacci ----

export function FibonacciIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 5h16M4 9.4h16M4 13.8h16M4 18.2h16" strokeWidth={1.3} />
      <path d="M4 18.2 20 5" strokeWidth={1} opacity=".5" />
      <Ring cx={4} cy={18.2} /><Ring cx={20} cy={5} />
    </Glyph>
  );
}

export function FibExtensionIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="M3 19.5 8 8l4.5 6" strokeWidth={1.3} />
      <path d="M13.5 6.5h8M13.5 11h8M13.5 15.5h8M13.5 20h8" strokeWidth={1.1} opacity=".8" />
      <Ring cx={3} cy={19.5} /><Ring cx={8} cy={8} />
    </Glyph>
  );
}

// ---- positions ----

/**
 * One box split by the entry, the reward zone taking about three quarters of it,
 * and an arrow crossing that zone from the entry to the target. The tint tells
 * reward from risk at a glance; the arrow makes the direction unmistakable at
 * 14px, where the two zones alone are a pair of slivers.
 */
function Position({
  side,
  tinted = true,
  ...props
}: DrawingIconProps & { side: "long" | "short"; tinted?: boolean }) {
  const up = side === "long";
  const entry = up ? 15.2 : 8.8;
  const reward = up ? { y: 3.5, height: 11.7 } : { y: 8.8, height: 11.7 };
  const risk = up ? { y: 15.2, height: 5.3 } : { y: 3.5, height: 5.3 };
  return (
    <Glyph {...props}>
      <rect
        x="4" y={reward.y} width="16" height={reward.height}
        fill={tinted ? BULL : "currentColor"} fillOpacity={tinted ? ".28" : ".22"} stroke="none"
      />
      <rect
        x="4" y={risk.y} width="16" height={risk.height}
        fill={tinted ? BEAR : "currentColor"} fillOpacity={tinted ? ".28" : ".08"} stroke="none"
      />
      <rect x="4" y="3.5" width="16" height="17" strokeWidth={1.2} />
      <path d={`M4 ${entry}h16`} strokeWidth={1.5} />
      <path d={up ? "M12 15.2V4.7" : "M12 8.8V19.3"} strokeWidth={1.5} />
      <path d={up ? "m9.4 7.1 2.6-2.4 2.6 2.4" : "m9.4 16.9 2.6 2.4 2.6-2.4"} strokeWidth={1.5} />
    </Glyph>
  );
}

export function LongPositionIcon(props: DrawingIconProps) {
  return <Position side="long" {...props} />;
}

export function ShortPositionIcon(props: DrawingIconProps) {
  return <Position side="short" {...props} />;
}

/**
 * The same drawing without the tint, for the rail's group button.
 *
 * Colour earns its place on the tool itself, where it says which half is reward.
 * On the group button it would be the one coloured thing in a column of fifteen
 * monochrome ones, which reads as a warning rather than as a category.
 */
export function PositionsGroupIcon(props: DrawingIconProps) {
  return <Position side="long" tinted={false} {...props} />;
}

export function MeasureToolIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="m4.5 15.5 11-11 4 4-11 11z" strokeWidth={1.3} />
      <path d="m7.8 13.4 1.8 1.8m1.2-4.4 1.8 1.8m1.2-4.4 1.8 1.8" strokeWidth={1.2} />
    </Glyph>
  );
}

// ---- ranges ----

/** Vertical span with caps. Previously shared one glyph with the other two. */
export function PriceRangeIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 5.5v13" />
      <path d="m9 8.5 3-3 3 3m-6 7 3 3 3-3" strokeWidth={1.2} />
      <path d="M6 5.5h12M6 18.5h12" strokeWidth={1.1} opacity=".6" />
    </Glyph>
  );
}

export function DateRangeIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="M5.5 12h13" />
      <path d="m8.5 9-3 3 3 3m7-6 3 3-3 3" strokeWidth={1.2} />
      <path d="M5.5 6v12M18.5 6v12" strokeWidth={1.1} opacity=".6" />
    </Glyph>
  );
}

export function DatePriceRangeIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <rect x="5" y="6" width="14" height="12" strokeWidth={1.2} />
      <path d="M12 8.5v7M8.5 12h7" strokeWidth={1.1} opacity=".7" />
      <Ring cx={5} cy={18} r={1.7} /><Ring cx={19} cy={6} r={1.7} />
    </Glyph>
  );
}

// ---- shapes ----

export function RectangleToolIcon(props: DrawingIconProps) {
  return <Glyph {...props}><rect x="4.5" y="6" width="15" height="12" /><Ring cx={4.5} cy={6} r={1.7} /><Ring cx={19.5} cy={18} r={1.7} /></Glyph>;
}

/** A time window: the band runs the full height between two edges. */
export function SessionBoxIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <rect x="7" y="3" width="10" height="18" fill="currentColor" fillOpacity=".18" stroke="none" />
      <path d="M7 3v18M17 3v18" strokeWidth={1.4} />
      <path d="M3 12h4M17 12h4" strokeWidth={1.1} opacity=".55" />
    </Glyph>
  );
}

export function CircleToolIcon(props: DrawingIconProps) {
  return <Glyph {...props}><circle cx="12" cy="12" r="8" /><Ring cx={12} cy={4} r={1.7} /><Ring cx={20} cy={12} r={1.7} /></Glyph>;
}

export function EllipseToolIcon(props: DrawingIconProps) {
  return <Glyph {...props}><ellipse cx="12" cy="12" rx="9" ry="6" /><Ring cx={3} cy={12} r={1.7} /><Ring cx={21} cy={12} r={1.7} /></Glyph>;
}

export function TriangleToolIcon(props: DrawingIconProps) {
  return <Glyph {...props}><path d="M12 4 21 19H3Z" /><Ring cx={12} cy={4} r={1.6} /><Ring cx={3} cy={19} r={1.6} /><Ring cx={21} cy={19} r={1.6} /></Glyph>;
}

export function PathToolIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="M3.5 18.5 8 8l5 7 7.5-10" />
      <Ring cx={3.5} cy={18.5} r={1.7} /><Ring cx={8} cy={8} r={1.7} /><Ring cx={13} cy={15} r={1.7} /><Ring cx={20.5} cy={5} r={1.7} />
    </Glyph>
  );
}

// ---- brushes ----

export function BrushToolIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="M4.5 19.5c1-3.5 2-6.5 4.5-9s5.5-3.5 7-2-.5 4.5-3 7-6 4.5-8.5 4Z" strokeWidth={1.3} />
      <Ring cx={4.5} cy={19.5} r={1.6} />
    </Glyph>
  );
}

/** A thick, translucent stroke under a thin outline — a marker's wide flat tip. */
export function HighlighterToolIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="M6 18 16 8" strokeWidth={5} opacity=".3" />
      <path d="M6 18 16 8" strokeWidth={1.3} />
      <Ring cx={6} cy={18} r={1.6} /><Ring cx={16} cy={8} r={1.6} />
    </Glyph>
  );
}

// ---- text ----

export function TextToolIcon(props: DrawingIconProps) {
  return <Glyph {...props}><path d="M5 5h14M12 5v14M8.5 19h7" /></Glyph>;
}

export function LabelToolIcon(props: DrawingIconProps) {
  return <Glyph {...props}><path d="M4 6.5V17l4 3h11V4H8Z" /><circle cx="8" cy="8" r="1" /></Glyph>;
}

/** A tag whose point marks the price it reads. */
export function PriceLabelIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="M3 12 8 7h11.5v10H8z" strokeWidth={1.3} />
      <path d="M10.5 12h6.5" strokeWidth={1.2} opacity=".75" />
    </Glyph>
  );
}

export function CalloutIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="M8.5 4.5h11v9h-11l-2.5 2.5v-2.5z" strokeWidth={1.3} />
      <path d="M11 8h6M11 10.5h4" strokeWidth={1.1} opacity=".7" />
      <path d="M8 16.5 5 20.5" strokeWidth={1.1} />
      <Ring cx={5} cy={20.5} r={1.7} />
    </Glyph>
  );
}

export function AnchoredTextIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 5h12M10 5v12M7 17h6" />
      <path d="M18 9v8m-3 0h6m-3 0-2 3m2-3 2 3" opacity=".8" />
      <Ring cx={18} cy={9} r={1.7} />
    </Glyph>
  );
}

// ---- rail group icons ----

export function LinesGroupIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <line x1="4" y1="18" x2="18" y2="4" /><Ring cx={4} cy={18} /><Ring cx={18} cy={4} />
      <line x1="5" y1="21" x2="21" y2="21" opacity=".55" />
    </Glyph>
  );
}

export function ShapesGroupIcon(props: DrawingIconProps) {
  return <Glyph {...props}><rect x="3" y="4" width="10" height="10" /><circle cx="15.5" cy="15.5" r="5.5" /><Ring cx={3} cy={4} r={1.6} /></Glyph>;
}

export function NotesGroupIcon(props: DrawingIconProps) {
  return <Glyph {...props}><path d="M5 5h10M10 5v14M7 19h6" /><path d="M16 11h4v8h-5v-7Z" opacity=".65" /></Glyph>;
}

export function BrushesGroupIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="M4.5 19.5c1-3 2-5.5 4-7.5s4.5-3 6-1.5-.5 3.5-2.5 5.5-4.5 3-6.5 3.5Z" strokeWidth={1.3} />
      <Ring cx={4.5} cy={19.5} r={1.6} />
    </Glyph>
  );
}

export const DRAWING_TOOL_ICONS = {
  trend: TrendLineIcon,
  ray: RayIcon,
  extended: ExtendedLineIcon,
  arrow: ArrowLineIcon,
  horizontal: HorizontalLineIcon,
  vertical: VerticalLineIcon,
  channel: ParallelChannelIcon,
  fib: FibonacciIcon,
  rectangle: RectangleToolIcon,
  session: SessionBoxIcon,
  circle: CircleToolIcon,
  ellipse: EllipseToolIcon,
  triangle: TriangleToolIcon,
  path: PathToolIcon,
  long: LongPositionIcon,
  short: ShortPositionIcon,
  measure: MeasureToolIcon,
  text: TextToolIcon,
  label: LabelToolIcon,
  horizontalRay: HorizontalRayIcon,
  crossline: CrossLineIcon,
  infoLine: InfoLineIcon,
  trendAngle: TrendAngleIcon,
  regression: RegressionIcon,
  flatChannel: FlatChannelIcon,
  disjointChannel: DisjointChannelIcon,
  fibExtension: FibExtensionIcon,
  priceRange: PriceRangeIcon,
  dateRange: DateRangeIcon,
  datePriceRange: DatePriceRangeIcon,
  callout: CalloutIcon,
  priceLabel: PriceLabelIcon,
  anchoredText: AnchoredTextIcon,
  brush: BrushToolIcon,
  highlighter: HighlighterToolIcon,
} satisfies Record<ToolKind, DrawingIcon>;
