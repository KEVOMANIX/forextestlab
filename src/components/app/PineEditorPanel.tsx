"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, CircleCheck, Code2, ExternalLink, FilePlus2, Loader2, Play, Save, X } from "lucide-react";
import { readPineScripts, PINE_SCRIPTS_CHANGED, type PineScript } from "@/lib/chart/pine-scripts";
import type { PineRunStatus } from "./usePineIndicators";

const StrategyCodeEditor = dynamic(() => import("./StrategyCodeEditor").then(module => module.StrategyCodeEditor), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center bg-[#0b100e] text-sm text-[#a7bcb0]">Loading editor…</div>,
});

const WIDTH_KEY = "forextestlab:pine-editor-width:v2";
const MIN_WIDTH = 340;

export type PineEditorDraft = {
  /** Chart indicator this draft is attached to, once it has been added. */
  instanceId: string | null;
  scriptId: string | null;
  name: string;
  code: string;
  /** Code as last saved to My scripts, to show unsaved changes. */
  savedCode: string | null;
};

function clock(time: number) {
  return new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * TradingView-style Pine Editor docked beside the chart: the script source,
 * Save, and Add/Update on chart, with a console underneath for results.
 */
export function PineEditorPanel({
  draft,
  onDraftChange,
  onSave,
  onApply,
  onOpenScript,
  onNew,
  onClose,
  onChart,
  status,
  docked,
}: {
  draft: PineEditorDraft;
  onDraftChange: (patch: Partial<PineEditorDraft>) => void;
  onSave: () => void;
  onApply: () => void;
  onOpenScript: (script: PineScript) => void;
  onNew: () => void;
  onClose: () => void;
  /** Whether the draft's indicator is currently on the chart. */
  onChart: boolean;
  status: PineRunStatus | undefined;
  /** Docked in the workspace column (true) or floating over the chart. */
  docked: boolean;
}) {
  const [width, setWidth] = useState(760);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [scripts, setScripts] = useState<PineScript[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const unsaved = draft.savedCode !== draft.code;
  const outOfDate = onChart && status?.code !== draft.code;
  const current = status && status.code === draft.code ? status : undefined;

  useEffect(() => {
    try { const saved = Number(localStorage.getItem(WIDTH_KEY)); if (saved >= MIN_WIDTH) setWidth(saved); } catch { /* Use the default width. */ }
    const load = () => setScripts(readPineScripts());
    load();
    window.addEventListener(PINE_SCRIPTS_CHANGED, load);
    return () => window.removeEventListener(PINE_SCRIPTS_CHANGED, load);
  }, []);

  function startResize(event: React.PointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const max = Math.max(MIN_WIDTH, window.innerWidth * 0.8);
    let latest = startWidth;
    const move = (moveEvent: PointerEvent) => { latest = Math.round(Math.min(max, Math.max(MIN_WIDTH, startWidth + startX - moveEvent.clientX))); setWidth(latest); };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try { localStorage.setItem(WIDTH_KEY, String(latest)); } catch { /* Width is a convenience. */ }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const applyLabel = onChart ? "Update on chart" : "Add to chart";

  return (
    <div
      ref={rootRef}
      role="complementary"
      aria-label="Pine Editor"
      data-testid="pine-editor-panel"
      onKeyDownCapture={(event) => {
        const mod = event.ctrlKey || event.metaKey;
        if (mod && event.key.toLowerCase() === "s") { event.preventDefault(); onSave(); }
        else if (mod && event.key === "Enter") { event.preventDefault(); event.stopPropagation(); onApply(); }
      }}
      className={`flex h-full min-h-0 shrink-0 flex-col border-l app-border bg-[var(--app-panel-solid)] text-[var(--app-text)] shadow-[-16px_0_40px_rgba(0,0,0,0.35)] animate-[pine-drawer-in_160ms_ease-out] ${docked ? "relative" : "absolute right-0 top-0 z-40"}`}
      style={{ width: `min(${width}px, 100%)` }}
    >
      <div role="separator" aria-orientation="vertical" aria-label="Resize Pine Editor" onPointerDown={startResize} className="absolute -left-1 top-0 z-10 hidden h-full w-2 cursor-col-resize hover:bg-brand-400/30 sm:block" />

      <div className="flex min-h-11 items-center gap-1 border-b app-border px-2">
        <Code2 size={16} className="ml-1 shrink-0 text-[var(--app-accent-text)]" aria-hidden />
        <div className="relative min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              defaultValue={draft.name}
              aria-label="Script name"
              maxLength={80}
              onBlur={(event) => { const name = event.currentTarget.value.trim(); if (name) onDraftChange({ name }); setRenaming(false); }}
              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setRenaming(false); }}
              className="h-8 w-full rounded border app-border bg-[var(--app-bg)] px-2 text-sm font-semibold outline-none focus:border-brand-400"
            />
          ) : (
            <button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-haspopup="menu" className="flex h-8 max-w-full items-center gap-1 rounded px-2 text-sm font-semibold hover:bg-[var(--app-panel-2)]" title="Open script">
              <span className="truncate">{draft.name}</span>
              {unsaved && <span className="shrink-0 app-muted" title="Unsaved changes">•</span>}
              <ChevronDown size={14} className="shrink-0 app-muted" aria-hidden />
            </button>
          )}
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div role="menu" className="absolute left-0 top-9 z-50 max-h-80 w-64 overflow-y-auto rounded-lg border app-border bg-[var(--app-panel-solid)] p-1 text-sm shadow-xl">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setRenaming(true); }} className="block w-full rounded px-3 py-2 text-left hover:bg-[var(--app-panel-2)]">Rename…</button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onNew(); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-[var(--app-panel-2)]"><FilePlus2 size={14} aria-hidden />New indicator</button>
                <a role="menuitem" href={draft.scriptId ? `/app/strategies?script=${encodeURIComponent(draft.scriptId)}` : "/app/strategies"} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-[var(--app-panel-2)]"><ExternalLink size={14} aria-hidden />Open in Strategy Lab</a>
                {scripts.length > 0 && <div className="mt-1 border-t app-border px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide app-muted">My scripts</div>}
                {scripts.map(script => (
                  <button key={script.id} type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenScript(script); }} className="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left hover:bg-[var(--app-panel-2)]">
                    <span className="truncate">{script.name}</span>
                    {script.id === draft.scriptId && <Check size={14} className="shrink-0 text-[var(--app-accent-text)]" aria-hidden />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button type="button" onClick={onSave} title="Save script (Ctrl+S)" className="inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold hover:bg-[var(--app-panel-2)]">
          <Save size={14} aria-hidden />{unsaved ? "Save" : "Saved"}
        </button>
        <button type="button" onClick={onApply} title={`${applyLabel} (Ctrl+Enter)`} className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold ${outOfDate || !onChart ? "bg-brand-500 text-white hover:bg-brand-600" : "hover:bg-[var(--app-panel-2)]"}`}>
          {status?.state === "loading" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />}
          <span className="hidden sm:inline">{applyLabel}</span>
        </button>
        <button type="button" onClick={onClose} aria-label="Close Pine Editor" title="Close" className="grid size-8 place-items-center rounded app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]">
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <StrategyCodeEditor value={draft.code} onChange={(code) => onDraftChange({ code })} serverDiagnostics={current?.diagnostics ?? []} mode="pine" minimap={false} />
      </div>

      <div className="max-h-40 min-h-[4.5rem] shrink-0 overflow-y-auto border-t app-border px-3 py-2 font-mono text-[11.5px] leading-5" aria-live="polite" data-testid="pine-console">
        {!onChart && !status && <p className="app-muted">Press <b>Add to chart</b> to run this script on the chart.</p>}
        {status?.state === "loading" && <p className="flex items-center gap-1.5 app-muted"><Loader2 size={12} className="animate-spin" aria-hidden />Compiling and running…</p>}
        {status?.state === "ready" && status.ranAt && <p className="flex items-center gap-1.5 text-[var(--app-accent-text)]"><CircleCheck size={12} aria-hidden /><span className="app-muted">{clock(status.ranAt)}</span>Added to chart · {status.report?.plots.length ?? 0} plot{status.report?.plots.length === 1 ? "" : "s"}</p>}
        {status?.state === "error" && <>
          <p className="flex items-start gap-1.5 text-loss"><AlertCircle size={12} className="mt-1 shrink-0" aria-hidden /><span>{status.ranAt && <span className="app-muted">{clock(status.ranAt)} </span>}{status.error}</span></p>
          {status.diagnostics?.map((issue, index) => <p key={index} className="pl-[18px] text-loss">Line {issue.line}: {issue.message}</p>)}
        </>}
        {outOfDate && status?.state !== "loading" && <p className="mt-1 app-muted">The chart is showing an older version. Press <b>Update on chart</b> to apply your edits.</p>}
      </div>
    </div>
  );
}
