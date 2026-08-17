"use client";

import { Info } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAppTheme } from "@/components/app/ThemeContext";
import { explainMetric, type MetricExplainer } from "@/lib/analytics/metric-glossary";

const PANEL_WIDTH = 288;
const VIEWPORT_MARGIN = 12;
const GAP = 8;

/**
 * The (i) that carries everything the reports do not have room to say.
 *
 * Three decisions worth keeping:
 *
 *  - It opens on click, not hover. The screens this appears on are read on
 *    phones as often as on desktops, and a hover-only affordance is simply
 *    absent on touch — which is exactly the failure of the `title` attribute
 *    this replaces.
 *  - The panel renders in a portal with fixed positioning. Almost every card
 *    on the analytics screens is `overflow-hidden` for its rounded corners, so
 *    an absolutely positioned panel would be clipped by its own card.
 *  - Scrolling closes it. Tracking a fixed panel against a scrolling anchor
 *    means either a scroll listener on every ancestor or a panel that drifts
 *    away from its button; closing is honest and costs the reader one tap.
 */
export function MetricInfo({
  term,
  label,
  detail,
  className = "",
}: {
  /** The metric to look up in the glossary. */
  term: string;
  /** Heading for the panel, when the on-screen label differs from the term. */
  label?: string;
  /**
   * Extra prose for this specific card — the paragraph that used to sit under
   * the chart. Shown after the glossary definition, or alone if the term has
   * no glossary entry.
   */
  detail?: string;
  className?: string;
}) {
  const explainer = explainMetric(term);
  // The panel is portaled to <body>, outside the .app-shell that carries the
  // --app-* palette, so it has to declare the surface and the theme itself.
  const { theme } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  // Placement is measured after the panel exists, so its real height decides
  // whether it opens downwards or flips above the button.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const button = buttonRef.current;
    if (!button) return;
    const anchor = button.getBoundingClientRect();
    const height = panelRef.current?.offsetHeight ?? 160;
    const above = anchor.bottom + GAP + height > window.innerHeight - VIEWPORT_MARGIN && anchor.top > height + GAP + VIEWPORT_MARGIN;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, anchor.left + anchor.width / 2 - PANEL_WIDTH / 2),
      window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN,
    );
    setPosition({
      top: above ? anchor.top - GAP - height : anchor.bottom + GAP,
      left,
      above,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  if (!explainer && !detail) return null;

  const heading = label ?? term;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`What ${heading.toLowerCase()} means`}
        className={`inline-grid h-4 w-4 shrink-0 place-items-center rounded-full text-[var(--app-muted)] transition-colors hover:bg-white/[0.08] hover:text-[var(--app-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-400 ${open ? "bg-white/[0.08] text-[var(--app-text)]" : ""} ${className}`}
      >
        <Info size={12} aria-hidden />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="tooltip"
            style={{
              position: "fixed",
              width: PANEL_WIDTH,
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              visibility: position ? "visible" : "hidden",
            }}
            className={`app-theme-surface z-[70] rounded-xl border app-border bg-[var(--app-panel-solid)] p-3.5 text-left text-[var(--app-text)] shadow-[0_18px_50px_-20px_rgba(0,0,0,0.85)] ${theme === "light" ? "light" : ""}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-300">
              {heading}
            </p>
            <ExplainerBody explainer={explainer} detail={detail} />
          </div>,
          document.body,
        )}
    </>
  );
}

function ExplainerBody({
  explainer,
  detail,
}: {
  explainer: MetricExplainer | null;
  detail?: string;
}) {
  return (
    <>
      {explainer && <p className="mt-1.5 text-xs leading-5">{explainer.what}</p>}
      {explainer?.how && (
        <p className="mt-2 text-[11px] leading-5 app-muted">
          <span className="font-semibold text-[var(--app-text)]">How it is worked out:</span>{" "}
          {explainer.how}
        </p>
      )}
      {explainer?.read && (
        <p className="mt-2 text-[11px] leading-5 app-muted">
          <span className="font-semibold text-[var(--app-text)]">Reading it:</span>{" "}
          {explainer.read}
        </p>
      )}
      {detail && (
        <p className={`text-[11px] leading-5 app-muted ${explainer ? "mt-2 border-t app-border pt-2" : "mt-1.5"}`}>
          {detail}
        </p>
      )}
    </>
  );
}

/**
 * A metric label with its (i) attached — the shape almost every call site
 * wants, kept in one place so the spacing does not drift card to card.
 */
export function MetricLabel({
  label,
  term,
  detail,
  className = "",
}: {
  label: string;
  /** Defaults to the label; pass it only when the glossary key differs. */
  term?: string;
  detail?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {label}
      <MetricInfo term={term ?? label} label={label} detail={detail} />
    </span>
  );
}
