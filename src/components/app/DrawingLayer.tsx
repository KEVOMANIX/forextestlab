"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, CopyPlus, Eye, EyeOff, Lock, LockOpen, Settings2, SendToBack, SquareStack, Trash2 } from "lucide-react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";

import { DrawingEngine, type ContextMenuRequest } from "@/lib/chart/drawing/engine";
import type { Candle } from "@/lib/chart/drawing/coords";
import type { DrawingJSON, MagnetMode, ToolKind } from "@/lib/chart/drawing/types";
import { DrawingSettingsDialog } from "./DrawingSettingsDialog";

interface Props {
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType> | null;
  tool: ToolKind | null;
  magnet: MagnetMode;
  precision: number;
  pipSize: number;
  timeframe: string;
  timeframes: string[];
  candles: Candle[];
  viewVersion: number;
  onToolConsumed: () => void;
  onCountChange?: (count: number) => void;
  engineRef?: React.MutableRefObject<DrawingEngine | null>;
  storageKey?: string;
}

export function DrawingLayer({
  chart,
  series,
  tool,
  magnet,
  precision,
  pipSize,
  timeframe,
  timeframes,
  candles,
  viewVersion,
  onToolConsumed,
  onCountChange,
  engineRef,
  storageKey,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineInstance = useRef<DrawingEngine | null>(null);
  const savedRef = useRef<DrawingJSON[]>([]);
  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  const [settings, setSettings] = useState<DrawingJSON | null>(null);
  const [menu, setMenu] = useState<ContextMenuRequest | null>(null);
  const [selection, setSelection] = useState<DrawingJSON | null>(null);

  // Create / dispose the engine with the chart lifecycle.
  useEffect(() => {
    if (!chart || !series || !hostRef.current) return;
    const key = storageKey ? `forextestlab:drawings:${storageKey}` : null;
    const engine = new DrawingEngine(chart, series, hostRef.current);
    // Per-tool style memory persists globally (shared across sessions/pairs).
    const TOOL_DEFAULTS_KEY = "forextestlab:tool-defaults";
    try {
      const rawDefaults = window.localStorage.getItem(TOOL_DEFAULTS_KEY);
      if (rawDefaults) engine.loadToolDefaults(JSON.parse(rawDefaults));
    } catch {
      // Ignore malformed tool defaults.
    }
    engine.onToolDefaultsChange = (defaults) => {
      try {
        window.localStorage.setItem(TOOL_DEFAULTS_KEY, JSON.stringify(defaults));
      } catch {
        // Best-effort.
      }
    };
    let initial = savedRef.current;
    if (key) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) initial = JSON.parse(raw) as DrawingJSON[];
      } catch {
        // Malformed persisted drawings are ignored.
      }
    }
    engine.load(initial);
    const persist = () => {
      if (!key) return;
      try {
        window.localStorage.setItem(key, JSON.stringify(engine.serialize()));
      } catch {
        // Persistence is best-effort.
      }
    };
    engine.onOpenSettings = (json) => setSettings(json);
    engine.onContextMenu = (req) => setMenu(req);
    engine.onToolConsumed = () => onToolConsumed();
    engine.onSelectionChange = (json) => {
      setSelection(json);
      persist();
    };
    engine.onObjectsChange = (n) => {
      onCountChange?.(n);
      persist();
    };
    engineInstance.current = engine;
    if (engineRef) engineRef.current = engine;
    return () => {
      savedRef.current = engine.serialize();
      engine.destroy();
      engineInstance.current = null;
      if (engineRef) engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series, storageKey]);

  // Push environment on every relevant change.
  useEffect(() => {
    engineInstance.current?.setEnv({ tool, magnet, precision, pipSize, timeframe, candles: candlesRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, magnet, precision, pipSize, timeframe, candles]);

  // Re-render objects when the chart view moves.
  useEffect(() => {
    engineInstance.current?.onViewChanged();
  }, [viewVersion]);

  const eng = () => engineInstance.current;

  const applySettings = (patch: Partial<DrawingJSON>) => {
    if (!settings) return;
    eng()?.updateObject(settings.id, patch);
    setSettings((prev) => {
      if (!prev) return prev;
      const merged: DrawingJSON = { ...prev, ...patch };
      if (patch.style) merged.style = { ...prev.style, ...patch.style };
      return merged;
    });
  };

  return (
    <>
      <div ref={hostRef} className="absolute inset-0 z-10" style={{ pointerEvents: "none" }} />

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div
            className="fixed z-50 w-44 rounded-lg border app-border bg-[var(--app-panel)] py-1 text-xs shadow-2xl"
            style={{ left: menu.clientX, top: menu.clientY }}
          >
            <MenuItem icon={<Settings2 size={13} />} label="Settings" onClick={() => { const j = eng()?.getSelected(); if (j) setSettings(j); setMenu(null); }} />
            <MenuItem
              icon={selection?.locked ? <LockOpen size={13} /> : <Lock size={13} />}
              label={selection?.locked ? "Unlock" : "Lock"}
              onClick={() => { eng()?.toggleLock(); setMenu(null); }}
            />
            <MenuItem
              icon={selection?.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
              label={selection?.hidden ? "Show" : "Hide"}
              onClick={() => { eng()?.toggleHide(); setMenu(null); }}
            />
            <MenuItem icon={<CopyPlus size={13} />} label="Duplicate" onClick={() => { eng()?.duplicateSelected(); setMenu(null); }} />
            <MenuItem icon={<Copy size={13} />} label="Copy" onClick={() => { eng()?.copy(); setMenu(null); }} />
            <MenuItem icon={<SquareStack size={13} />} label="Bring to front" onClick={() => { eng()?.bringToFront(); setMenu(null); }} />
            <MenuItem icon={<SendToBack size={13} />} label="Send to back" onClick={() => { eng()?.sendToBack(); setMenu(null); }} />
            <div className="my-1 border-t app-border" />
            <MenuItem icon={<Trash2 size={13} className="text-bear" />} label="Delete" onClick={() => { eng()?.deleteSelected(); setMenu(null); }} />
          </div>
        </>
      )}

      {settings && (
        <DrawingSettingsDialog
          value={settings}
          timeframes={timeframes}
          precision={precision}
          onChange={applySettings}
          onClose={() => setSettings(null)}
        />
      )}
    </>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--app-panel-2)]"
    >
      <span className="app-muted">{icon}</span>
      {label}
    </button>
  );
}
