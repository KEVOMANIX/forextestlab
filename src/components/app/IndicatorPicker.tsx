"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Braces, Plus, Search, Star, X } from "lucide-react";
import { CATEGORY_LABELS, CATEGORY_ORDER, defsByCategory, type IndCategory } from "@/lib/chart/indicator-defs";
import { readPineScripts, type PineScript } from "@/lib/chart/pine-scripts";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";

const FAVORITES_KEY = "forextestlab:indicator-favorites";
const catalog = CATEGORY_ORDER.flatMap(defsByCategory);
type Section = "all" | "favorites" | "scripts" | IndCategory;

export function IndicatorPicker({ onClose, onSelect, onSelectScript, onEditScript, onCreateScript, theme }: { onClose: () => void; onSelect: (kind: string) => void; onSelectScript: (script: PineScript) => void; onEditScript: (script: PineScript) => void; onCreateScript: () => void; theme: "dark" | "light" }) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<Section>("all");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [scripts, setScripts] = useState<PineScript[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const dialogRef = useModalBehavior<HTMLDivElement>({ open: true, onClose, initialFocus: searchRef });

  useEffect(() => {
    setScripts(readPineScripts());
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
      if (Array.isArray(saved)) setFavorites(saved.filter((kind): kind is string => typeof kind === "string" && catalog.some((def) => def.kind === kind)));
    } catch { /* An invalid saved list starts empty. */ }
  }, []);

  function toggleFavorite(kind: string) {
    const next = favorites.includes(kind) ? favorites.filter((item) => item !== kind) : [...favorites, kind];
    setFavorites(next);
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch { /* Keep usable when storage is unavailable. */ }
  }

  const search = query.trim().toLowerCase();
  const results = catalog.filter((def) =>
    (section === "all" || (section === "favorites" ? favorites.includes(def.kind) : def.category === section)) &&
    (!search || `${def.name} ${def.kind}`.toLowerCase().includes(search)),
  );
  const navigation: { id: Section; label: string }[] = [
    { id: "favorites", label: "Favorites" }, { id: "scripts", label: "My scripts" }, { id: "all", label: "All indicators" },
    ...CATEGORY_ORDER.map((id) => ({ id, label: CATEGORY_LABELS[id] })),
  ];

  return createPortal(
    <div className={`app-theme-surface ${theme === "light" ? "light" : ""} fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3 sm:p-6`} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="flex h-[560px] max-h-[calc(100dvh-24px)] w-full max-w-[800px] flex-col overflow-hidden rounded-xl border app-border bg-[var(--app-panel-solid)] text-[var(--app-text)] shadow-2xl">
        <header className="flex items-center justify-between px-5 pb-3 pt-5">
          <h2 id={titleId} className="text-lg font-semibold">Indicators</h2>
          <button type="button" aria-label="Close indicators" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md app-muted hover:bg-[var(--app-panel-2)]"><X size={20} /></button>
        </header>
        <label className="mx-5 mb-4 flex items-center gap-2 rounded-md border app-border px-3 focus-within:border-brand-400">
          <Search size={17} className="shrink-0 app-muted" aria-hidden />
          <input ref={searchRef} aria-label="Search indicators" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search indicators" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:ring-0 focus-visible:ring-offset-0" />
          {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); searchRef.current?.focus(); }} className="grid h-8 w-8 place-items-center app-muted"><X size={15} /></button>}
        </label>
        <div className="flex min-h-0 flex-1 flex-col border-t app-border sm:flex-row">
          <nav aria-label="Indicator categories" className="flex shrink-0 gap-1 overflow-x-auto border-b app-border p-2 sm:w-44 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r sm:p-3">
            {navigation.map((item) => <button key={item.id} type="button" aria-pressed={section === item.id} onClick={() => setSection(item.id)}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2.5 text-left text-sm ${section === item.id ? "bg-[var(--app-panel-2)] font-semibold text-[var(--app-text)]" : "app-muted hover:bg-[var(--app-panel-2)]"}`}>
              {item.id === "favorites" && <Star size={16} aria-hidden />}{item.label}
            </button>)}
          </nav>
          <section aria-label="Available indicators" className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between px-2 text-xs app-muted"><span>{navigation.find((item) => item.id === section)?.label}</span><span aria-live="polite">{section === "scripts" ? scripts.length : results.length} items</span></div>
            {section === "scripts" && <><button type="button" onClick={onCreateScript} className="mb-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-[var(--app-accent-text)] hover:bg-[var(--app-panel-2)]"><Plus size={15} aria-hidden />Create new indicator</button>{scripts.length === 0 && <p className="px-3 py-2 text-sm app-muted">Scripts you save in the Pine Editor appear here.</p>}{scripts.filter(script => !search || script.name.toLowerCase().includes(search)).map(script => <div key={script.id} className="group flex items-center justify-between rounded-md hover:bg-[var(--app-panel-2)]"><button type="button" onClick={() => onSelectScript(script)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm">{script.name}</button><button type="button" title="Source code" aria-label={`Source code of ${script.name}`} onClick={() => onEditScript(script)} className="mr-1 grid size-8 place-items-center rounded app-muted hover:bg-[var(--app-panel)] hover:text-[var(--app-text)]"><Braces size={14} aria-hidden /></button></div>)}</>}
            {results.map((def) => {
              const starred = favorites.includes(def.kind);
              return <div key={def.kind} className="group flex items-center rounded-md hover:bg-[var(--app-panel-2)]">
                <button type="button" aria-label={`${starred ? "Remove" : "Add"} ${def.name} ${starred ? "from" : "to"} favorites`} aria-pressed={starred} onClick={() => toggleFavorite(def.kind)} className={`grid h-11 w-10 shrink-0 place-items-center rounded-md ${starred ? "text-brand-300" : "app-muted hover:text-[var(--app-text)]"}`}>
                  <Star size={17} fill={starred ? "currentColor" : "none"} />
                </button>
                <button type="button" onClick={() => onSelect(def.kind)} title={def.description} className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 py-2 pl-1 pr-3 text-left text-sm">
                  <span className="min-w-0">{def.name}</span><span className="hidden shrink-0 text-xs app-muted sm:block">{CATEGORY_LABELS[def.category]}</span>
                </button>
              </div>;
            })}
            {results.length === 0 && <div className="px-4 py-14 text-center text-sm app-muted">{search ? "No matching indicators." : "Star indicators to find them here."}</div>}
          </section>
        </div>
      </div>
    </div>, document.body,
  );
}
