"use client";

import { useEffect, useRef, useState } from "react";
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
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    // Focus after paint, and select, so a second digit replaces rather than
    // appends — typing 1 then 5 should mean 15, but typing 1 then changing
    // your mind to 5 should mean 5. Caret at the end keeps both possible.
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [initialValue, open]);

  if (!open) return null;

  const guess = parseIntervalInput(value, available);

  return (
    <div
      className="absolute inset-0 z-[80] grid place-items-center bg-surface-950/45"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change interval"
        data-testid="interval-prompt"
        className="w-[248px] rounded-xl border app-border bg-[var(--app-panel-solid)] px-6 py-5 text-center shadow-2xl"
      >
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold">
          Change interval
          <span
            title="Type a number for minutes, or add a unit: 60 or 1h, 1D, 1W, 3M. Capital M is months."
            className="app-muted"
          >
            <Info size={13} aria-hidden />
          </span>
        </p>
        <label htmlFor="interval-prompt-input" className="sr-only">
          Interval
        </label>
        <input
          id="interval-prompt-input"
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
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
          className="app-input mt-4 h-11 w-full text-center font-mono text-base"
          autoComplete="off"
          spellCheck={false}
        />
        <p
          className={`mt-2 text-[11px] ${guess.timeframe ? "app-muted" : "text-amber-300"}`}
          aria-live="polite"
        >
          {guess.label || " "}
        </p>
      </div>
    </div>
  );
}
