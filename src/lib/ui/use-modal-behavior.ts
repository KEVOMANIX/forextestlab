"use client";

import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Modals can stack (a confirmation over the position editor), so the scroll lock
 * is reference counted — the innermost dialog closing must not unlock the page
 * while an outer one is still open.
 */
let lockCount = 0;
let previousOverflow = "";

function lockScroll() {
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.style.overflow = previousOverflow;
}

function focusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

/**
 * Shared dialog behaviour: initial focus, a Tab focus trap, Escape to dismiss,
 * a page scroll lock, and focus restored to whatever opened the dialog.
 *
 * Returns the ref to attach to the dialog element. Pass `closeOnEscape: false`
 * for dialogs that require an explicit decision and have no dismiss action.
 */
export function useModalBehavior<T extends HTMLElement>({
  open,
  onClose,
  closeOnEscape = true,
  initialFocus,
}: {
  open: boolean;
  onClose?: () => void;
  closeOnEscape?: boolean;
  initialFocus?: RefObject<HTMLElement>;
}): MutableRefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const restoreTo = document.activeElement as HTMLElement | null;

    lockScroll();

    const target =
      initialFocus?.current ??
      (container ? focusable(container)[0] ?? container : null);
    target?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape) {
        event.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !container) return;
      const stops = focusable(container);
      if (stops.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const active = document.activeElement;
      if (!container.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      unlockScroll();
      restoreTo?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closeOnEscape]);

  return containerRef;
}

/**
 * True while any `aria-modal` dialog is mounted. Global keyboard shortcuts read
 * this so a single-key trading shortcut can never fire behind a dialog.
 */
export function modalIsOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}
