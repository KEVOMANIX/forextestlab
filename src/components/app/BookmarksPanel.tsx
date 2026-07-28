"use client";

import { BookmarkPlus, GitBranch, LocateFixed, Trash2 } from "lucide-react";
import { useState } from "react";

import type { SessionBookmark } from "@/lib/backtest/types";

export function BookmarksPanel({
  bookmarks,
  currentIndex,
  anonymous,
  busy,
  onAdd,
  onUpdate,
  onDelete,
  onFork,
}: {
  bookmarks: SessionBookmark[];
  currentIndex: number;
  anonymous: boolean;
  busy: boolean;
  onAdd: () => void;
  onUpdate: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onFork: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const jump = (bookmark: SessionBookmark) => {
    window.dispatchEvent(new CustomEvent("forextestlab:jump-to-candle", {
      detail: { time: bookmark.time },
    }));
  };
  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-sm font-semibold">Decision bookmarks</h3><p className="mt-1 text-[11px] app-muted">Save and revisit chart moments without moving the replay clock.</p></div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={onAdd} disabled={busy}><BookmarkPlus size={13} /> Bookmark candle {currentIndex + 1}</button>
          <button type="button" className="btn-primary px-3 py-2 text-xs" onClick={onFork} disabled={busy || anonymous} title={anonymous ? "Sign in to create branches" : undefined}><GitBranch size={13} /> Fork session from here</button>
        </div>
      </div>
      {bookmarks.length ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {[...bookmarks].sort((a, b) => a.index - b.index).map((bookmark) => (
            <article key={bookmark.id} className="rounded-lg border app-border bg-white/[0.02] p-3">
              <div className="flex items-center justify-between text-[10px] app-muted"><span>Candle {bookmark.index + 1}</span><span>{new Date(bookmark.time).toLocaleString()}</span></div>
              <input
                className="app-input mt-2 h-8 w-full text-xs"
                value={drafts[bookmark.id] ?? bookmark.note}
                maxLength={280}
                placeholder="Add a short decision note…"
                onChange={(event) => setDrafts((current) => ({ ...current, [bookmark.id]: event.target.value }))}
                onBlur={(event) => {
                  if (event.target.value !== bookmark.note) onUpdate(bookmark.id, event.target.value);
                }}
              />
              <div className="mt-2 flex justify-end gap-1">
                <button type="button" className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] text-brand-300 hover:bg-brand-400/10" onClick={() => jump(bookmark)}><LocateFixed size={11} /> Show on chart</button>
                <button type="button" aria-label={`Delete bookmark at candle ${bookmark.index + 1}`} className="rounded p-1 text-bear hover:bg-bear/10" onClick={() => onDelete(bookmark.id)}><Trash2 size={12} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="mt-4 text-xs app-muted">No bookmarks yet.</p>}
    </div>
  );
}
