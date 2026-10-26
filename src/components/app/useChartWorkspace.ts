"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ToolKind } from "@/lib/chart/drawing/types";
import type { WorkspacePayload, WorkspaceTemplate } from "@/lib/workspace";
import { mergeToolTemplates, TOOL_TEMPLATES_KEY, type ToolTemplate } from "@/lib/chart/tool-templates";
import { DEFAULT_CHART_SETTINGS, type ChartSettings } from "./ChartSettingsMenu";
import { recordReplayMetric } from "@/lib/performance/replay-metrics";
import { newestChartView, reusableWorkspace, templateView } from "@/lib/chart/workspace-template";

const FAVOURITES_KEY = "forextestlab:fav-tools";
const ORDER_DEFAULTS_KEY = "forextestlab:order-defaults";
const REPLAY_POSITION_KEY = "forextestlab:replay-position";
const HIGH_IMPACT_NEWS_MIGRATION = "high-impact-news-v1";

/**
 * Chart and trading preferences for a session, persisted locally and — for a
 * signed-in trader — synced in the background so a browser change follows them.
 *
 * Named templates reuse appearance, indicators and drawing-tool defaults.
 */
export interface ChartWorkspace {
  /** Local and, when signed in, server preferences have finished restoring. */
  ready: boolean;
  settings: ChartSettings;
  updateSettings: (patch: Partial<ChartSettings>) => void;
  resetSettings: () => void;
  favorites: Set<ToolKind>;
  toggleFavorite: (tool: ToolKind) => void;
  /** Bumped when the server hands back a different set, so charts remount. */
  revision: number;
  templates: WorkspaceTemplate[];
  saveTemplate: (name: string) => Promise<void>;
  applyTemplate: (id: string) => void;
  deleteTemplate: (id: string) => Promise<void>;
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

/**
 * The former default showed medium-impact releases too. Move that legacy
 * default to High once, without overwriting a deliberate All/Low selection.
 * Signed-in workspaces make two passes (local then server), so the marker stays
 * pending until the server payload has had the same migration applied.
 */
function migrateHighImpactNewsDefault(
  storageKey: string,
  settings: Partial<ChartSettings>,
  phase: "local" | "server" | "local-only",
): Partial<ChartSettings> {
  const key = `forextestlab:settings-migration:${storageKey}:${HIGH_IMPACT_NEWS_MIGRATION}`;
  const marker = window.localStorage.getItem(key);
  if (marker === "done") return settings;
  window.localStorage.setItem(key, phase === "local" ? "pending" : "done");
  return settings.economicEventImportance === "medium"
    ? { ...settings, economicEventImportance: "high" }
    : settings;
}

function captureWorkspace(
  storageKey: string,
  symbols: string[],
  settings: ChartSettings,
  favorites: Set<ToolKind>,
): WorkspacePayload {
  const cellViews: Record<string, unknown> = {};
  const prefix = `forextestlab:chart:${storageKey}:`;
  for (const key of Object.keys(window.localStorage)) {
    if (!key.startsWith(prefix)) continue;
    const cell = key.slice(prefix.length);
    if (!/^cell-\d+(?::[A-Z0-9]+)?$/.test(cell)) continue;
    const value = parse<unknown>(window.localStorage.getItem(key), null);
    if (value) cellViews[cell] = value;
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
    individualToolTemplates: parse<ToolTemplate[]>(window.localStorage.getItem(TOOL_TEMPLATES_KEY), []),
    sessionIndicatorDefault: parse<unknown>(window.localStorage.getItem("forextestlab:session-indicator-default"), null),
    defaultChartView: parse<unknown>(window.localStorage.getItem("forextestlab:default-chart-view"), null),
    orderTicketDefaults: parse<WorkspacePayload["orderTicketDefaults"]>(window.localStorage.getItem(ORDER_DEFAULTS_KEY), null),
    replayToolbarPosition: parse<WorkspacePayload["replayToolbarPosition"]>(window.localStorage.getItem(REPLAY_POSITION_KEY), null),
  };
}

function applyWorkspace(storageKey: string, payload: WorkspacePayload) {
  if (Array.isArray(payload.individualToolTemplates)) {
    const local = parse<ToolTemplate[]>(window.localStorage.getItem(TOOL_TEMPLATES_KEY), []);
    window.localStorage.setItem(TOOL_TEMPLATES_KEY, JSON.stringify(mergeToolTemplates(local, payload.individualToolTemplates)));
    window.dispatchEvent(new Event("tool-templates-changed"));
  }
  window.localStorage.setItem(settingsKey(storageKey), JSON.stringify(payload.settings ?? {}));
  window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify(payload.favorites ?? []));
  const layoutKey = `forextestlab:layout:${storageKey}`;
  if (payload.layout) window.localStorage.setItem(layoutKey, JSON.stringify(payload.layout));
  else window.localStorage.removeItem(layoutKey);

  for (let index = 1; index <= 4; index += 1) {
    window.localStorage.removeItem(`forextestlab:chart:${storageKey}:cell-${index}`);
  }
  for (const [cell, view] of Object.entries(payload.cellViews ?? {})) {
    if (!/^cell-\d+(?::[A-Z0-9]+)?$/.test(cell)) continue;
    const key = `forextestlab:chart:${storageKey}:${cell}`;
    const local = parse<unknown>(window.localStorage.getItem(key), null);
    window.localStorage.setItem(key, JSON.stringify(newestChartView(local, view)));
  }

  const drawingsPrefix = `forextestlab:drawings:${storageKey}:`;
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith(drawingsPrefix)) window.localStorage.removeItem(key);
  }
  for (const [symbol, drawings] of Object.entries(payload.drawings ?? {})) {
    window.localStorage.setItem(`forextestlab:drawings:${storageKey}:${symbol}`, JSON.stringify(drawings));
  }

  if (payload.toolDefaults) window.localStorage.setItem("forextestlab:tool-defaults", JSON.stringify(payload.toolDefaults));
  else window.localStorage.removeItem("forextestlab:tool-defaults");
  if (payload.sessionIndicatorDefault) window.localStorage.setItem("forextestlab:session-indicator-default", JSON.stringify(payload.sessionIndicatorDefault));
  if (payload.defaultChartView) window.localStorage.setItem("forextestlab:default-chart-view", JSON.stringify(payload.defaultChartView));
  if (payload.orderTicketDefaults) window.localStorage.setItem(ORDER_DEFAULTS_KEY, JSON.stringify(payload.orderTicketDefaults));
  else window.localStorage.removeItem(ORDER_DEFAULTS_KEY);
  if (payload.replayToolbarPosition) window.localStorage.setItem(REPLAY_POSITION_KEY, JSON.stringify(payload.replayToolbarPosition));
  else window.localStorage.removeItem(REPLAY_POSITION_KEY);
}

export function useChartWorkspace(
  storageKey: string,
  signedIn = false,
  symbols: string[] = [],
): ChartWorkspace {
  const [settings, setSettings] = useState<ChartSettings>(DEFAULT_CHART_SETTINGS);
  const [favorites, setFavorites] = useState<Set<ToolKind>>(new Set());
  const [restoredStorageKey, setRestoredStorageKey] = useState<string | null>(null);
  const restored = restoredStorageKey === storageKey;
  const [serverRestoredStorageKey, setServerRestoredStorageKey] = useState<string | null>(null);
  /**
   * Background sync state, kept internal. Nothing surfaces it: preferences are
   * cheap to re-set and local storage stays authoritative, so a failed sync is
   * not worth a badge in the header the way a lost trade would be.
   */
  const [syncStatus, setSyncStatus] = useState<"local" | "loading" | "saved" | "saving" | "error">(
    signedIn ? "loading" : "local",
  );
  const [revision, setRevision] = useState(0);
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const lastSavedRef = useRef("");
  const savePendingRef = useRef<Promise<void> | null>(null);
  const retryAfterRef = useRef(0);

  useEffect(() => {
    const saved = parse<Partial<ChartSettings> | null>(
      window.localStorage.getItem(settingsKey(storageKey)),
      null,
    ) ?? migrateFromCell(storageKey);
    if (saved) {
      const migrated = migrateHighImpactNewsDefault(
        storageKey,
        saved,
        signedIn ? "local" : "local-only",
      );
      setSettings((current) => ({ ...current, ...migrated }));
    }
    setFavorites(new Set(parse<ToolKind[]>(window.localStorage.getItem(FAVOURITES_KEY), [])));
    setTemplates(parse<WorkspaceTemplate[]>(window.localStorage.getItem("forextestlab:workspace-templates"), []));
    setRestoredStorageKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!restored) return;
    window.localStorage.setItem(settingsKey(storageKey), JSON.stringify(settings));
  }, [restored, storageKey, settings]);

  useEffect(() => {
    if (!signedIn || !restored) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    setSyncStatus("loading");
    setServerRestoredStorageKey(null);
    void fetch("/api/workspace", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json() as { ok?: boolean; workspace?: { payload: WorkspacePayload; updatedAt: string } | null; templates?: WorkspaceTemplate[] };
      if (cancelled) return;
      if (!data.ok) {
        setSyncStatus("error");
        setServerRestoredStorageKey(storageKey);
        return;
      }
      if (data.workspace) {
        applyWorkspace(storageKey, data.workspace.payload);
        setSettings({
          ...DEFAULT_CHART_SETTINGS,
          ...migrateHighImpactNewsDefault(storageKey, data.workspace.payload.settings, "server"),
        });
        setFavorites(new Set((data.workspace.payload.favorites ?? []) as ToolKind[]));
        setRevision((value) => value + 1);
        lastSavedRef.current = JSON.stringify(data.workspace.payload);
      }
      setTemplates(data.templates ?? []);
      window.localStorage.setItem("forextestlab:workspace-templates", JSON.stringify(data.templates ?? []));
      setSyncStatus("saved");
      setServerRestoredStorageKey(storageKey);
    }).catch(() => {
      if (cancelled) return;
      setSyncStatus("error");
      setServerRestoredStorageKey(storageKey);
    }).finally(() => {
      window.clearTimeout(timeout);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [restored, signedIn, storageKey]);

  const payload = useCallback(
    () => captureWorkspace(storageKey, symbols, settings, favorites),
    [favorites, settings, storageKey, symbols],
  );
  const saveWorkspace = useCallback(async () => {
    if (!signedIn) { setSyncStatus("local"); return; }
    if (savePendingRef.current) return savePendingRef.current;
    const task = (async () => {
      const saveStartedAt = performance.now();
      const next = payload();
      setSyncStatus("saving");
      try {
        const response = await fetch("/api/workspace", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save", payload: next }),
        });
        if (!response.ok) throw new Error("Workspace save failed.");
        recordReplayMetric("workspace-save", performance.now() - saveStartedAt);
        lastSavedRef.current = JSON.stringify(next);
        retryAfterRef.current = 0;
        setSyncStatus("saved");
      } catch {
        // Do not hammer a saturated database every two seconds. Local storage
        // remains authoritative until a later background retry succeeds.
        retryAfterRef.current = Date.now() + 15_000;
        setSyncStatus("error");
        // The visible sync status is the error channel. Keeping this promise
        // resolved prevents ignored toolbar saves from becoming unhandled
        // browser rejections.
      }
    })();
    savePendingRef.current = task.finally(() => {
      savePendingRef.current = null;
    });
    return savePendingRef.current;
  }, [payload, signedIn]);

  useEffect(() => {
    if (!signedIn || syncStatus === "loading") return;
    const timer = window.setInterval(() => {
      if (
        document.visibilityState !== "visible" ||
        savePendingRef.current ||
        Date.now() < retryAfterRef.current
      ) return;
      const next = payload();
      if (JSON.stringify(next) !== lastSavedRef.current) {
        void saveWorkspace().catch(() => {});
      }
    }, 5_000);
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

  const persistTemplates = (next: WorkspaceTemplate[]) => {
    window.localStorage.setItem("forextestlab:workspace-templates", JSON.stringify(next));
    setTemplates(next);
  };
  const saveTemplate = async (name: string) => {
    if (!name.trim()) throw new Error("Enter a template name.");
    const nextPayload = reusableWorkspace(payload());
    if (signedIn) {
      const response = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-template", name, payload: nextPayload }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not save the template. Try again.");
      persistTemplates(data.templates);
    } else {
      persistTemplates([...templates.slice(-19), { id: crypto.randomUUID(), name: name.trim().slice(0, 60), payload: nextPayload, updatedAt: new Date().toISOString() }]);
    }
  };
  const deleteTemplate = async (id: string) => {
    if (signedIn) {
      const response = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-template", templateId: id }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not delete the template.");
      persistTemplates(data.templates);
    } else persistTemplates(templates.filter((item) => item.id !== id));
  };
  const applyTemplate = (id: string) => {
    const saved = templates.find((item) => item.id === id)?.payload;
    if (!saved) return;
    const views = Object.entries(saved.cellViews ?? {}).sort(([a], [b]) => Number(b.includes(":")) - Number(a.includes(":")));
    const fallback = templateView(views[0]?.[1]);
    const prefix = `forextestlab:chart:${storageKey}:`;
    for (const key of Object.keys(window.localStorage)) {
      if (!key.startsWith(prefix)) continue;
      const cell = key.slice(prefix.length).split(":")[0];
      const view = views.find(([name]) => name.split(":")[0] === cell)?.[1];
      const existing = parse<Record<string, unknown>>(window.localStorage.getItem(key), {});
      window.localStorage.setItem(key, JSON.stringify({ ...existing, ...templateView(view ?? fallback), preferencesUpdatedAt: Date.now() }));
    }
    window.localStorage.setItem("forextestlab:default-chart-view", JSON.stringify(fallback));
    if (saved.toolDefaults) window.localStorage.setItem("forextestlab:tool-defaults", JSON.stringify(saved.toolDefaults));
    else window.localStorage.removeItem("forextestlab:tool-defaults");
    if (saved.sessionIndicatorDefault) window.localStorage.setItem("forextestlab:session-indicator-default", JSON.stringify(saved.sessionIndicatorDefault));
    setSettings((current) => ({ ...current, ...saved.settings }));
    setFavorites(new Set((saved.favorites ?? []) as ToolKind[]));
    window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify(saved.favorites ?? []));
    setRevision((value) => value + 1);
  };

  return {
    ready: restored && (!signedIn || serverRestoredStorageKey === storageKey),
    settings,
    updateSettings,
    resetSettings,
    favorites,
    toggleFavorite,
    revision,
    templates, saveTemplate, applyTemplate, deleteTemplate,
  };
}
