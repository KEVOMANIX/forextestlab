"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { useModalBehavior } from "@/lib/ui/use-modal-behavior";

type Request =
  | { kind: "prompt"; title: string; label: string; value: string; confirmLabel: string; resolve: (value: string | null) => void }
  | { kind: "confirm"; title: string; message: string; confirmLabel: string; danger?: boolean; resolve: (value: boolean) => void };

function Dialog({ request, onClose }: { request: Request; onClose: (value: string | boolean | null) => void }) {
  const [value, setValue] = useState(request.kind === "prompt" ? request.value : "");
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancel = () => onClose(request.kind === "prompt" ? null : false);
  const ref = useModalBehavior<HTMLDivElement>({ open: true, onClose: cancel, initialFocus: request.kind === "prompt" ? inputRef : confirmRef });
  const submit = () => {
    if (request.kind === "confirm") return onClose(true);
    const trimmed = value.trim();
    if (trimmed) onClose(trimmed);
  };
  return <div className="fixed inset-0 z-[200] grid place-items-center bg-black/55 p-4" onPointerDown={event => { if (event.target === event.currentTarget) cancel(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="lab-dialog-title" className="w-full max-w-sm rounded-xl border app-border bg-[var(--app-panel-solid)] p-5 text-[var(--app-text)] shadow-2xl">
      <h2 id="lab-dialog-title" className="text-base font-semibold">{request.title}</h2>
      <form onSubmit={event => { event.preventDefault(); submit(); }}>
        {request.kind === "prompt"
          ? <label className="mt-3 block text-xs app-muted">{request.label}<input ref={inputRef} value={value} maxLength={80} onChange={event => setValue(event.target.value)} onFocus={event => event.currentTarget.select()} className="mt-1.5 h-10 w-full rounded-lg border app-border bg-[var(--app-panel-2)] px-3 text-sm text-[var(--app-text)] outline-none selection:bg-[var(--app-accent)] selection:text-[var(--app-accent-ink)] focus:border-[var(--app-accent)]" /></label>
          : <p className="mt-2 text-sm app-muted">{request.message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={cancel} className="h-9 rounded-lg border app-border px-4 text-xs font-semibold hover:bg-[var(--app-panel-2)]">Cancel</button>
          <button ref={confirmRef} type="submit" disabled={request.kind === "prompt" && !value.trim()} className={`h-9 rounded-lg px-4 text-xs font-bold disabled:opacity-50 ${request.kind === "confirm" && request.danger ? "bg-loss text-white" : "bg-[var(--app-accent)] text-[var(--app-accent-ink)]"}`}>{request.confirmLabel}</button>
        </div>
      </form>
    </div>
  </div>;
}

/** In-app replacements for window.prompt / window.confirm. Render `dialog` once. */
export function useLabDialog(): { prompt: (options: { title: string; label: string; value: string; confirmLabel?: string }) => Promise<string | null>; confirm: (options: { title: string; message: string; confirmLabel: string; danger?: boolean }) => Promise<boolean>; dialog: ReactNode } {
  const [request, setRequest] = useState<Request | null>(null);
  const prompt = useCallback((options: { title: string; label: string; value: string; confirmLabel?: string }) => new Promise<string | null>(resolve => setRequest({ kind: "prompt", confirmLabel: "Save", ...options, resolve })), []);
  const confirm = useCallback((options: { title: string; message: string; confirmLabel: string; danger?: boolean }) => new Promise<boolean>(resolve => setRequest({ kind: "confirm", ...options, resolve })), []);
  const dialog = request ? <Dialog key={request.title} request={request} onClose={value => { setRequest(null); (request.resolve as (value: string | boolean | null) => void)(value); }} /> : null;
  return { prompt, confirm, dialog };
}
