"use client";

import { useState } from "react";
import { X } from "lucide-react";

import {
  DRAW_PALETTE,
  TOOL_LABELS,
  type DrawingJSON,
  type LineStyleName,
  type Point,
} from "@/lib/chart/drawing/types";

type Tab = "style" | "coords" | "visibility";

interface Props {
  value: DrawingJSON;
  timeframes: string[];
  precision: number;
  onChange: (patch: Partial<DrawingJSON>) => void;
  onClose: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-xs">
      <span className="app-muted">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </label>
  );
}

export function DrawingSettingsDialog({ value, timeframes, precision, onChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("style");
  const s = value.style;

  const setStyle = (patch: Partial<DrawingJSON["style"]>) => onChange({ style: { ...s, ...patch } });
  const setPoint = (i: number, patch: Partial<Point>) => {
    const points = value.points.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    onChange({ points });
  };

  const allTf = value.visibleTimeframes == null;
  const toggleTf = (tf: string) => {
    const current = value.visibleTimeframes ?? [...timeframes];
    const next = current.includes(tf) ? current.filter((t) => t !== tf) : [...current, tf];
    onChange({ visibleTimeframes: next.length === timeframes.length ? null : next });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40" onPointerDown={onClose}>
      <div
        className="w-[320px] rounded-xl border app-border bg-[var(--app-panel)] shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b app-border px-3 py-2">
          <h3 className="text-sm font-semibold">{TOOL_LABELS[value.kind]} settings</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="app-muted hover:text-[var(--app-text)]">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 border-b app-border px-2 pt-2">
          {(["style", "coords", "visibility"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-t-md px-3 py-1.5 text-xs font-medium capitalize ${
                tab === t ? "bg-[var(--app-panel-2)] text-[var(--app-text)]" : "app-muted hover:text-[var(--app-text)]"
              }`}
            >
              {t === "coords" ? "Coordinates" : t}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-3 py-2">
          {tab === "style" && (
            <>
              <Row label="Color">
                <span className="flex gap-1">
                  {DRAW_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      onClick={() => setStyle({ color: c })}
                      className="h-4 w-4 rounded-full border"
                      style={{ backgroundColor: c, borderColor: s.color === c ? "#fff" : "transparent" }}
                    />
                  ))}
                </span>
              </Row>
              <Row label="Opacity">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={s.opacity}
                  onChange={(e) => setStyle({ opacity: Number(e.target.value) })}
                />
              </Row>
              <Row label="Line width">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={s.lineWidth}
                  onChange={(e) => setStyle({ lineWidth: Number(e.target.value) })}
                  className="w-16 rounded border app-border bg-transparent px-1 py-0.5 text-right"
                />
              </Row>
              <Row label="Line style">
                <select
                  value={s.lineStyle}
                  onChange={(e) => setStyle({ lineStyle: e.target.value as LineStyleName })}
                  className="rounded border app-border bg-transparent px-1 py-0.5"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </Row>
              <Row label="Fill">
                <input type="checkbox" checked={s.fill} onChange={(e) => setStyle({ fill: e.target.checked })} />
              </Row>
              {s.fill && (
                <>
                  <Row label="Fill color">
                    <span className="flex gap-1">
                      {DRAW_PALETTE.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={c}
                          onClick={() => setStyle({ fillColor: c })}
                          className="h-4 w-4 rounded-full border"
                          style={{ backgroundColor: c, borderColor: s.fillColor === c ? "#fff" : "transparent" }}
                        />
                      ))}
                    </span>
                  </Row>
                  <Row label="Fill opacity">
                    <input
                      type="range"
                      min={0}
                      max={0.6}
                      step={0.02}
                      value={s.fillOpacity}
                      onChange={(e) => setStyle({ fillOpacity: Number(e.target.value) })}
                    />
                  </Row>
                </>
              )}
              <Row label="Show labels">
                <input type="checkbox" checked={s.showLabels} onChange={(e) => setStyle({ showLabels: e.target.checked })} />
              </Row>
              <Row label="Extend left">
                <input type="checkbox" checked={s.extendLeft} onChange={(e) => setStyle({ extendLeft: e.target.checked })} />
              </Row>
              <Row label="Extend right">
                <input type="checkbox" checked={s.extendRight} onChange={(e) => setStyle({ extendRight: e.target.checked })} />
              </Row>
              <Row label="Background">
                <input type="checkbox" checked={s.background} onChange={(e) => setStyle({ background: e.target.checked })} />
              </Row>
              {(value.kind === "text" || value.kind === "label") && (
                <Row label="Text">
                  <input
                    value={s.text}
                    onChange={(e) => setStyle({ text: e.target.value })}
                    className="w-40 rounded border app-border bg-transparent px-1 py-0.5"
                  />
                </Row>
              )}
            </>
          )}

          {tab === "coords" && (
            <div className="space-y-2">
              {value.points.map((p, i) => (
                <div key={i} className="rounded-md border app-border p-2">
                  <div className="mb-1 text-[10px] font-semibold app-muted">Point {i + 1}</div>
                  <Row label="Time (unix s)">
                    <input
                      type="number"
                      value={p.time}
                      onChange={(e) => setPoint(i, { time: Number(e.target.value) })}
                      className="w-32 rounded border app-border bg-transparent px-1 py-0.5 text-right font-mono text-[11px]"
                    />
                  </Row>
                  <Row label="Price">
                    <input
                      type="number"
                      step={Math.pow(10, -precision)}
                      value={p.price}
                      onChange={(e) => setPoint(i, { price: Number(e.target.value) })}
                      className="w-32 rounded border app-border bg-transparent px-1 py-0.5 text-right font-mono text-[11px]"
                    />
                  </Row>
                </div>
              ))}
            </div>
          )}

          {tab === "visibility" && (
            <div className="space-y-1">
              <label className="flex items-center justify-between py-1 text-xs">
                <span className="app-muted">All timeframes</span>
                <input type="checkbox" checked={allTf} onChange={() => onChange({ visibleTimeframes: allTf ? [] : null })} />
              </label>
              <div className="border-t app-border pt-1">
                {timeframes.map((tf) => {
                  const on = value.visibleTimeframes == null || value.visibleTimeframes.includes(tf);
                  return (
                    <label key={tf} className="flex items-center justify-between py-1 text-xs">
                      <span>{tf}</span>
                      <input type="checkbox" checked={on} disabled={allTf} onChange={() => toggleTf(tf)} />
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
