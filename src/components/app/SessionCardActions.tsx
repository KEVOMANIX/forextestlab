"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, BarChart3, Copy, Play, RotateCcw } from "lucide-react";
import { useState } from "react";

export function SessionCardActions({
  sessionId,
  status,
  archived,
}: {
  sessionId: string;
  status: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
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

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!finished && (
        <Link
          href={`/app/backtest?session=${encodeURIComponent(sessionId)}`}
          className="btn-primary px-3 py-2 text-xs"
        >
          <Play size={14} aria-hidden /> Resume
        </Link>
      )}
      <Link
        href={`/app/results/${sessionId}`}
        className={`${finished ? "btn-primary" : "btn-secondary"} px-3 py-2 text-xs`}
      >
        <BarChart3 size={14} aria-hidden /> Analytics
      </Link>
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
        onClick={() => setArchived(!archived)}
        disabled={busy}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs app-muted hover:bg-[var(--app-panel-2)] hover:text-brand-300"
      >
        {archived ? <RotateCcw size={13} aria-hidden /> : <Archive size={13} aria-hidden />}
        {archived ? "Restore" : "Archive"}
      </button>
    </div>
  );
}
