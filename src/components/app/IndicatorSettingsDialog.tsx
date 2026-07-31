"use client";

import { useState } from "react";
import { Crosshair, RotateCcw, X } from "lucide-react";

import { formatNewYorkDateTime } from "@/lib/date-time";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";
import {
  CATEGORY_LABELS,
  SOURCE_OPTIONS,
  defaultInputs,
  defaultStyle,
  getDef,
  type IndicatorInstance,
  type InputDef,
  type InputSection,
  type LineStyleName,
  type PlotStyle,
} from "@/lib/chart/indicator-defs";

type Tab = "inputs" | "style" | "visibility" | "defaults";

interface Props {
  value: IndicatorInstance;
  onChange: (patch: Partial<IndicatorInstance>) => void;
  onClose: () => void;
  /** Start "click the chart to set this input" mode (for anchor inputs). */
  onPickAnchor?: (inputKey: string) => void;
}

const SECTION_LABELS: Record<InputSection, string> = {
  inputs: "Inputs",
  smoothing: "Smoothing",
  calculation: "Calculation",
};
const SECTION_ORDER: InputSection[] = ["inputs", "smoothing", "calculation"];
const LINE_STYLES: { value: LineStyleName; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-xs">
      <span className="app-muted">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </label>
  );
}

const inputCls = "rounded border app-border bg-transparent px-1.5 py-1 text-right";

export function IndicatorSettingsDialog({ value, onChange, onClose, onPickAnchor }: Props) {
  const [tab, setTab] = useState<Tab>("inputs");
  // Escape, a focus trap and focus restoration, like every other dialog here.
  // This one was a bare div: keyboard users could tab straight out behind it,
  // and Escape did nothing.
  const dialogRef = useModalBehavior<HTMLDivElement>({ open: true, onClose });
  const def = getDef(value.kind);
  if (!def) return null;

  const setInput = (key: string, v: number | string | boolean) => onChange({ inputs: { ...value.inputs, [key]: v } });
  const setStyle = (plotKey: string, patch: Partial<PlotStyle>) =>
    onChange({ style: { ...value.style, [plotKey]: { ...value.style[plotKey]!, ...patch } } });
  const resetDefaults = () => onChange({ inputs: defaultInputs(def), style: defaultStyle(def), precision: def.precision ?? null });

  const renderInput = (inp: InputDef) => {
    const v = value.inputs[inp.key];
    if (inp.type === "anchor") {
      const t = Number(v);
      return (
        <button
          type="button"
          onClick={() => onPickAnchor?.(inp.key)}
          className="inline-flex items-center gap-1.5 rounded border app-border px-2 py-1 text-[11px] hover:bg-[var(--app-panel-2)]"
        >
          <Crosshair size={12} />
          {t > 0 ? formatNewYorkDateTime(t * 1000, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Pick on chart"}
        </button>
      );
    }
    if (inp.type === "boolean") {
      return <input type="checkbox" checked={Boolean(v)} onChange={(e) => setInput(inp.key, e.target.checked)} className="accent-brand-400" />;
    }
    if (inp.type === "source") {
      return (
        <select value={String(v)} onChange={(e) => setInput(inp.key, e.target.value)} className="rounded border app-border bg-transparent px-1.5 py-1">
          {SOURCE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      );
    }
    if (inp.type === "select") {
      return (
        <select value={String(v)} onChange={(e) => setInput(inp.key, e.target.value)} className="rounded border app-border bg-transparent px-1.5 py-1">
          {(inp.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    return (
      <input
        type="number"
        min={inp.min}
        max={inp.max}
        step={inp.step ?? 1}
        value={Number(v)}
        onChange={(e) => {
          let n = Number(e.target.value);
          if (inp.min != null) n = Math.max(inp.min, n);
          if (inp.max != null) n = Math.min(inp.max, n);
          setInput(inp.key, n);
        }}
        className={`w-24 ${inputCls}`}
      />
    );
  };

  const sectionsPresent = SECTION_ORDER.filter((sec) => def.inputs.some((i) => (i.section ?? "inputs") === sec));

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40" onPointerDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${def.name} settings`}
        tabIndex={-1}
        className="flex max-h-[80vh] w-[340px] flex-col rounded-xl border app-border bg-[var(--app-panel-solid)] shadow-2xl outline-none"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b app-border px-3 py-2">
          <h3 className="truncate text-sm font-semibold">{def.name}</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="app-muted hover:text-[var(--app-text)]">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 border-b app-border px-2 pt-2">
          {(["inputs", "style", "visibility", "defaults"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-t-md px-3 py-1.5 text-xs font-medium capitalize ${tab === t ? "bg-[var(--app-panel-2)] text-[var(--app-text)]" : "app-muted hover:text-[var(--app-text)]"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {tab === "inputs" && (
            def.inputs.length === 0 ? (
              <p className="py-4 text-center text-xs app-muted">This indicator has no inputs.</p>
            ) : (
              sectionsPresent.map((sec) => (
                <div key={sec}>
                  {sec !== "inputs" && <p className="pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide app-muted">{SECTION_LABELS[sec]}</p>}
                  {def.inputs.filter((i) => (i.section ?? "inputs") === sec).map((inp) => (
                    <Row key={inp.key} label={inp.label}>{renderInput(inp)}</Row>
                  ))}
                </div>
              ))
            )
          )}

          {tab === "style" &&
            def.plots.map((plot) => {
              const s = value.style[plot.key]!;
              return (
                <div key={plot.key} className="border-b app-border py-2 last:border-0">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <input type="checkbox" checked={s.visible} onChange={(e) => setStyle(plot.key, { visible: e.target.checked })} className="accent-brand-400" />
                      {plot.label}
                    </label>
                    <input
                      type="color"
                      aria-label={`${plot.label} color`}
                      value={s.color}
                      onChange={(e) => setStyle(plot.key, { color: e.target.value })}
                      className="h-6 w-8 cursor-pointer rounded border app-border bg-transparent p-0.5"
                    />
                  </div>
                  {plot.kind === "line" && (
                    <div className="mt-1 flex items-center gap-2 pl-6">
                      <select value={s.lineStyle} onChange={(e) => setStyle(plot.key, { lineStyle: e.target.value as LineStyleName })} className="rounded border app-border bg-transparent px-1 py-0.5 text-[11px]">
                        {LINE_STYLES.map((ls) => (
                          <option key={ls.value} value={ls.value}>{ls.label}</option>
                        ))}
                      </select>
                      <select value={s.lineWidth} onChange={(e) => setStyle(plot.key, { lineWidth: Number(e.target.value) })} className="rounded border app-border bg-transparent px-1 py-0.5 text-[11px]">
                        {[1, 2, 3, 4].map((w) => (
                          <option key={w} value={w}>{w}px</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="mt-1 flex items-center gap-2 pl-6 text-[11px] app-muted">
                    <span>Opacity</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(s.opacity * 100)}
                      onChange={(e) => setStyle(plot.key, { opacity: Number(e.target.value) / 100 })}
                      className="flex-1 accent-brand-400"
                    />
                    <span className="w-8 text-right">{Math.round(s.opacity * 100)}%</span>
                  </div>
                </div>
              );
            })}

          {tab === "visibility" && (
            <>
              <Row label="Visible on chart">
                <input type="checkbox" checked={value.visible} onChange={(e) => onChange({ visible: e.target.checked })} className="accent-brand-400" />
              </Row>
              <Row label="Price precision">
                <input
                  type="number"
                  min={0}
                  max={8}
                  placeholder="auto"
                  value={value.precision ?? ""}
                  onChange={(e) => onChange({ precision: e.target.value === "" ? null : Math.max(0, Math.min(8, Number(e.target.value))) })}
                  className={`w-24 ${inputCls}`}
                />
              </Row>
              <p className="pt-2 text-[11px] app-muted">Precision blank = inherit the chart&apos;s decimals.</p>
            </>
          )}

          {tab === "defaults" && (
            <div className="py-1">
              <p className="text-[11px] leading-relaxed app-muted">{def.description}</p>
              <p className="pt-2 text-[11px] app-muted">
                Category: <span className="text-[var(--app-text)]">{CATEGORY_LABELS[def.category]}</span> · Pane:{" "}
                <span className="text-[var(--app-text)]">{def.pane === "own" ? "Separate" : "Overlay"}</span>
              </p>
              <button
                type="button"
                onClick={resetDefaults}
                className="mt-4 inline-flex items-center gap-2 rounded-md border app-border px-3 py-1.5 text-xs font-medium hover:bg-[var(--app-panel-2)]"
              >
                <RotateCcw size={13} /> Reset to defaults
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t app-border px-3 py-2">
          <button type="button" onClick={onClose} className="rounded-md bg-brand-500 px-4 py-1.5 text-xs font-semibold text-surface-950 hover:bg-brand-400">
            Ok
          </button>
        </div>
      </div>
    </div>
  );
}
