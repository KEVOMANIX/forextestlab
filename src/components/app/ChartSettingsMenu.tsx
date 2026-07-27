"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, RotateCcw } from "lucide-react";

/**
 * Right-click settings for a single chart, opened from empty chart space.
 *
 * Everything here is per chart rather than per session: in a multi-chart layout
 * one cell can be a plain candle view while another shows trade history, and
 * each keeps its own colours.
 */

export interface ChartSettings {
  upColor: string;
  downColor: string;
  grid: boolean;
  magnet: boolean;
  /** Entry/exit arrows for trades the session has already closed. */
  tradeHistory: boolean;
  /** Entry, stop and target lines for positions that are still open. */
  positionLines: boolean;
  drawings: boolean;
  /** Dotted line and axis tag tracking the latest price. */
  priceLine: boolean;
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  upColor: "#22c3a0",
  downColor: "#f4646c",
  grid: true,
  magnet: false,
  tradeHistory: true,
  positionLines: true,
  drawings: true,
  priceLine: true,
};

/** Palettes people actually use for candles, plus the app default first. */
const UP_SWATCHES = ["#22c3a0", "#26a69a", "#3fb950", "#2962ff", "#d1d4dc"];
const DOWN_SWATCHES = ["#f4646c", "#ef5350", "#f85149", "#ff9800", "#787b86"];

const PANEL_WIDTH = 232;
/** Rough panel height, used to keep the menu on screen near the bottom edge. */
const PANEL_HEIGHT = 360;

export function ChartSettingsMenu({
  position,
  settings,
  theme,
  onChange,
  onReset,
  onClose,
}: {
  position: { x: number; y: number };
  settings: ChartSettings;
  theme: "dark" | "light";
  onChange: (patch: Partial<ChartSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const closeOnPointer = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Keep the panel inside the viewport when opened near an edge.
  const left = Math.min(position.x, Math.max(8, window.innerWidth - PANEL_WIDTH - 8));
  const top = Math.min(position.y, Math.max(8, window.innerHeight - PANEL_HEIGHT - 8));

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Chart settings"
      tabIndex={-1}
      onContextMenu={(event) => event.preventDefault()}
      // Portaled outside `.app-shell`, so the scoped panel/text variables do not
      // reach it — the colours have to be explicit or the menu renders see-through.
      className="fixed z-[70] rounded-lg border p-1.5 text-xs shadow-2xl outline-none"
      style={{
        left,
        top,
        width: PANEL_WIDTH,
        backgroundColor: theme === "dark" ? "#111725" : "#ffffff",
        borderColor: theme === "dark" ? "rgba(255,255,255,0.10)" : "#d9e0ec",
        color: theme === "dark" ? "#e6ecf7" : "#0f172a",
      }}
    >
      <Section label="Appearance" />
      <ColorRow
        label="Up colour"
        value={settings.upColor}
        swatches={UP_SWATCHES}
        onChange={(upColor) => onChange({ upColor })}
      />
      <ColorRow
        label="Down colour"
        value={settings.downColor}
        swatches={DOWN_SWATCHES}
        onChange={(downColor) => onChange({ downColor })}
      />
      <ToggleRow label="Grid lines" checked={settings.grid} onToggle={() => onChange({ grid: !settings.grid })} />
      <ToggleRow
        label="Current price line"
        checked={settings.priceLine}
        onToggle={() => onChange({ priceLine: !settings.priceLine })}
      />
      <ToggleRow
        label="Magnet crosshair"
        checked={settings.magnet}
        onToggle={() => onChange({ magnet: !settings.magnet })}
      />

      <Section label="On the chart" />
      <ToggleRow
        label="Trade history"
        checked={settings.tradeHistory}
        onToggle={() => onChange({ tradeHistory: !settings.tradeHistory })}
      />
      <ToggleRow
        label="Open position lines"
        checked={settings.positionLines}
        onToggle={() => onChange({ positionLines: !settings.positionLines })}
      />
      <ToggleRow
        label="Drawings"
        checked={settings.drawings}
        onToggle={() => onChange({ drawings: !settings.drawings })}
      />

      <button
        type="button"
        onClick={onReset}
        className="mt-1 flex w-full items-center gap-2 rounded-md border-t px-2 py-1.5 text-left hover:bg-white/[0.06]"
        style={{ borderColor: theme === "dark" ? "rgba(255,255,255,0.10)" : "#d9e0ec" }}
      >
        <RotateCcw size={13} aria-hidden />
        Reset to defaults
      </button>
    </div>,
    document.body,
  );
}

function Section({ label }: { label: string }) {
  return (
    <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">{label}</p>
  );
}

function ToggleRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.06]"
    >
      {label}
      <Check size={14} aria-hidden className={checked ? "text-brand-300" : "opacity-0"} />
    </button>
  );
}

function ColorRow({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string;
  value: string;
  swatches: string[];
  onChange: (color: string) => void;
}) {
  const options = swatches.includes(value) ? swatches : [value, ...swatches];
  return (
    <div className="px-2 py-1.5">
      <p className="mb-1.5 opacity-60">{label}</p>
      <div className="flex items-center gap-1.5">
        {options.slice(0, 5).map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`${label} ${color}`}
            aria-pressed={color === value}
            onClick={() => onChange(color)}
            style={{ backgroundColor: color }}
            className={`h-5 w-5 rounded ${color === value ? "ring-2 ring-white/70" : ""}`}
          />
        ))}
        <label className="ml-auto cursor-pointer" aria-label={`${label} custom`}>
          <span className="underline decoration-dotted opacity-60">Custom</span>
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="sr-only"
          />
        </label>
      </div>
    </div>
  );
}
