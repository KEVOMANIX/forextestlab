"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef } from "react";

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Continue",
  danger = false,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center bg-surface-950/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
        className="w-full max-w-md overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)] shadow-2xl"
      >
        <div className="flex items-start gap-4 p-5 sm:p-6">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
              danger ? "bg-bear/10 text-bear" : "bg-brand-400/10 text-brand-300"
            }`}
          >
            <AlertTriangle size={20} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-modal-title" className="text-lg font-semibold">{title}</h2>
            <p id="confirm-modal-message" className="mt-2 text-sm leading-6 app-muted">
              {message}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close confirmation"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)] disabled:opacity-40"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="flex justify-end gap-2 border-t app-border bg-[var(--app-panel-2)]/60 px-5 py-4">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className="btn-secondary px-4 py-2">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              danger ? "bg-bear text-white hover:bg-bear/90" : "bg-brand-500 text-surface-950 hover:bg-brand-400"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
