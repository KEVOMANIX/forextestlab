"use client";

import { Download, LayoutTemplate, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import type { WorkspacePayload } from "@/lib/workspace";
import type { ChartWorkspace } from "./useChartWorkspace";

export function WorkspaceManager({ workspace, signedIn }: { workspace: ChartWorkspace; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex h-8 items-center gap-1.5 rounded-md border app-border px-2 text-[11px] font-semibold hover:border-brand-400/40" aria-expanded={open}>
        <LayoutTemplate size={13} /> Workspace
        <span className={`h-1.5 w-1.5 rounded-full ${workspace.syncStatus === "error" ? "bg-bear" : workspace.syncStatus === "saving" || workspace.syncStatus === "loading" ? "bg-amber-300" : "bg-brand-400"}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-[80] w-72 rounded-xl border app-border bg-[var(--app-panel)] p-3 shadow-2xl">
          <p className="text-xs font-semibold">Workspace synchronization</p>
          <p className="mt-1 text-[10px] app-muted">{signedIn ? "Saved to your account and shared across browser profiles." : "Guest workspace is stored in this browser only."}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="btn-primary px-2 py-2 text-[10px]" onClick={() => void workspace.saveWorkspace()}><Save size={12} /> Save workspace</button>
            <button type="button" className="btn-secondary px-2 py-2 text-[10px]" onClick={() => void workspace.resetWorkspace()}><RotateCcw size={12} /> Reset</button>
            <button type="button" className="btn-secondary px-2 py-2 text-[10px]" onClick={workspace.exportWorkspace}><Download size={12} /> Export</button>
            <button type="button" className="btn-secondary px-2 py-2 text-[10px]" onClick={() => fileRef.current?.click()}><Upload size={12} /> Import</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void file.text().then((text) => workspace.importWorkspace(JSON.parse(text) as WorkspacePayload));
          }} />
          {signedIn && (
            <>
              <div className="mt-3 flex gap-1">
                <input className="app-input h-8 min-w-0 flex-1 text-xs" value={name} onChange={(event) => setName(event.target.value)} placeholder="Template name" maxLength={60} />
                <button type="button" className="rounded bg-brand-500 px-2 text-[10px] font-semibold text-surface-950 disabled:opacity-40" disabled={!name.trim()} onClick={() => { void workspace.saveTemplate(name); setName(""); }}>Save</button>
              </div>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {workspace.templates.map((template) => (
                  <div key={template.id} className="flex items-center gap-1 rounded-lg border app-border p-1.5">
                    <button type="button" onClick={() => void workspace.applyTemplate(template)} className="min-w-0 flex-1 truncate text-left text-[11px] hover:text-brand-300">{template.name}</button>
                    <button type="button" aria-label={`Delete workspace template ${template.name}`} onClick={() => void workspace.deleteTemplate(template.id)} className="p-1 text-bear"><Trash2 size={11} /></button>
                  </div>
                ))}
                {!workspace.templates.length && <p className="py-2 text-center text-[10px] app-muted">No named templates yet.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
