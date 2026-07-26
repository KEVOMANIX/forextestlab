"use client";

import { useState } from "react";
import { X } from "lucide-react";

import {
  INDICATOR_CATALOG,
  INDICATOR_SHORT,
  INDICATOR_SOURCES,
  type IndicatorInstance,
  type IndSource,
} from "@/lib/chart/indicator-types";

type Tab = "inputs" | "style" | "visibility";

interface Props {
  value: IndicatorInstance;
  onChange: (patch: Partial<IndicatorInstance>) => void;
  onClose: () => void;
}

function Row({ label, children, muted = false }: { label: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-3 py-1.5 text-xs ${muted ? "opacity-40" : ""}`}>
      <span className="app-muted">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </label>
  );
}

export function IndicatorSettingsDialog({ value, onChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("inputs");
  const def = INDICATOR_CATALOG.find((d) => d.kind === value.kind)!;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40" onPointerDown={onClose}>
      <div
        className="w-[320px] rounded-xl border app-border bg-[var(--app-panel-solid)] shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b app-border px-3 py-2">
          <h3 className="text-sm font-semibold">{INDICATOR_SHORT[value.kind]}</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="app-muted hover:text-[var(--app-text)]">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 border-b app-border px-2 pt-2">
          {(["inputs", "style", "visibility"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-t-md px-3 py-1.5 text-xs font-medium capitalize ${
                tab === t ? "bg-[var(--app-panel-2)] text-[var(--app-text)]" : "app-muted hover:text-[var(--app-text)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-3 py-2">
          {tab === "inputs" && (
            <>
              {def.hasLength && (
                <Row label="Length">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={value.length}
                    onChange={(e) => onChange({ length: Math.max(1, Number(e.target.value)) })}
                    className="w-20 rounded border app-border bg-transparent px-1.5 py-1 text-right"
                  />
                </Row>
              )}
              {def.hasSource && (
                <Row label="Source">
                  <select
                    value={value.source}
                    onChange={(e) => onChange({ source: e.target.value as IndSource })}
                    className="rounded border app-border bg-transparent px-1.5 py-1"
                  >
                    {INDICATOR_SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Row>
              )}
              <Row label="Offset">
                <input
                  type="number"
                  min={-500}
                  max={500}
                  value={value.offset}
                  onChange={(e) => onChange({ offset: Number(e.target.value) })}
                  className="w-20 rounded border app-border bg-transparent px-1.5 py-1 text-right"
                />
              </Row>
              {value.kind === "bb" && (
                <>
                  <p className="pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide app-muted">Calculation</p>
                  <Row label="StdDev">
                    <input
                      type="number"
                      min={0.1}
                      max={10}
                      step={0.1}
                      value={value.bbStdDev}
                      onChange={(e) => onChange({ bbStdDev: Number(e.target.value) })}
                      className="w-20 rounded border app-border bg-transparent px-1.5 py-1 text-right"
                    />
                  </Row>
                </>
              )}
            </>
          )}

          {tab === "style" && (
            <>
              <Row label="Color">
                <input
                  type="color"
                  aria-label="Color"
                  value={value.color}
                  onChange={(e) => onChange({ color: e.target.value })}
                  className="h-6 w-8 cursor-pointer rounded border app-border bg-transparent p-0.5"
                />
              </Row>
              <Row label="Line width">
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={value.lineWidth}
                  onChange={(e) => onChange({ lineWidth: Math.min(4, Math.max(1, Number(e.target.value))) })}
                  className="w-20 rounded border app-border bg-transparent px-1.5 py-1 text-right"
                />
              </Row>
            </>
          )}

          {tab === "visibility" && (
            <Row label="Visible on chart">
              <input type="checkbox" checked={value.visible} onChange={(e) => onChange({ visible: e.target.checked })} />
            </Row>
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
