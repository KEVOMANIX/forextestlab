"use client";

import { Check, ChevronDown, Copy, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * Small client primitives for the support workspace. Every one of them wraps a
 * real Server Action form: nothing here holds support state on the client.
 */

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [close, open]);
  return ref;
}

/**
 * A select that saves as soon as it changes, so status and priority need no
 * separate "Save" button sitting next to the conversation.
 */
export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  label,
  className = "",
  dot,
}: {
  name: string;
  defaultValue: string;
  options: readonly string[];
  label: string;
  className?: string;
  dot?: string;
}) {
  return (
    <span
      className={`relative inline-flex items-center gap-1.5 rounded-lg border app-border bg-[var(--app-panel-2)] pl-2.5 pr-7 ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />}
      <select
        name={name}
        aria-label={label}
        defaultValue={defaultValue}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="w-full appearance-none bg-transparent py-1.5 text-xs capitalize text-[var(--app-text)] focus:outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-[var(--app-panel-solid)]">
            {option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        aria-hidden
        className="pointer-events-none absolute right-2 app-muted"
      />
    </span>
  );
}

export function PopoverMenu({
  label,
  icon,
  align = "right",
  width = "w-64",
  children,
  className = "",
}: {
  label: string;
  icon: React.ReactNode;
  align?: "left" | "right";
  width?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`inline-flex items-center gap-1.5 rounded-lg border app-border px-2.5 py-1.5 text-xs app-muted transition-colors hover:text-[var(--app-text)] ${className}`}
      >
        {icon}
      </button>
      {open && (
        <div
          onClick={close}
          className={`absolute top-[calc(100%+6px)] z-40 ${width} ${
            align === "right" ? "right-0" : "left-0"
          } overflow-hidden rounded-xl border app-border bg-[var(--app-panel-solid)] p-1.5 shadow-2xl shadow-black/50`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Customer and conversation detail live here rather than in a permanent fourth
 * column. It overlays, so opening it never remounts or rescrolls the thread.
 */
export function DetailsDrawer({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border app-border px-2.5 py-1.5 text-xs font-medium app-muted transition-colors hover:text-[var(--app-text)]"
      >
        Details
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close details"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/45"
          />
          <aside
            id={id}
            aria-label={title}
            className="flex h-full w-full max-w-[360px] flex-col border-l app-border bg-[var(--app-panel-solid)]"
          >
            <header className="flex h-16 shrink-0 items-center justify-between border-b app-border px-5">
              <h2 className="text-sm font-semibold">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close details"
                className="grid h-8 w-8 place-items-center rounded-lg app-muted transition-colors hover:bg-white/[0.06] hover:text-[var(--app-text)]"
              >
                <X size={16} aria-hidden />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          </aside>
        </div>
      )}
    </>
  );
}

/** Long ids stay readable: truncated on screen, exact on the clipboard. */
export function CopyValue({ value, display }: { value: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1_600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate" title={value}>
        {display ?? value}
      </span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => setCopied(true));
        }}
        aria-label={copied ? "Copied" : `Copy ${value}`}
        className="shrink-0 app-muted transition-colors hover:text-[var(--app-text)]"
      >
        {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
      </button>
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        role="dialog"
        aria-label={title}
        className="relative w-full max-w-md rounded-2xl border app-border bg-[var(--app-panel-solid)] p-5 shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg app-muted hover:text-[var(--app-text)]"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
