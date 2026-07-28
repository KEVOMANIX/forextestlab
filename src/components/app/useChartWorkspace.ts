"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ToolKind } from "@/lib/chart/drawing/types";
import type { WorkspacePayload, WorkspaceTemplate } from "@/lib/workspace";
import { EMPTY_WORKSPACE } from "@/lib/workspace";
import { DEFAULT_CHART_SETTINGS, type ChartSettings } from "./ChartSettingsMenu";

const FAVOURITES_KEY = "forextestlab:fav-tools";
const ORDER_DEFAULTS_KEY = "forextestlab:order-defaults";
const REPLAY_POSITION_KEY = "forextestlab:replay-position";

export interface ChartWorkspace {
  settings: ChartSettings;
  updateSettings: (patch: Partial<ChartSettings>) => void;
  resetSettings: () => void;
  favorites: Set<ToolKind>;
  toggleFavorite: (tool: ToolKind) => void;
  syncStatus: "local" | "loading" | "saved" | "saving" | "error";
  templates: WorkspaceTemplate[];
  saveWorkspace: () => Promise<void>;
  resetWorkspace: () => Promise<void>;
  saveTemplate: (name: string) => Promise<void>;
  applyTemplate: (template: WorkspaceTemplate) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  exportWorkspace: () => void;
  importWorkspace: (payload: WorkspacePayload) => Promise<void>;
}

function settingsKey(storageKey: string): string {
  return `forextestlab:chart-settings:${storageKey}`;
}
function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
function migrateFromCell(storageKey: string): Partial<ChartSettings> | null {
  const parsed = parse<{ settings?: Partial<ChartSettings> } | null>(
    window.localStorage.getItem(`forextestlab:chart:${storageKey}:cell-1`),
    null,
  );
  return parsed?.settings ?? null;
}

function captureWorkspace(
  storageKey: string,
  symbols: string[],
  settings: ChartSettings,
  favorites: Set<ToolKind>,
): WorkspacePayload {
  const cellViews: Record<string, unknown> = {};
  for (let index = 1; index <= 4; index += 1) {
    const value = parse<unknown>(window.localStorage.getItem(`forextestlab:chart:${storageKey}:cell-${index}`), null);
    if (value) cellViews[`cell-${index}`] = value;
  }
  const drawings: Record<string, unknown[]> = {};
  for (const symbol of symbols) {
    drawings[symbol] = parse<unknown[]>(window.localStorage.getItem(`forextestlab:drawings:${storageKey}:${symbol}`), []);
  }
  return {
    settings,
    favorites: [...favorites],
    layout: parse<unknown>(window.localStorage.getItem(`forextestlab:layout:${storageKey}`), null),
    cellViews,
    drawings,
    toolDefaults: parse<unknown>(window.localStorage.getItem("forextestlab:tool-defaults"), null),
    orderTicketDefaults: parse<WorkspacePayload["orderTicketDefaults"]>(window.localStorage.getItem(ORDER_DEFAULTS_KEY), null),
    replayToolbarPosition: parse<WorkspacePayload["replayToolbarPosition"]>(window.localStorage.getItem(REPLAY_POSITION_KEY), null),
  };
}

function applyWorkspace(storageKey: string, payload: WorkspacePayload) {
  window.localStorage.setItem(settingsKey(storageKey), JSON.stringify(payload.settings ?? {}));
  window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify(payload.favorites ?? []));
  if (payload.layout) window.localStorage.setItem(`forextestlab:layout:${storageKey}`, JSON.stringify(payload.layout));
  for (const [cell, view] of Object.entries(payload.cellViews ?? {})) {
    window.localStorage.setItem(`forextestlab:chart:${storageKey}:${cell}`, JSON.stringify(view));
  }
  for (const [symbol, drawings] of Object.entries(payload.drawings ?? {})) {
    window.localStorage.setItem(`forextestlab:drawings:${storageKey}:${symbol}`, JSON.stringify(drawings));
  }
  if (payload.toolDefaults) window.localStorage.setItem("forextestlab:tool-defaults", JSON.stringify(payload.toolDefaults));
  if (payload.orderTicketDefaults) window.localStorage.setItem(ORDER_DEFAULTS_KEY, JSON.stringify(payload.orderTicketDefaults));
  if (payload.replayToolbarPosition) window.localStorage.setItem(REPLAY_POSITION_KEY, JSON.stringify(payload.replayToolbarPosition));
}

export function useChartWorkspace(
  storageKey: string,
  signedIn = false,
  symbols: string[] = [],
): ChartWorkspace {
  const [settings, setSettings] = useState<ChartSettings>(DEFAULT_CHART_SETTINGS);
  const [favorites, setFavorites] = useState<Set<ToolKind>>(new Set());
  const [restored, setRestored] = useState(false);
  const [syncStatus, setSyncStatus] = useState<ChartWorkspace["syncStatus"]>(signedIn ? "loading" : "local");
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const lastSavedRef = useRef("");

  useEffect(() => {
    const saved = parse<Partial<ChartSettings> | null>(
      window.localStorage.getItem(settingsKey(storageKey)),
      null,
    ) ?? migrateFromCell(storageKey);
    if (saved) setSettings((current) => ({ ...current, ...saved }));
    setFavorites(new Set(parse<ToolKind[]>(window.localStorage.getItem(FAVOURITES_KEY), [])));
    setRestored(true);
  }, [storageKey]);

  useEffect(() => {
    if (!restored) return;
    window.localStorage.setItem(settingsKey(storageKey), JSON.stringify(settings));
  }, [restored, storageKey, settings]);

  useEffect(() => {
    if (!signedIn || !restored) return;
    let cancelled = false;
    void fetch("/api/workspace", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as { ok?: boolean; workspace?: { payload: WorkspacePayload; updatedAt: string } | null; templates?: WorkspaceTemplate[] };
      if (cancelled || !data.ok) { setSyncStatus("error"); return; }
      setTemplates(data.templates ?? []);
      if (data.workspace) {
        const marker = `forextestlab:workspace-applied:${storageKey}`;
        if (window.sessionStorage.getItem(marker) !== data.workspace.updatedAt) {
          applyWorkspace(storageKey, data.workspace.payload);
          window.sessionStorage.setItem(marker, data.workspace.updatedAt);
          window.location.reload();
          return;
        }
        lastSavedRef.current = JSON.stringify(data.workspace.payload);
      }
      setSyncStatus("saved");
    }).catch(() => setSyncStatus("error"));
    return () => { cancelled = true; };
  }, [restored, signedIn, storageKey]);

  const payload = useCallback(
    () => captureWorkspace(storageKey, symbols, settings, favorites),
    [favorites, settings, storageKey, symbols],
  );
  const saveWorkspace = useCallback(async () => {
    if (!signedIn) { setSyncStatus("local"); return; }
    const next = payload();
    setSyncStatus("saving");
    const response = await fetch("/api/workspace", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", payload: next }),
    });
    if (!response.ok) { setSyncStatus("error"); throw new Error("Workspace save failed."); }
    lastSavedRef.current = JSON.stringify(next);
    setSyncStatus("saved");
  }, [payload, signedIn]);

  useEffect(() => {
    if (!signedIn || syncStatus === "loading") return;
    const timer = window.setInterval(() => {
      const next = payload();
      if (JSON.stringify(next) !== lastSavedRef.current) void saveWorkspace();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [payload, saveWorkspace, signedIn, syncStatus]);

  const updateSettings = useCallback((patch: Partial<ChartSettings>) => setSettings((current) => ({ ...current, ...patch })), []);
  const resetSettings = useCallback(() => setSettings(DEFAULT_CHART_SETTINGS), []);
  const toggleFavorite = useCallback((tool: ToolKind) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(tool)) next.delete(tool); else next.add(tool);
      window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const resetWorkspace = useCallback(async () => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("forextestlab:chart:") || key.startsWith("forextestlab:chart-settings:") || key.startsWith("forextestlab:layout:") || key.startsWith("forextestlab:drawings:") || key === FAVOURITES_KEY || key === ORDER_DEFAULTS_KEY || key === REPLAY_POSITION_KEY) window.localStorage.removeItem(key);
    }
    if (signedIn) await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset" }) });
    window.location.reload();
  }, [signedIn]);
  const saveTemplate = useCallback(async (name: string) => {
    const response = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-template", name, payload: payload() }) });
    const data = await response.json() as { templates?: WorkspaceTemplate[] };
    if (!response.ok) throw new Error("Template could not be saved.");
    setTemplates(data.templates ?? []);
  }, [payload]);
  const applyTemplate = useCallback(async (template: WorkspaceTemplate) => {
    applyWorkspace(storageKey, template.payload);
    if (signedIn) await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", payload: template.payload }) });
    window.location.reload();
  }, [signedIn, storageKey]);
  const deleteTemplate = useCallback(async (id: string) => {
    const response = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete-template", templateId: id }) });
    const data = await response.json() as { templates?: WorkspaceTemplate[] };
    setTemplates(data.templates ?? []);
  }, []);
  const exportWorkspace = useCallback(() => {
    const blob = new Blob([JSON.stringify(payload(), null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = "forextestlab-workspace.json"; link.click();
    URL.revokeObjectURL(link.href);
  }, [payload]);
  const importWorkspace = useCallback(async (next: WorkspacePayload) => {
    applyWorkspace(storageKey, { ...EMPTY_WORKSPACE, ...next });
    if (signedIn) await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", payload: next }) });
    window.location.reload();
  }, [signedIn, storageKey]);

  return { settings, updateSettings, resetSettings, favorites, toggleFavorite, syncStatus, templates, saveWorkspace, resetWorkspace, saveTemplate, applyTemplate, deleteTemplate, exportWorkspace, importWorkspace };
}
