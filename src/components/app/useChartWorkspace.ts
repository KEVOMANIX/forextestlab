"use client";

import { useCallback, useEffect, useState } from "react";

import type { ToolKind } from "@/lib/chart/drawing/types";
import { DEFAULT_CHART_SETTINGS, type ChartSettings } from "./ChartSettingsMenu";

/**
 * Chart preferences shared by every chart in the workspace.
 *
 * Appearance, what is drawn on the chart, the time zone and the favourite
 * drawing tools belong to the workspace rather than to one cell: adding a
 * second chart should give you the same chart you were already looking at, and
 * recolouring or starring a tool should land on all of them at once. What stays
 * per cell is what makes a cell distinct — its symbol, timeframe, chart type,
 * indicators and scroll position.
 */

const FAVOURITES_KEY = "forextestlab:fav-tools";

export interface ChartWorkspace {
  settings: ChartSettings;
  updateSettings: (patch: Partial<ChartSettings>) => void;
  resetSettings: () => void;
  favorites: Set<ToolKind>;
  toggleFavorite: (tool: ToolKind) => void;
}

function settingsKey(storageKey: string): string {
  return `forextestlab:chart-settings:${storageKey}`;
}

/** Settings a chart cell saved before preferences moved up to the workspace. */
function migrateFromCell(storageKey: string): Partial<ChartSettings> | null {
  try {
    const raw = window.localStorage.getItem(`forextestlab:chart:${storageKey}:cell-1`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { settings?: Partial<ChartSettings> };
    return parsed.settings ?? null;
  } catch {
    return null;
  }
}

export function useChartWorkspace(storageKey: string): ChartWorkspace {
  const [settings, setSettings] = useState<ChartSettings>(DEFAULT_CHART_SETTINGS);
  const [favorites, setFavorites] = useState<Set<ToolKind>>(new Set());
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(settingsKey(storageKey));
      const saved = raw ? (JSON.parse(raw) as Partial<ChartSettings>) : migrateFromCell(storageKey);
      if (saved) setSettings((current) => ({ ...current, ...saved }));
    } catch {
      // Malformed preferences fall back to the defaults.
    }
    try {
      const raw = window.localStorage.getItem(FAVOURITES_KEY);
      if (raw) setFavorites(new Set(JSON.parse(raw) as ToolKind[]));
    } catch {
      // Ignore malformed favourites.
    }
    setRestored(true);
  }, [storageKey]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(settingsKey(storageKey), JSON.stringify(settings));
    } catch {
      // Persistence is a convenience, not a requirement.
    }
  }, [restored, storageKey, settings]);

  const updateSettings = useCallback((patch: Partial<ChartSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const resetSettings = useCallback(() => setSettings(DEFAULT_CHART_SETTINGS), []);

  const toggleFavorite = useCallback((tool: ToolKind) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      try {
        // Favourites are a global preference, not a per-session one.
        window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify([...next]));
      } catch {
        // Best effort.
      }
      return next;
    });
  }, []);

  return { settings, updateSettings, resetSettings, favorites, toggleFavorite };
}
