"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Globe } from "lucide-react";

import { zoneOffsetLabel, zoneOptionsAt } from "@/lib/chart/timezones";

/**
 * The zone every chart is read in, and the picker for changing it.
 *
 * It shows the offset alone. A wall clock is the least relevant time on a
 * historical replay — the trader cares what time it is *in the session*, and
 * that readout lives in the account strip. Picking a zone here re-labels every
 * chart's axis and crosshair, and the session clock, together.
 */

const PANEL_WIDTH = 208;
const PANEL_MAX_HEIGHT = 440;

export function TimeZonePicker({
  zone,
  theme,
  onChange,
}: {
  zone: string;
  theme: "dark" | "light";
  onChange: (zone: string) => void;
}) {
  /**
   * Moment the offsets are resolved against. An offset only changes when a zone
   * crosses a daylight-saving boundary, so this ticks once a minute rather than
   * once a second — a 1 Hz re-render over a chart mid-replay bought nothing once
   * the time itself stopped being displayed.
   */
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  // Open the list at the current zone rather than at the top of ninety of them.
  useEffect(() => {
    if (open) selectedRef.current?.scrollIntoView({ block: "center" });
  }, [open]);

  const reference = now;
  const allOptions = useMemo(() => zoneOptionsAt(reference), [reference]);
  const options = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return allOptions;
    return allOptions.filter(
      (option) =>
        option.label.toLowerCase().includes(term) ||
        option.id.toLowerCase().includes(term) ||
        option.offset.toLowerCase().includes(term),
    );
  }, [allOptions, query]);

  const offset = zoneOffsetLabel(zone, reference);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-testid="chart-timezone"
        aria-label={`Chart time zone: ${offset}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change the time zone every chart is read in"
        onClick={() => {
          const box = buttonRef.current?.getBoundingClientRect();
          // Anchored by its right edge: this sits at the right end of the axis,
          // so a list growing rightwards would run off the chart.
          if (box) setAnchor({ x: box.right, y: box.top });
          setQuery("");
          setOpen((value) => !value);
        }}
        // Seated into the corner cell the two scales form: flush to the bottom
        // and right edges, with only the inner corner rounded and only the inner
        // edges bordered, so it reads as part of the axis furniture rather than a
        // chip floating on top of it. Opaque, because it covers the axis strip.
        className={`inline-flex h-[26px] items-center gap-1.5 rounded-tl-md border-l border-t bg-[var(--app-panel-solid)] pl-2 pr-2.5 transition-colors ${
          open
            ? "border-brand-400/60 text-[var(--app-accent-text)]"
            : "app-border text-[var(--app-text)] hover:border-brand-400/40"
        }`}
      >
        <Globe size={12} aria-hidden className="shrink-0 app-muted" />
        <span className="font-mono text-[11px] font-semibold">{offset}</span>
        <ChevronDown
          size={11}
          aria-hidden
          className={`shrink-0 app-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && anchor &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label="Chart time zone"
            className="fixed z-[70] flex flex-col rounded-lg border py-1 text-xs shadow-2xl"
            // Portaled outside `.app-shell`, so the scoped theme variables do
            // not reach it and the colours have to be explicit.
            style={{
              width: PANEL_WIDTH,
              maxHeight: PANEL_MAX_HEIGHT,
              left: Math.max(8, Math.min(anchor.x - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8)),
              top: Math.max(8, anchor.y - Math.min(PANEL_MAX_HEIGHT, window.innerHeight - 16)),
              backgroundColor: theme === "dark" ? "#111725" : "#ffffff",
              borderColor: theme === "dark" ? "rgba(255,255,255,0.10)" : "#d9e0ec",
              color: theme === "dark" ? "#e6ecf7" : "#0f172a",
              // The focus ring punches its gap out of this panel, not the page
              // behind it — without this the search field draws a dark halo on
              // the light theme, since the shell's variable can't reach a portal.
              "--focus-ring-offset": theme === "dark" ? "#111725" : "#ffffff",
            } as React.CSSProperties}
          >
            <div className="px-2 pb-1.5 pt-1">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search city or offset…"
                aria-label="Search time zones"
                className="w-full rounded border bg-transparent px-2 py-1 text-xs outline-none focus:border-brand-400"
                style={{ borderColor: theme === "dark" ? "rgba(255,255,255,0.14)" : "#d9e0ec" }}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
            {options.length === 0 && <p className="px-3 py-2 opacity-60">No matching zone.</p>}
            {options.map((option) => {
              const selected = option.id === zone;
              return (
                <button
                  key={option.id}
                  ref={selected ? selectedRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.06] ${
                    selected ? "text-brand-300" : ""
                  }`}
                >
                  <span className="w-16 shrink-0 opacity-60">
                    {option.id === "UTC" || option.id === "exchange" ? "" : `(${option.offset})`}
                  </span>
                  <span className="truncate">{option.label}</span>
                  {selected && <Check size={13} aria-hidden className="ml-auto shrink-0" />}
                </button>
              );
            })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
