"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

/** TradingView's palette: a gray row, the ten base hues, then six shades of each hue (light → dark). */
const GRAYS = ["#FFFFFF", "#D1D4DC", "#B2B5BE", "#9598A1", "#787B86", "#5D606B", "#434651", "#2A2E39", "#131722", "#000000"];
const HUES = ["#F23645", "#FF9800", "#FFEB3B", "#4CAF50", "#089981", "#00BCD4", "#2962FF", "#673AB7", "#9C27B0", "#E91E63"];
const SHADES = [
  ["#FCCBCD", "#FFE0B2", "#FFF9C4", "#C8E6C9", "#ACE5DC", "#B2EBF2", "#BBD9FB", "#D1C4E9", "#E1BEE7", "#F8BBD0"],
  ["#FAA1A4", "#FFCC80", "#FFF59D", "#A5D6A7", "#70CCBD", "#80DEEA", "#90BFF9", "#B39DDB", "#CE93D8", "#F48FB1"],
  ["#F77C80", "#FFB74D", "#FFF176", "#81C784", "#42BDA8", "#4DD0E1", "#5B9CF6", "#9575CD", "#BA68C8", "#F06292"],
  ["#F7525F", "#FFA726", "#FFEE58", "#66BB6A", "#22AB94", "#26C6DA", "#3179F5", "#7E57C2", "#AB47BC", "#EC407A"],
  ["#B22833", "#F57C00", "#FBC02D", "#388E3C", "#056656", "#0097A7", "#1848CC", "#512DA8", "#7B1FA2", "#C2185B"],
  ["#801922", "#E65100", "#F57F17", "#1B5E20", "#004D40", "#006064", "#0C3299", "#311B92", "#4A148C", "#880E4F"],
];
const RECENT_KEY = "forextestlab:pine-recent-colors";

/** "#RRGGBB" + opacity 0–100 → "#RRGGBBAA". */
const withOpacity = (hex: string, opacity: number) => `${hex.slice(0, 7).toUpperCase()}${Math.round((Math.max(0, Math.min(100, opacity)) / 100) * 255).toString(16).padStart(2, "0").toUpperCase()}`;
const opacityOf = (color: string) => { const alpha = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(color)?.[1]; return alpha ? Math.round((parseInt(alpha, 16) / 255) * 100) : 100; };

function readRecent(): string[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && /^#[0-9A-F]{6}$/i.test(item)).slice(0, 8) : []; } catch { return []; }
}
function remember(hex: string) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([hex.toUpperCase(), ...readRecent().filter((item) => item !== hex.toUpperCase())].slice(0, 8))); } catch { /* Recent colors are a convenience. */ }
}

/**
 * A color swatch that opens TradingView's color picker: palette, custom colors
 * and an opacity slider. Emits "#RRGGBBAA".
 */
export function ColorSwatch({ color, onChange, label }: { color: string; onChange: (color: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLInputElement>(null);
  const hex = /^#[0-9a-f]{6}/i.test(color) ? color.slice(0, 7).toUpperCase() : "#2962FF";
  const opacity = opacityOf(color);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    // Fixed to the viewport so the dialog's scroll area does not clip it.
    const box = buttonRef.current.getBoundingClientRect();
    const width = 264, height = 340;
    const left = Math.min(window.innerWidth - width - 8, Math.max(8, box.left));
    const top = box.bottom + 6 + height > window.innerHeight ? Math.max(8, box.top - height - 6) : box.bottom + 6;
    setPosition({ left, top });
    setRecent(readRecent());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside, true); window.removeEventListener("keydown", escape, true); };
  }, [open]);

  const pick = (next: string) => onChange(withOpacity(next, opacity));
  const cell = (value: string) => (
    <button
      key={value}
      type="button"
      onClick={() => pick(value)}
      aria-label={value}
      title={value}
      className={`h-[22px] w-[22px] rounded-[4px] border ${value === hex ? "border-2 border-[var(--app-text)]" : "border-black/10"}`}
      style={{ backgroundColor: value }}
    />
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={label}
        aria-expanded={open}
        title={label}
        className={`relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border bg-[conic-gradient(#8884_25%,transparent_0_50%,#8884_0_75%,transparent_0)] bg-[length:8px_8px] ${open ? "border-brand-400" : "app-border"}`}
      >
        <span className="absolute inset-1.5 rounded" style={{ backgroundColor: hex, opacity: Math.max(opacity, 6) / 100 }} />
      </button>
      {open && position && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`${label} picker`}
          data-testid="pine-color-picker"
          className="fixed z-[80] w-[264px] rounded-xl border app-border bg-[var(--app-panel-solid)] p-3 shadow-2xl"
          style={{ left: position.left, top: position.top }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="grid grid-cols-10 gap-[3px]">{GRAYS.map(cell)}</div>
          <div className="mt-2 grid grid-cols-10 gap-[3px]">{HUES.map(cell)}</div>
          <div className="mt-2 grid grid-cols-10 gap-[3px]">{SHADES.flat().map(cell)}</div>
          <div className="mt-3 flex items-center gap-[3px] border-t app-border pt-3">
            {recent.map(cell)}
            <button type="button" onClick={() => customRef.current?.click()} aria-label="Custom color" title="Custom color" className="grid h-[22px] w-[22px] place-items-center rounded-[4px] app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]">
              <Plus size={16} aria-hidden />
            </button>
            <input ref={customRef} type="color" value={hex} onChange={(event) => { remember(event.target.value); setRecent(readRecent()); pick(event.target.value); }} className="sr-only" tabIndex={-1} aria-hidden />
          </div>
          <p className="mt-3 text-xs app-muted">Opacity</p>
          <div className="mt-1.5 flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(event) => onChange(withOpacity(hex, Number(event.target.value)))}
              aria-label="Opacity"
              className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full"
              style={{ background: `linear-gradient(to right, transparent, ${hex}), conic-gradient(#8884 25%, transparent 0 50%, #8884 0 75%, transparent 0) 0 0 / 8px 8px` }}
            />
            <label className="flex h-8 w-16 items-center rounded-md border app-border px-2 text-xs">
              <input
                type="number"
                min={0}
                max={100}
                value={opacity}
                onChange={(event) => { if (event.target.value !== "") onChange(withOpacity(hex, Number(event.target.value))); }}
                className="w-full bg-transparent text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                aria-label="Opacity percent"
              />
              <span className="app-muted">%</span>
            </label>
          </div>
        </div>
      )}
    </>
  );
}
