"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  BarChart3,
  Copy,
  MoreHorizontal,
  Pencil,
  Play,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";

export function SessionCardActions({
  sessionId,
  status,
  archived,
  showAnalytics = true,
  compact = false,
  sessionName = "",
}: {
  sessionId: string;
  status: string;
  archived: boolean;
  showAnalytics?: boolean;
  compact?: boolean;
  sessionName?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(sessionName);
  const [renameError, setRenameError] = useState<string | null>(null);
  const finished = status === "finished";

  async function setArchived(value: boolean) {
    setBusy(true);
    const response = await fetch(`/api/backtest/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: value }),
    });
    setBusy(false);
    if (response.ok) router.refresh();
  }

  async function duplicate() {
    setBusy(true);
    const response = await fetch(
      `/api/backtest/sessions/${sessionId}/duplicate`,
      { method: "POST" },
    );
    const result = (await response.json()) as {
      ok?: boolean;
      sessionId?: string;
    };
    setBusy(false);
    if (response.ok && result.sessionId) {
      router.push(`/app/backtest?session=${encodeURIComponent(result.sessionId)}`);
    }
  }

  async function remove() {
    setBusy(true);
    const response = await fetch(`/api/backtest/sessions/${sessionId}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (response.ok) {
      setDeleteOpen(false);
      router.refresh();
    }
  }

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    const nextName = name.trim();
    if (nextName.length < 2) {
      setRenameError("Enter at least two characters.");
      return;
    }
    setBusy(true);
    setRenameError(null);
    const response = await fetch(`/api/backtest/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName }),
    });
    setBusy(false);
    if (response.ok) {
      setRenameOpen(false);
      router.refresh();
    } else {
      setRenameError("The session name could not be updated.");
    }
  }

  return (
    <>
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!finished && (
        <Link
          href={`/app/backtest?session=${encodeURIComponent(sessionId)}`}
          className="btn-primary px-3 py-2 text-xs"
        >
          <Play size={14} aria-hidden /> Resume
        </Link>
      )}
      {showAnalytics && (
        <Link
          href={`/app/results/${sessionId}`}
          className={`${finished ? "btn-primary" : "btn-secondary"} px-3 py-2 text-xs`}
        >
          <BarChart3 size={14} aria-hidden /> Analytics
        </Link>
      )}
      {compact ? (
        <details className="group relative">
          <summary
            className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-lg border app-border app-muted transition-colors hover:border-brand-400/35 hover:text-brand-300"
            aria-label="More session actions"
            title="More actions"
          >
            <MoreHorizontal size={15} aria-hidden />
          </summary>
          <div className="absolute right-0 top-10 z-30 w-44 rounded-xl border app-border bg-[var(--app-panel)] p-1.5 shadow-2xl">
            <button
              type="button"
              onClick={() => setRenameOpen(true)}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-white/[0.06]"
            >
              <Pencil size={13} aria-hidden /> Rename
            </button>
            <button
              type="button"
              onClick={duplicate}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-white/[0.06]"
            >
              <Copy size={13} aria-hidden /> Duplicate
            </button>
            <button
              type="button"
              onClick={() => void setArchived(!archived)}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-white/[0.06]"
            >
              {archived ? <RotateCcw size={13} aria-hidden /> : <Archive size={13} aria-hidden />}
              {archived ? "Restore" : "Archive"}
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-bear hover:bg-bear/10"
            >
              <Trash2 size={13} aria-hidden /> Delete
            </button>
          </div>
        </details>
      ) : (
        <>
          <button
            type="button"
            onClick={duplicate}
            disabled={busy}
            className="btn-secondary px-3 py-2 text-xs"
          >
            <Copy size={14} aria-hidden />
            {finished ? "Duplicate" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            disabled={busy}
            aria-label="Delete session"
            title="Delete session"
            className="grid h-8 w-8 place-items-center rounded-md text-bear/80 hover:bg-bear/10 hover:text-bear disabled:opacity-40"
          >
            <Trash2 size={14} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void setArchived(!archived)}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs app-muted hover:bg-[var(--app-panel-2)] hover:text-brand-300"
          >
            {archived ? <RotateCcw size={13} aria-hidden /> : <Archive size={13} aria-hidden />}
            {archived ? "Restore" : "Archive"}
          </button>
        </>
      )}
    </div>
    {renameOpen && (
      <div
        className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) setRenameOpen(false);
        }}
      >
        <form
          onSubmit={rename}
          className="w-full max-w-md rounded-2xl border app-border bg-[var(--app-panel)] p-5 shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`rename-session-${sessionId}`}
        >
          <div className="flex items-center justify-between gap-4">
            <h2 id={`rename-session-${sessionId}`} className="text-lg font-semibold">
              Rename session
            </h2>
            <button
              type="button"
              onClick={() => setRenameOpen(false)}
              disabled={busy}
              className="grid h-8 w-8 place-items-center rounded-lg app-muted hover:bg-white/[0.06]"
              aria-label="Close rename dialog"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-medium">Session name</span>
            <input
              autoFocus
              className="app-input h-11 w-full"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {renameError && <p className="mt-2 text-xs text-bear">{renameError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRenameOpen(false)}
              disabled={busy}
              className="btn-secondary px-4 py-2 text-xs"
            >
              Cancel
            </button>
            <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-xs">
              {busy ? "Saving…" : "Save name"}
            </button>
          </div>
        </form>
      </div>
    )}
    <ConfirmModal
      open={deleteOpen}
      title="Delete session?"
      message="This session and its saved trades will be permanently deleted."
      confirmLabel="Delete session"
      danger
      busy={busy}
      onCancel={() => setDeleteOpen(false)}
      onConfirm={() => void remove()}
    />
    </>
  );
}
