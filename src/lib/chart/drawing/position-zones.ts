/**
 * The long/short position tool's profit and loss zones, drawn *beneath* the
 * candles.
 *
 * Every other drawing lives on the engine's own canvases, which are stacked
 * over the chart — fine for a line or a box outline, wrong for a fill that
 * covers half the pane. Painted on top, even a 14% wash tints every candle
 * inside the position, and the fill cannot be made any stronger without
 * smothering the price it exists to frame. TradingView puts these zones behind
 * the bars, which is why theirs can be genuinely saturated and the candles
 * inside them stay exactly as vivid as the ones outside.
 *
 * Lightweight Charts' pane primitives are the sanctioned way down there: a pane
 * view reporting `zOrder: "bottom"` draws below everything except the
 * background. So the zones become a primitive and the rest of the tool — entry
 * divider, stop/target lines, chips, handles — stays on the engine's canvases
 * above the price, where it belongs.
 */

import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  Time,
} from "lightweight-charts";

/** One position's geometry, already projected to chart pane pixels. */
export interface PositionZone {
  left: number;
  right: number;
  /** Entry, stop and target as y coordinates. */
  yEntry: number;
  yStop: number;
  yTarget: number;
  profitColor: string;
  lossColor: string;
  profitAlpha: number;
  lossAlpha: number;
}

type ZoneSource = () => PositionZone[];

/**
 * Media coordinate space, not bitmap: the engine's mapper already returns CSS
 * pixels from the chart's own `timeToCoordinate` / `priceToCoordinate`, so the
 * two agree without any device-pixel-ratio conversion here.
 */
class ZoneRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly zones: PositionZone[]) {}

  draw(target: {
    useMediaCoordinateSpace: (fn: (scope: { context: CanvasRenderingContext2D }) => void) => void;
  }): void {
    if (this.zones.length === 0) return;
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const zone of this.zones) {
        const width = Math.max(zone.right - zone.left, 8);
        ctx.save();
        ctx.globalAlpha = zone.profitAlpha;
        ctx.fillStyle = zone.profitColor;
        ctx.fillRect(
          zone.left,
          Math.min(zone.yEntry, zone.yTarget),
          width,
          Math.abs(zone.yTarget - zone.yEntry),
        );
        ctx.globalAlpha = zone.lossAlpha;
        ctx.fillStyle = zone.lossColor;
        ctx.fillRect(
          zone.left,
          Math.min(zone.yEntry, zone.yStop),
          width,
          Math.abs(zone.yStop - zone.yEntry),
        );
        ctx.restore();
      }
    });
  }
}

class ZonePaneView implements IPrimitivePaneView {
  constructor(private readonly source: ZoneSource) {}

  /** Below everything except the chart background — the whole point of this file. */
  zOrder(): PrimitivePaneViewZOrder {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    const zones = this.source();
    return zones.length ? new ZoneRenderer(zones) : null;
  }
}

/**
 * Reads its geometry from the engine on every frame rather than holding state.
 * The zones move with the viewport — pan, zoom, a timeframe switch — and the
 * engine's mapper is the one thing that already resolves a position's anchors
 * through all of that, including times no bar occupies.
 */
export class PositionZonesPrimitive implements ISeriesPrimitive<Time> {
  private readonly views: IPrimitivePaneView[];

  constructor(source: ZoneSource) {
    this.views = [new ZonePaneView(source)];
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }
}
