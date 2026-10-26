"use client";

import { useState } from "react";
import type { ChartWorkspace } from "./useChartWorkspace";

export function WorkspaceTemplates({ workspace }: { workspace: ChartWorkspace }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setMessage("");
    try { await action(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <div><h3 className="font-semibold">Chart templates</h3>
      <p className="mt-1 text-xs opacity-70">Save indicators, session times, colours, favourite tools and drawing styles. Apply them to your current charts; existing drawings stay on their own symbols.</p></div>
    <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void run(async () => { await workspace.saveTemplate(name); setName(""); }, "Template saved."); }}>
      <input aria-label="Template name" placeholder="e.g. London session" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} className="min-w-0 flex-1 rounded-md border app-border bg-transparent px-3 py-2" />
      <button disabled={busy || !name.trim()} className="rounded-md bg-brand-400 px-3 py-2 font-semibold text-surface-950 disabled:opacity-40">Save template</button>
    </form>
    <p role="status" className="text-xs">{message}</p>
    {workspace.templates.length === 0 && <p className="text-sm opacity-60">Your saved templates will appear here.</p>}
    {workspace.templates.map((template) => <div key={template.id} className="flex flex-wrap items-center gap-2 border-b app-border py-3">
      <span className="min-w-0 flex-1 break-words font-medium">{template.name}</span>
      <button disabled={busy} onClick={() => { workspace.applyTemplate(template.id); setMessage(`Applied ${template.name}.`); }} className="rounded-md border app-border px-3 py-1.5 hover:bg-brand-400/10">Apply</button>
      <button disabled={busy} onClick={() => void run(() => workspace.deleteTemplate(template.id), "Template deleted.")} className="px-2 py-1.5 text-xs opacity-70 hover:opacity-100">Delete</button>
    </div>)}
  </div>;
}
