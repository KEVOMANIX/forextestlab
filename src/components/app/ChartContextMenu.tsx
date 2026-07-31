"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

/**
 * The chart's right-click menu.
 *
 * A trading chart is a working surface, and the price under the pointer is a
 * piece of information in its own right: the menu is how you act on *that*
 * price — copy it, plan an order at it, drop a stop on it — without first
 * hunting for the control that does it. Everything here is an action on the
 * click point or on the chart as a whole; preferences live behind "Settings…".
 */

export interface ChartMenuItem {
  id: string;
  label: string;
  /** Rendered right-aligned and dimmed, e.g. "Alt+R". */
  shortcut?: string;
  icon?: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  /** Draws a rule above this item, grouping what follows. */
  groupStart?: boolean;
  /** Destructive actions read in the bear colour. */
  danger?: boolean;
}

/** Roughly one item; used only to keep the menu on screen near an edge. */
const ITEM_HEIGHT = 28;
const MENU_WIDTH = 268;
const EDGE_GAP = 8;

export function ChartContextMenu({
  position,
  items,
  theme,
  onClose,
}: {
  position: { x: number; y: number };
  items: ChartMenuItem[];
  theme: "dark" | "light";
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const closeOnPointer = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", closeOnPointer);
    return () => document.removeEventListener("pointerdown", closeOnPointer);
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const enabled = items.filter((item) => !item.disabled);

  function step(delta: number) {
    if (enabled.length === 0) return;
    const current = enabled.findIndex((item) => item.id === items[active]?.id);
    const next = (current + delta + enabled.length) % enabled.length;
    setActive(items.findIndex((item) => item.id === enabled[next]!.id));
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      step(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      const item = items[active];
      if (!item || item.disabled) return;
      event.preventDefault();
      item.onSelect();
      onClose();
    }
  }

  // Keep the menu inside the viewport when opened near an edge. Its height is
  // known from the item count, so this needs no measure-then-reposition flash.
  const height = items.length * ITEM_HEIGHT + 12;
  const left = Math.min(
    position.x,
    Math.max(EDGE_GAP, window.innerWidth - MENU_WIDTH - EDGE_GAP),
  );
  const top = Math.min(
    position.y,
    Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP),
  );
  const surface = theme === "dark" ? "#161b28" : "#ffffff";

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label="Chart actions"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      // Portaled outside `.app-shell`, so the scoped theme variables do not
      // reach it — these colours have to be explicit or the menu renders
      // see-through over the chart.
      // The container takes focus so arrow keys work, but it is not a control:
      // the app-wide focus ring would draw a brand-coloured halo round the whole
      // menu, which reads as a selection it does not have.
      className="fixed z-[80] rounded-lg border py-1.5 text-[13px] shadow-2xl outline-none focus-visible:ring-0"
      style={
        {
          left,
          top,
          width: MENU_WIDTH,
          backgroundColor: surface,
          borderColor: theme === "dark" ? "rgba(255,255,255,0.12)" : "#d9e0ec",
          color: theme === "dark" ? "#ffffff" : "#0f172a",
          "--focus-ring-offset": surface,
        } as React.CSSProperties
      }
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div key={item.id}>
            {item.groupStart && index > 0 && (
              <hr
                className="my-1.5 border-t"
                style={{
                  borderColor:
                    theme === "dark" ? "rgba(255,255,255,0.10)" : "#e6ebf3",
                }}
              />
            )}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-40 ${
                item.danger ? "text-bear" : ""
              }`}
              style={{
                backgroundColor:
                  index === active && !item.disabled
                    ? theme === "dark"
                      ? "rgba(255,255,255,0.08)"
                      : "#eef2f8"
                    : "transparent",
              }}
            >
              <span className="grid w-4 shrink-0 place-items-center opacity-70">
                {Icon ? <Icon size={14} aria-hidden /> : null}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <span className="shrink-0 text-[11px] opacity-45">
                  {item.shortcut}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
