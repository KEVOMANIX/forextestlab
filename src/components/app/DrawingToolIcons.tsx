import type { ComponentType, ReactNode, SVGProps } from "react";

import type { ToolKind } from "@/lib/chart/drawing/types";

export type DrawingIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number | string;
};

export type DrawingIcon = ComponentType<DrawingIconProps>;

function Glyph({ size = 18, className, children, style, ...props }: DrawingIconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
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

function Handle({ cx, cy, r = 1.45 }: { cx: number; cy: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} fill="var(--app-panel-solid, #111725)" />;
}

export function TrendLineIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="4" y1="19" x2="20" y2="5" /><Handle cx={4} cy={19} /><Handle cx={20} cy={5} /></Glyph>;
}

export function RayIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="4" y1="18" x2="21" y2="4" /><Handle cx={4} cy={18} /><Handle cx={11} cy={12.25} /></Glyph>;
}

export function ExtendedLineIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="2.5" y1="21" x2="21.5" y2="3" /><Handle cx={8.2} cy={15.6} /><Handle cx={15.8} cy={8.4} /></Glyph>;
}

export function ArrowLineIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="4" y1="19" x2="19" y2="4" /><path d="m13.8 4 5.2 0 0 5.2" /><Handle cx={4} cy={19} /></Glyph>;
}

export function HorizontalLineIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="3" y1="12" x2="21" y2="12" /><Handle cx={8} cy={12} r={1.25} /></Glyph>;
}

export function VerticalLineIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="12" y1="3" x2="12" y2="21" /><Handle cx={12} cy={9} r={1.25} /></Glyph>;
}

export function ParallelChannelIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <line x1="3" y1="17" x2="18" y2="5" />
      <line x1="6" y1="21" x2="21" y2="9" />
      <Handle cx={3} cy={17} /><Handle cx={18} cy={5} /><Handle cx={6} cy={21} />
    </Glyph>
  );
}

export function FibonacciIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <line x1="4" y1="4" x2="20" y2="4" /><line x1="7" y1="8" x2="20" y2="8" />
      <line x1="4" y1="12" x2="20" y2="12" /><line x1="7" y1="16" x2="20" y2="16" />
      <line x1="4" y1="20" x2="20" y2="20" /><Handle cx={4} cy={4} r={1.2} /><Handle cx={4} cy={20} r={1.2} />
    </Glyph>
  );
}

export function RectangleToolIcon(props: DrawingIconProps) {
  return <Glyph {...props}><rect x="4" y="5" width="16" height="14" /><Handle cx={4} cy={5} r={1.2} /><Handle cx={20} cy={19} r={1.2} /></Glyph>;
}

export function SessionBoxIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <rect x="4" y="5" width="16" height="14" /><path d="M4 9h16M8 5v14" strokeDasharray="2 2" />
      <Handle cx={4} cy={5} r={1.2} /><Handle cx={20} cy={19} r={1.2} />
    </Glyph>
  );
}

export function CircleToolIcon(props: DrawingIconProps) {
  return <Glyph {...props}><circle cx="12" cy="12" r="8" /><Handle cx={12} cy={4} r={1.2} /><Handle cx={20} cy={12} r={1.2} /></Glyph>;
}

export function EllipseToolIcon(props: DrawingIconProps) {
  return <Glyph {...props}><ellipse cx="12" cy="12" rx="9" ry="6" /><Handle cx={3} cy={12} r={1.2} /><Handle cx={21} cy={12} r={1.2} /></Glyph>;
}

export function TriangleToolIcon(props: DrawingIconProps) {
  return <Glyph {...props}><path d="M12 4 21 19H3Z" /><Handle cx={12} cy={4} r={1.2} /><Handle cx={3} cy={19} r={1.2} /><Handle cx={21} cy={19} r={1.2} /></Glyph>;
}

export function PathToolIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="M3.5 18.5 8 8l5 7 7.5-10" />
      <Handle cx={3.5} cy={18.5} /><Handle cx={8} cy={8} /><Handle cx={13} cy={15} /><Handle cx={20.5} cy={5} />
    </Glyph>
  );
}

export function TextToolIcon(props: DrawingIconProps) {
  return <Glyph {...props}><path d="M5 5h14M12 5v14M8.5 19h7" /></Glyph>;
}

export function LabelToolIcon(props: DrawingIconProps) {
  return <Glyph {...props}><path d="M4 6.5V17l4 3h11V4H8Z" /><circle cx="8" cy="8" r="1" /></Glyph>;
}

export function LongPositionIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <rect x="5" y="3" width="14" height="7" rx=".75" fill="currentColor" fillOpacity=".08" />
      <line x1="3" y1="13" x2="21" y2="13" />
      <line x1="5" y1="20" x2="19" y2="20" strokeDasharray="2 2" opacity=".65" />
      <line x1="12" y1="17.5" x2="12" y2="6" />
      <path d="m8.5 9.5 3.5-3.5 3.5 3.5" />
      <Handle cx={3} cy={13} r={1.2} /><Handle cx={21} cy={13} r={1.2} />
    </Glyph>
  );
}

export function ShortPositionIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <line x1="5" y1="4" x2="19" y2="4" strokeDasharray="2 2" opacity=".65" />
      <line x1="3" y1="11" x2="21" y2="11" />
      <rect x="5" y="14" width="14" height="7" rx=".75" fill="currentColor" fillOpacity=".08" />
      <line x1="12" y1="6.5" x2="12" y2="18" />
      <path d="m8.5 14.5 3.5 3.5 3.5-3.5" />
      <Handle cx={3} cy={11} r={1.2} /><Handle cx={21} cy={11} r={1.2} />
    </Glyph>
  );
}

export function MeasureToolIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <path d="m4 16 12-12 4 4L8 20Z" />
      <path d="m8 14 2 2m1-5 2 2m1-5 2 2" />
      <Handle cx={4} cy={16} r={1.15} /><Handle cx={20} cy={8} r={1.15} />
    </Glyph>
  );
}

export function HorizontalRayIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="4" y1="12" x2="22" y2="12" /><Handle cx={4} cy={12} /><path d="m19 9 3 3-3 3" /></Glyph>;
}

export function CrossLineIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="3" y1="12" x2="21" y2="12" /><line x1="12" y1="3" x2="12" y2="21" /><Handle cx={12} cy={12} /></Glyph>;
}

export function InfoLineIcon(props: DrawingIconProps) {
  return <Glyph {...props}><line x1="4" y1="19" x2="20" y2="5" /><Handle cx={4} cy={19} /><Handle cx={20} cy={5} /><circle cx="8" cy="7" r="3" /><path d="M8 6.5v2M8 5h.01" /></Glyph>;
}

export function TrendAngleIcon(props: DrawingIconProps) {
  return <Glyph {...props}><path d="M4 19h17M4 19 19 6M10 19a6 6 0 0 0-1.5-4" /><Handle cx={4} cy={19} /><Handle cx={19} cy={6} /></Glyph>;
}

export function RegressionIcon(props: DrawingIconProps) {
  return <Glyph {...props}><path d="m3 16 16-10M5 20 21 10M3 11 16 3" opacity=".7" /><line x1="4" y1="16" x2="20" y2="6" /><Handle cx={4} cy={16} /><Handle cx={20} cy={6} /></Glyph>;
}

export function RangeIcon(props: DrawingIconProps) {
  return <Glyph {...props}><path d="M7 4v16M4 4h6M4 20h6M14 7h7M14 17h7M17 7v10" /><path d="m15 9 2-2 2 2m-4 6 2 2 2-2" /></Glyph>;
}

export function FibExtensionIcon(props: DrawingIconProps) {
  return <Glyph {...props}><path d="m3 18 6-10 5 6" /><line x1="14" y1="6" x2="21" y2="6" /><line x1="14" y1="10" x2="21" y2="10" /><line x1="14" y1="14" x2="21" y2="14" /><line x1="14" y1="18" x2="21" y2="18" /><Handle cx={3} cy={18} /><Handle cx={9} cy={8} /><Handle cx={14} cy={14} /></Glyph>;
}

export function CalloutIcon(props: DrawingIconProps) {
  return <Glyph {...props}><path d="M5 5h15v11H10l-5 4Z" /><line x1="9" y1="9" x2="16" y2="9" /><line x1="9" y1="12" x2="14" y2="12" /></Glyph>;
}

export function AnchoredTextIcon(props: DrawingIconProps) {
  return <Glyph {...props}><path d="M4 5h12M10 5v12M7 17h6" /><path d="M18 9v8m-3 0h6m-3 0-2 3m2-3 2 3" opacity=".8" /><Handle cx={18} cy={9} r={1.2} /></Glyph>;
}

export function LinesGroupIcon(props: DrawingIconProps) {
  return (
    <Glyph {...props}>
      <line x1="4" y1="18" x2="18" y2="4" /><Handle cx={4} cy={18} /><Handle cx={18} cy={4} />
      <line x1="5" y1="21" x2="21" y2="21" opacity=".55" />
    </Glyph>
  );
}

export function ShapesGroupIcon(props: DrawingIconProps) {
  return <Glyph {...props}><rect x="3" y="4" width="10" height="10" /><circle cx="15.5" cy="15.5" r="5.5" /><Handle cx={3} cy={4} r={1.15} /></Glyph>;
}

export function NotesGroupIcon(props: DrawingIconProps) {
  return <Glyph {...props}><path d="M5 5h10M10 5v14M7 19h6" /><path d="M16 11h4v8h-5v-7Z" opacity=".65" /></Glyph>;
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
  flatChannel: ParallelChannelIcon,
  disjointChannel: ParallelChannelIcon,
  fibExtension: FibExtensionIcon,
  priceRange: RangeIcon,
  dateRange: RangeIcon,
  datePriceRange: RangeIcon,
  callout: CalloutIcon,
  priceLabel: LabelToolIcon,
  anchoredText: AnchoredTextIcon,
} satisfies Record<ToolKind, DrawingIcon>;
