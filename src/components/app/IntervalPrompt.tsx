"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

import { parseIntervalInput } from "@/lib/chart/interval-input";
import type { Timeframe } from "@/lib/market-data/types";

/**
 * The interval field a digit opens.
 *
 * Deliberately tiny and modeless-feeling: it is the answer to a keystroke, so
 * it takes Enter and Escape and nothing else. The resolved interval sits under
 * the field in words, because "5" alone does not say whether it means minutes,
 * and a chart that reloads onto the wrong timeframe costs a scroll back.
 */
export function IntervalPrompt({
  open,
  initialValue,
  available,
  onApply,
  onClose,
}: {
  open: boolean;
  /** The digit that opened it, already typed. */
  initialValue: string;
  available: readonly Timeframe[];
  onApply: (timeframe: Timeframe) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [helpOpen, setHelpOpen] = useState(false);
  const id = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const helpRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    setHelpOpen(false);
    const previousFocus = document.activeElement as HTMLElement | null;
    // Keep the caret after the opening digit so typing 1 then 5 means 15.
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    return () => {
      cancelAnimationFrame(frame);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [initialValue, open]);

  if (!open) return null;

  const guess = parseIntervalInput(value, available);

  return (
    <div
      className="absolute inset-0 z-[80] grid place-items-center"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        data-testid="interval-prompt"
        className="w-[252px] max-w-[calc(100%-24px)] rounded-md bg-[var(--ticket-bg)] px-9 pb-9 pt-10 text-center text-[var(--ticket-text)] shadow-2xl"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "Tab") {
            event.preventDefault();
            if (document.activeElement === inputRef.current) helpRef.current?.focus();
            else inputRef.current?.focus();
          }
        }}
      >
        <div className="relative flex items-center justify-center gap-1.5 whitespace-nowrap">
          <h2 id={`${id}-title`} className="text-[18px] font-semibold leading-6">Change interval</h2>
          <button
            ref={helpRef}
            type="button"
            aria-label="Interval help"
            aria-describedby={helpOpen ? `${id}-help` : undefined}
            onPointerEnter={() => setHelpOpen(true)}
            onPointerLeave={() => setHelpOpen(document.activeElement === helpRef.current)}
            onFocus={() => setHelpOpen(true)}
            onBlur={() => setHelpOpen(false)}
            onClick={() => setHelpOpen(true)}
            className="rounded-full text-[var(--ticket-subtle)] outline-none hover:text-[var(--ticket-text)] focus-visible:ring-2 focus-visible:ring-[#526ff5]"
          >
            <Info size={14} aria-hidden />
          </button>
          {helpOpen && (
            <div id={`${id}-help`} role="tooltip" className="absolute bottom-full left-1/2 z-10 mb-2 w-[280px] max-w-[calc(100vw-24px)] -translate-x-1/2 whitespace-normal rounded border border-[var(--ticket-field-border)] bg-[var(--ticket-bg)] px-3 py-2 text-left text-xs font-normal leading-4 text-[var(--ticket-text)] shadow-lg">
              Type a number for minutes (5 means 5 minutes), or add a unit: H for hours, D for days, W for weeks, M for months, or Y for years. For example: 4H or 3M. Press Enter to apply a supported interval, or Escape to cancel.
            </div>
          )}
        </div>
        <label htmlFor={`${id}-input`} className="sr-only">
          Interval
        </label>
        <input
          id={`${id}-input`}
          aria-describedby={`${id}-preview`}
          aria-invalid={value.trim().length > 0 && !guess.timeframe}
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (guess.timeframe) {
                onApply(guess.timeframe);
                onClose();
              }
              return;
            }
          }}
          className="mt-4 h-11 w-full rounded-md border border-[var(--ticket-field-border)] bg-transparent px-2 text-center text-sm font-semibold text-[var(--ticket-text)] caret-[var(--ticket-text)] outline-none focus:border-[#526ff5] focus:ring-1 focus:ring-[#526ff5]"
          autoComplete="off"
          spellCheck={false}
        />
        <p
          id={`${id}-preview`}
          className="mt-1 min-h-4 text-[11px] leading-4 text-[var(--ticket-subtle)]"
          aria-live="polite"
        >
          {guess.label || " "}
        </p>
      </div>
    </div>
  );
}
