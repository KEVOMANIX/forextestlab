"use client";

import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import { Settings2, Trash2 } from "lucide-react";

import { getDef, type IndicatorInstance } from "@/lib/chart/indicator-defs";
import type { OHLCV } from "@/lib/chart/indicators";

interface Props {
  instance: IndicatorInstance;
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType> | null;
  candles: OHLCV[];
  theme: "dark" | "light";
  /** Bumped by the parent on pan / zoom / resize to force a redraw. */
  viewVersion: number;
  onEdit: () => void;
  onRemove: () => void;
}

function withOpacity(color: string, opacity: number): string {
  if (opacity >= 1) return color;
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const int = parseInt(m[1]!, 16);
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${Math.max(0, Math.min(1, opacity))})`;
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function VolumeProfileOverlay({ instance, chart, series, candles, theme, viewVersion, onEdit, onRemove }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart || !series || candles.length === 0 || !instance.visible) {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      return;
    }

    const draw = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const W = parent.clientWidth;
      const H = parent.clientHeight;
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const priceScaleWidth = chart.priceScale("right").width();
      const paneW = Math.max(0, W - priceScaleWidth);

      // Visible bar range → candle indices.
      const range = chart.timeScale().getVisibleLogicalRange();
      if (!range) return;
      const from = Math.max(0, Math.ceil(range.from));
      const to = Math.min(candles.length - 1, Math.floor(range.to));
      if (to <= from) return;

      let minP = Infinity;
      let maxP = -Infinity;
      for (let i = from; i <= to; i++) {
        if (candles[i]!.low < minP) minP = candles[i]!.low;
        if (candles[i]!.high > maxP) maxP = candles[i]!.high;
      }
      if (!Number.isFinite(minP) || maxP <= minP) return;

      const rows = Math.round(num(instance.inputs.rows, 24));
      const binSize = (maxP - minP) / rows;
      const bins = new Array(rows).fill(0);
      for (let i = from; i <= to; i++) {
        const c = candles[i]!;
        const v = c.volume && c.volume > 0 ? c.volume : 1;
        const loBin = Math.max(0, Math.floor((c.low - minP) / binSize));
        const hiBin = Math.min(rows - 1, Math.floor((c.high - minP) / binSize));
        const span = hiBin - loBin + 1;
        for (let b = loBin; b <= hiBin; b++) bins[b] += v / span;
      }

      let maxBin = 0;
      let pocBin = 0;
      let total = 0;
      bins.forEach((val, b) => {
        total += val;
        if (val > maxBin) {
          maxBin = val;
          pocBin = b;
        }
      });
      if (maxBin <= 0) return;

      // Value area: grow out from the POC until we cover vaPercent of volume.
      const vaTarget = (num(instance.inputs.vaPercent, 70) / 100) * total;
      let lo = pocBin;
      let hi = pocBin;
      let acc = bins[pocBin];
      while (acc < vaTarget && (lo > 0 || hi < rows - 1)) {
        const below = lo > 0 ? bins[lo - 1] : -1;
        const above = hi < rows - 1 ? bins[hi + 1] : -1;
        if (above >= below) acc += bins[++hi];
        else acc += bins[--lo];
      }

      const side = String(instance.inputs.side ?? "right");
      const widthPct = num(instance.inputs.widthPct, 30) / 100;
      const maxLen = paneW * widthPct;
      const st = instance.style;
      const vaColor = withOpacity(st.va?.color ?? "#5b8bff", st.va?.opacity ?? 0.55);
      const outColor = withOpacity(st.outside?.color ?? "#5b6b8a", st.outside?.opacity ?? 0.35);

      const yOf = (price: number) => series.priceToCoordinate(price);

      for (let b = 0; b < rows; b++) {
        const yTop = yOf(minP + (b + 1) * binSize);
        const yBot = yOf(minP + b * binSize);
        if (yTop == null || yBot == null) continue;
        const h = Math.max(1, Math.abs(yBot - yTop) - 1);
        const len = (bins[b] / maxBin) * maxLen;
        ctx.fillStyle = b >= lo && b <= hi ? vaColor : outColor;
        const x = side === "left" ? 0 : paneW - len;
        ctx.fillRect(x, Math.min(yTop, yBot), len, h);
      }

      // POC + value-area boundary lines.
      if (instance.inputs.showPoc !== false) {
        const y = yOf(minP + (pocBin + 0.5) * binSize);
        if (y != null) {
          ctx.strokeStyle = st.poc?.color ?? "#fbbf24";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(paneW, y);
          ctx.stroke();
        }
      }
      if (instance.inputs.showVa !== false) {
        ctx.strokeStyle = withOpacity(st.va?.color ?? "#5b8bff", 0.9);
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        for (const bound of [minP + (hi + 1) * binSize, minP + lo * binSize]) {
          const y = yOf(bound);
          if (y == null) continue;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(paneW, y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    };

    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [instance, chart, series, candles, theme, viewVersion]);

  const def = getDef(instance.kind);
  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[5]" aria-hidden />
      <div className="group absolute right-20 top-2 z-10 flex items-center gap-1.5 rounded-md border app-border bg-[var(--app-panel)]/85 px-2 py-0.5 text-[10px] shadow backdrop-blur">
        <span className={instance.visible ? "font-medium" : "app-muted line-through"}>{def?.short(instance.inputs) ?? "Volume Profile"}</span>
        <button type="button" aria-label="Settings" onClick={onEdit} className="app-muted opacity-0 transition-opacity hover:text-[var(--app-text)] group-hover:opacity-100">
          <Settings2 size={12} />
        </button>
        <button type="button" aria-label="Remove" onClick={onRemove} className="app-muted opacity-0 transition-opacity hover:text-bear group-hover:opacity-100">
          <Trash2 size={12} />
        </button>
      </div>
    </>
  );
}
