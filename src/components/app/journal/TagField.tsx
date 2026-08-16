"use client";

import { X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  MAX_TAGS,
  mergeTags,
  normaliseTag,
  removeTag,
} from "@/components/app/journal-utils";

/**
 * Tags as chips rather than a comma-separated string. The suggestion list is
 * drawn from tags already used in this session, which is what stops the same
 * idea being recorded three ways and becoming ungroupable later.
 */
export function TagField({
  label,
  hint,
  tone,
  value,
  suggestions,
  onChange,
}: {
  label: string;
  hint: string;
  tone: "brand" | "bear";
  value: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const full = value.length >= MAX_TAGS;

  const matches = useMemo(() => {
    const used = new Set(value.map((tag) => tag.toLowerCase()));
    const query = normaliseTag(draft).toLowerCase();
    return suggestions
      .filter((tag) => !used.has(tag.toLowerCase()))
      .filter((tag) => !query || tag.toLowerCase().includes(query))
      .slice(0, 6);
  }, [draft, suggestions, value]);

  const commit = (tag: string) => {
    const next = mergeTags(value, [tag]);
    if (next.length !== value.length) onChange(next);
    setDraft("");
    setOpen(false);
  };

  const chipTone =
    tone === "bear"
      ? "border-bear/30 bg-bear/[0.09] text-bear"
      : "border-brand-400/30 bg-brand-400/[0.09] text-brand-200";

  return (
    <div className="text-xs">
      <span className="mb-1 block app-muted">
        {label} <span className="text-[11px]">{hint}</span>
      </span>
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-[2.5rem] flex-wrap items-center gap-1.5 rounded-lg border app-border bg-[var(--app-panel-2)] px-2 py-1.5 transition-colors focus-within:border-brand-400/60"
      >
        {value.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium ${chipTone}`}
          >
            {tag}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onChange(removeTag(value, tag));
              }}
              aria-label={`Remove ${tag}`}
              className="opacity-60 transition-opacity hover:opacity-100"
            >
              <X size={11} aria-hidden />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          disabled={full}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // A blur that lands on a suggestion would close the list first, so
          // give the click a moment to land.
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              if (normaliseTag(draft)) commit(draft);
              return;
            }
            if (event.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          placeholder={
            full ? `${MAX_TAGS} tags is the maximum` : value.length ? "Add another…" : hintPlaceholder(tone)
          }
          aria-label={label}
          className="min-w-[8rem] flex-1 bg-transparent py-0.5 outline-none placeholder:app-muted disabled:cursor-not-allowed"
        />
      </div>

      {open && matches.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {matches.map((tag) => (
            <button
              key={tag}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(tag)}
              className="rounded-md border app-border px-1.5 py-0.5 app-muted transition-colors hover:border-brand-400/40 hover:text-brand-200"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function hintPlaceholder(tone: "brand" | "bear") {
  return tone === "bear"
    ? "FOMO, early exit, oversized"
    : "breakout, pullback, London open";
}
