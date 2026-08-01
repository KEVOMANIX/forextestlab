"use client";

import { useEffect, useRef, useState } from "react";
import {
  Copy,
  CopyPlus,
  Ellipsis,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  LockOpen,
  Menu,
  Minus,
  PaintBucket,
  PencilLine,
  Settings2,
  SendToBack,
  SquareStack,
  Trash2,
} from "lucide-react";
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
  const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null);
  const [textEdit, setTextEdit] = useState<{
    id: string;
    x: number;
    y: number;
    kind: ToolKind;
    style: DrawingJSON["style"];
  } | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  /** False until the editor owns focus for real; blurs before that are spurious. */
  const textReadyRef = useRef(false);
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
      const drawing = engine.getSelected();
      if (!drawing) return;
      textDraftRef.current = "";
      setTextDraft("");
      setTextEdit({ ...req, kind: drawing.kind, style: drawing.style });
    };
    engine.onToolConsumed = () => onToolConsumed();
    engine.onSelectionChange = (json) => {
      setSelection(json);
      setToolbarPosition(json ? engine.getSelectionToolbarPosition() : null);
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
    if (selection) {
      setToolbarPosition(engineInstance.current?.getSelectionToolbarPosition() ?? null);
    }
  }, [viewVersion, selection]);

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

  const applyQuickStyle = (patch: Partial<DrawingJSON["style"]>) => {
    if (!selection) return;
    eng()?.updateObject(selection.id, {
      style: { ...selection.style, ...patch },
    });
  };

  // Take focus once the creating click has fully played out, then start
  // honouring blur. Focusing during the click loses the editor immediately.
  useEffect(() => {
    if (!textEdit) return;
    textReadyRef.current = false;
    const focus = () => textAreaRef.current?.focus();
    focus();
    const settle = window.setTimeout(() => {
      focus();
      textReadyRef.current = true;
    }, 150);
    return () => window.clearTimeout(settle);
  }, [textEdit]);

  const commitText = (cancel: boolean) => {
    if (!textEdit) return;
    const value = textDraftRef.current.trim();
    if (cancel || !value) eng()?.removeObject(textEdit.id);
    else eng()?.setObjectText(textEdit.id, textDraftRef.current);
    setTextDraft("");
    setTextEdit(null);
  };

  return (
    <>
      <div ref={hostRef} className="absolute inset-0 z-10" style={{ pointerEvents: "none" }} />

      {textEdit && (
        <textarea
          ref={textAreaRef}
          key={textEdit.id}
          defaultValue=""
          data-testid="drawing-inline-text-editor"
          aria-label="Drawing text"
          onChange={(e) => {
            textDraftRef.current = e.target.value;
            setTextDraft(e.target.value);
          }}
          onBlur={() => {
            // The click that created the drawing is still in flight when the
            // editor mounts; its pointerup blurs us before a key can be typed,
            // and an empty commit deletes the drawing. Ignore that one.
            if (!textReadyRef.current) {
              textAreaRef.current?.focus();
              return;
            }
            commitText(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              commitText(true);
            } else if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitText(false);
            }
          }}
          className="absolute z-50 resize-none overflow-hidden border-0 bg-transparent p-0 shadow-none outline-none"
          style={{
            left: textEdit.x,
            top: textEdit.kind === "anchoredText" ? textEdit.y : textEdit.y - textEdit.style.fontSize / 2,
            width: Math.min(440, Math.max(24, Math.max(...(textDraft || " ").split("\n").map((line) => line.length)) * textEdit.style.fontSize * .64 + 8)),
            height: Math.max(textEdit.style.fontSize + 6, (textDraft.split("\n").length || 1) * (textEdit.style.fontSize + 4)),
            pointerEvents: "auto",
            color: textEdit.style.textColor ?? textEdit.style.color,
            caretColor: textEdit.style.textColor ?? textEdit.style.color,
            fontSize: textEdit.style.fontSize,
            fontWeight: textEdit.style.bold ? 700 : 400,
            fontStyle: textEdit.style.italic ? "italic" : "normal",
            lineHeight: `${textEdit.style.fontSize + 4}px`,
            boxShadow: "none",
          }}
          rows={Math.max(1, textDraft.split("\n").length)}
          spellCheck={false}
        />
      )}

      {selection && toolbarPosition && !settings && !textEdit && (
        <div
          role="toolbar"
          aria-label={`${selection.kind} drawing settings`}
          className="absolute z-40 flex h-10 items-center gap-1 rounded-lg border app-border bg-[var(--app-panel-solid)] px-1.5 shadow-2xl"
          style={{
            left: toolbarPosition.x,
            top: toolbarPosition.y,
            pointerEvents: "auto",
            transform: "translate(-50%, -100%)",
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="grid h-7 w-6 cursor-move place-items-center app-muted" title="Move drawing toolbar" aria-hidden>
            <GripVertical size={16} />
          </span>
          <label className="relative grid h-7 w-8 cursor-pointer place-items-center rounded hover:bg-[var(--app-panel-2)]" title="Stroke color">
            <PencilLine size={17} />
            <span className="absolute bottom-0.5 h-0.5 w-5 rounded-full" style={{ backgroundColor: selection.style.color }} />
            <input
              type="color"
              aria-label="Drawing stroke color"
              value={selection.style.color}
              onChange={(event) => applyQuickStyle({ color: event.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <label className={`relative grid h-7 w-8 cursor-pointer place-items-center rounded hover:bg-[var(--app-panel-2)] ${selection.style.fill ? "text-brand-300" : "app-muted"}`} title="Background color">
            <PaintBucket size={17} />
            <span
              className="absolute bottom-0.5 h-0.5 w-5 rounded-full border border-white/20"
              style={{ backgroundColor: selection.style.fill ? selection.style.fillColor : "transparent" }}
            />
            <input
              type="color"
              aria-label="Drawing background color"
              value={selection.style.fillColor}
              onChange={(event) => applyQuickStyle({ fill: true, fillColor: event.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <button
            type="button"
            aria-label="Change drawing line width"
            title="Line width"
            onClick={() => applyQuickStyle({ lineWidth: selection.style.lineWidth >= 4 ? 1 : selection.style.lineWidth + 1 })}
            className="flex h-7 min-w-12 items-center justify-center gap-1 rounded px-1 text-[11px] font-semibold hover:bg-[var(--app-panel-2)]"
          >
            <Minus size={17} strokeWidth={Math.min(4, selection.style.lineWidth)} />
            {selection.style.lineWidth}px
          </button>
          <button
            type="button"
            aria-label="Change drawing line style"
            title="Line style"
            onClick={() => {
              const styles = ["solid", "dashed", "dotted"] as const;
              const current = styles.indexOf(selection.style.lineStyle);
              applyQuickStyle({ lineStyle: styles[(current + 1) % styles.length] });
            }}
            className="grid h-7 w-10 place-items-center rounded hover:bg-[var(--app-panel-2)]"
          >
            <Menu size={18} />
            <span className="sr-only">{selection.style.lineStyle}</span>
          </button>
          <span className="mx-0.5 h-5 w-px bg-[var(--app-border)]" aria-hidden />
          <button type="button" aria-label={selection.locked ? "Unlock drawing" : "Lock drawing"} onClick={() => eng()?.toggleLock()} className="grid h-7 w-7 place-items-center rounded app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]">
            {selection.locked ? <LockOpen size={15} /> : <Lock size={15} />}
          </button>
          <button type="button" aria-label="Delete drawing" onClick={() => eng()?.deleteSelected()} className="grid h-7 w-7 place-items-center rounded app-muted hover:bg-bear/10 hover:text-bear">
            <Trash2 size={15} />
          </button>
          <button type="button" aria-label="More drawing settings" onClick={() => setSettings(selection)} className="grid h-7 w-7 place-items-center rounded app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]">
            <Ellipsis size={17} />
          </button>
        </div>
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
