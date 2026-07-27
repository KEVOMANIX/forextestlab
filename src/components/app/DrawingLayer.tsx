"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, CopyPlus, Eye, EyeOff, Lock, LockOpen, Settings2, SendToBack, SquareStack, Trash2 } from "lucide-react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";

import { DrawingEngine, type ContextMenuRequest } from "@/lib/chart/drawing/engine";
import type { Candle } from "@/lib/chart/drawing/coords";
import type { DrawingJSON, MagnetMode, ToolKind } from "@/lib/chart/drawing/types";
import { DrawingSettingsDialog } from "./DrawingSettingsDialog";

const DRAWINGS_CHANGED_EVENT = "forextestlab:drawings-change";

interface DrawingsChangedDetail {
  key: string;
  source: string;
  drawings: DrawingJSON[];
}

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
  const sourceRef = useRef(`drawing-layer-${Math.random().toString(36).slice(2)}`);
  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  const [settings, setSettings] = useState<DrawingJSON | null>(null);
  const [menu, setMenu] = useState<ContextMenuRequest | null>(null);
  const [selection, setSelection] = useState<DrawingJSON | null>(null);
  const [textEdit, setTextEdit] = useState<{ id: string; x: number; y: number } | null>(null);
  const textDraftRef = useRef("");

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
    const persistAndShare = () => {
      if (!key) return;
      const drawings = engine.serialize();
      try {
        window.localStorage.setItem(key, JSON.stringify(drawings));
      } catch {
        // Persistence is best-effort.
      }
      window.dispatchEvent(new CustomEvent<DrawingsChangedDetail>(DRAWINGS_CHANGED_EVENT, {
        detail: { key, source: sourceRef.current, drawings },
      }));
    };
    const receiveSharedDrawings = (event: Event) => {
      const detail = (event as CustomEvent<DrawingsChangedDetail>).detail;
      if (!detail || detail.key !== key || detail.source === sourceRef.current) return;
      engine.load(detail.drawings);
      onCountChange?.(detail.drawings.length);
    };
    window.addEventListener(DRAWINGS_CHANGED_EVENT, receiveSharedDrawings);
    engine.onOpenSettings = (json) => setSettings(json);
    engine.onContextMenu = (req) => setMenu(req);
    engine.onRequestTextEdit = (req) => {
      textDraftRef.current = "";
      setTextEdit(req);
    };
    engine.onToolConsumed = () => onToolConsumed();
    engine.onSelectionChange = (json) => {
      setSelection(json);
    };
    engine.onObjectsChange = (n) => {
      onCountChange?.(n);
    };
    engine.onDrawingsChange = persistAndShare;
    engineInstance.current = engine;
    if (engineRef) engineRef.current = engine;
    return () => {
      window.removeEventListener(DRAWINGS_CHANGED_EVENT, receiveSharedDrawings);
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

  const commitText = (cancel: boolean) => {
    if (!textEdit) return;
    const value = textDraftRef.current.trim();
    if (cancel || !value) eng()?.removeObject(textEdit.id);
    else eng()?.setObjectText(textEdit.id, textDraftRef.current);
    setTextEdit(null);
  };

  return (
    <>
      <div ref={hostRef} className="absolute inset-0 z-10" style={{ pointerEvents: "none" }} />

      {textEdit && (
        <textarea
          key={textEdit.id}
          autoFocus
          defaultValue=""
          aria-label="Drawing text"
          onChange={(e) => {
            textDraftRef.current = e.target.value;
            eng()?.setObjectText(textEdit.id, e.target.value);
          }}
          onBlur={() => commitText(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              commitText(true);
            } else if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitText(false);
            }
          }}
          className="absolute z-50 min-w-[80px] resize-none rounded border border-brand-400 bg-[var(--app-panel-solid)] px-1.5 py-1 text-xs text-[var(--app-text)] shadow-lg outline-none"
          style={{ left: textEdit.x, top: textEdit.y, pointerEvents: "auto" }}
          rows={1}
        />
      )}

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div
            className="fixed z-50 w-44 rounded-lg border app-border bg-[var(--app-panel-solid)] py-1 text-xs shadow-2xl"
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
