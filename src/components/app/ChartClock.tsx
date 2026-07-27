"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

import { formatInZone, zoneOffsetLabel, zoneOptionsAt } from "@/lib/chart/timezones";

/**
 * The clock in the corner of the time axis, and the time-zone picker it opens.
 *
 * The time shown is the replay's, not the wall clock's: in a session replaying
 * 2015 the only clock that means anything is the simulated one. Picking a zone
 * re-labels this chart's axis, crosshair and this readout together.
 */

const PANEL_WIDTH = 208;
const PANEL_MAX_HEIGHT = 420;

export function ChartClock({
  /** Current replay moment, in epoch ms. */
  at,
  zone,
  theme,
  onChange,
}: {
  at: number | null;
  zone: string;
  theme: "dark" | "light";
  onChange: (zone: string) => void;
}) {
  const [open, setOpen] = useState(false);
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

  const reference = at ?? Date.now();
  const options = useMemo(() => zoneOptionsAt(reference), [reference]);

  const clock = at == null ? "--:--" : formatInZone(at, zone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const offset = zoneOffsetLabel(zone, reference);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-testid="chart-clock"
        aria-label={`Chart time zone: ${offset}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change the chart's time zone"
        onClick={() => {
          const box = buttonRef.current?.getBoundingClientRect();
          if (box) setAnchor({ x: box.left + PANEL_WIDTH, y: box.top });
          setOpen((value) => !value);
        }}
        // Left end of the time axis, not the right: the support bubble is pinned
        // to the bottom-right corner of the viewport and would swallow the click.
        // A backdrop, because this sits on the axis strip over the tick labels.
        className={`pointer-events-auto absolute bottom-1 left-14 z-20 rounded border app-border bg-[var(--app-panel)] px-1.5 py-0.5 font-mono text-[10px] backdrop-blur ${
          open ? "text-brand-300" : "app-muted hover:text-[var(--app-text)]"
        }`}
      >
        {clock} {offset}
      </button>

      {open && anchor &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label="Chart time zone"
            className="fixed z-[70] overflow-y-auto rounded-lg border py-1 text-xs shadow-2xl"
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
            }}
          >
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
          </div>,
          document.body,
        )}
    </>
  );
}
