"use client";

import { useEffect, useRef, useState } from "react";
import { TOOL_TEMPLATES_KEY, type ToolTemplate } from "@/lib/chart/tool-templates";

function readTemplates(): ToolTemplate[] {
  try { const value = JSON.parse(localStorage.getItem(TOOL_TEMPLATES_KEY) ?? "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
}

/** Shared by every indicator and drawing editor; scope keeps each tool independent. */
export function ToolTemplateMenu<T>({ scope, value, onApply, onDefaults }: {
  scope: string;
  value: T;
  onApply: (value: T) => void;
  onDefaults: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(true);
  const [alignRight, setAlignRight] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [templates, setTemplates] = useState<ToolTemplate[]>([]);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const refresh = () => setTemplates(readTemplates());
    refresh();
    window.addEventListener("tool-templates-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("tool-templates-changed", refresh); window.removeEventListener("storage", refresh); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const persist = (next: ToolTemplate[]) => {
    try {
      localStorage.setItem(TOOL_TEMPLATES_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("tool-templates-changed"));
      return true;
    } catch { setMessage("Could not save. Browser storage is full or unavailable."); return false; }
  };
  const save = () => {
    if (!name.trim()) return;
    const all = readTemplates();
    const existing = all.find(item => item.scope === scope && !item.deleted && item.name.toLowerCase() === name.trim().toLowerCase());
    const item: ToolTemplate = { id: existing?.id ?? crypto.randomUUID(), scope, name: name.trim().slice(0, 60), settings: structuredClone(value), updatedAt: Date.now() };
    if (persist([...all.filter(saved => saved.id !== item.id), item])) { setSaving(false); setName(""); setMessage("Template saved."); }
  };
  return <div ref={root} className="relative text-xs" onKeyDown={event => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); } }}>
    <button type="button" aria-expanded={open} onClick={() => {
      const rect = root.current?.getBoundingClientRect();
      if (rect) { setAbove(rect.top > 320); setAlignRight(rect.left + 240 > window.innerWidth - 12); }
      setOpen(!open); setMessage("");
    }} className="h-8 rounded-md border app-border px-2.5 font-medium hover:bg-[var(--app-panel-2)]">Template <span aria-hidden>⌄</span></button>
    {open && <div className="absolute z-[70] w-60 rounded-lg border app-border bg-[var(--app-panel-solid)] p-1.5 shadow-xl" style={{ ...(above ? { bottom: "100%", marginBottom: 8 } : { top: "100%", marginTop: 8 }), ...(alignRight ? { right: 0 } : { left: 0 }) }}>
      {saving ? <form className="space-y-2 p-2" onSubmit={event => { event.preventDefault(); save(); }}>
        <label className="block">Template name<input autoFocus aria-label="Template name" maxLength={60} value={name} onChange={event => setName(event.target.value)} className="mt-2 h-8 w-full rounded border app-border bg-[var(--app-panel-2)] px-2" /></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setSaving(false)} className="px-2 py-1">Cancel</button><button disabled={!name.trim()} className="rounded bg-brand-400 px-3 py-1 text-surface-950 disabled:opacity-40">Save</button></div>
      </form> : <button type="button" onClick={() => setSaving(true)} className="w-full rounded px-2 py-2 text-left hover:bg-[var(--app-panel-2)]">Save as…</button>}
      <button type="button" onClick={() => { onDefaults(); setOpen(false); }} className="w-full rounded px-2 py-2 text-left hover:bg-[var(--app-panel-2)]">Apply defaults</button>
      <div className="mt-1 max-h-48 overflow-y-auto border-t app-border pt-1">
        {templates.filter(item => item.scope === scope && !item.deleted).map(item => <div key={item.id} className="flex items-center rounded hover:bg-[var(--app-panel-2)]">
          <button type="button" onClick={() => { onApply(structuredClone(item.settings) as T); setOpen(false); }} className="min-w-0 flex-1 truncate px-2 py-2 text-left" title={item.name}>{item.name}</button>
          <button type="button" aria-label={`Delete template ${item.name}`} onClick={() => persist(readTemplates().map(saved => saved.id === item.id ? { ...saved, deleted: true, updatedAt: Date.now() } : saved))} className="px-2 py-2 app-muted hover:text-loss">×</button>
        </div>)}
        {!templates.some(item => item.scope === scope && !item.deleted) && <p className="px-2 py-2 app-muted">No templates saved for this tool.</p>}
      </div>
      {message && <p role="status" className="px-2 py-2 app-muted">{message}</p>}
    </div>}
  </div>;
}
