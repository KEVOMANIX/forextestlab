"use client";

import { useState } from "react";
import { X } from "lucide-react";

import {
  DRAW_PALETTE,
  FIB_LEVELS,
  TOOL_LABELS,
  type DrawingJSON,
  type LineStyleName,
  type Point,
} from "@/lib/chart/drawing/types";

type Tab = "style" | "text" | "coords" | "visibility";

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
        className="w-[320px] rounded-xl border app-border bg-[var(--app-panel-solid)] shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b app-border px-3 py-2">
          <h3 className="text-sm font-semibold">{TOOL_LABELS[value.kind]} settings</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="app-muted hover:text-[var(--app-text)]">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 border-b app-border px-2 pt-2">
          {(["style", "text", "coords", "visibility"] as Tab[]).map((t) => (
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
                <span className="flex items-center gap-1">
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
                  <input
                    type="color"
                    aria-label="Custom color"
                    value={s.color}
                    onChange={(e) => setStyle({ color: e.target.value })}
                    className="ml-1 h-5 w-5 cursor-pointer rounded border app-border bg-transparent p-0.5"
                  />
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
                  <Row label="Background color">
                    <span className="flex items-center gap-1">
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
                      <input
                        type="color"
                        aria-label="Custom background color"
                        value={s.fillColor}
                        onChange={(e) => setStyle({ fillColor: e.target.value })}
                        className="ml-1 h-5 w-5 cursor-pointer rounded border app-border bg-transparent p-0.5"
                      />
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
              {value.kind === "fib" && (
                <Row label="Reverse">
                  <input type="checkbox" checked={Boolean(s.reverse)} onChange={(e) => setStyle({ reverse: e.target.checked })} />
                </Row>
              )}
              {value.kind === "fib" && (
                <div className="py-1">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide app-muted">Levels</div>
                  <div className="grid grid-cols-3 gap-x-2 gap-y-1">
                    {FIB_LEVELS.map((lvl) => {
                      const current = s.fibLevels ?? [...FIB_LEVELS];
                      const on = current.includes(lvl);
                      return (
                        <label key={lvl} className="flex items-center gap-1.5 text-[11px]">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => {
                              const next = on ? current.filter((l) => l !== lvl) : [...current, lvl].sort((a, b) => a - b);
                              setStyle({ fibLevels: next });
                            }}
                          />
                          {lvl}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              <Row label="Background">
                <input type="checkbox" checked={s.background} onChange={(e) => setStyle({ background: e.target.checked })} />
              </Row>
              {(value.kind === "long" || value.kind === "short") && (
                <>
                  <Row label="Account size">
                    <input
                      type="number"
                      value={s.accountSize ?? 10000}
                      onChange={(e) => setStyle({ accountSize: Number(e.target.value) })}
                      className="w-24 rounded border app-border bg-transparent px-1 py-0.5 text-right"
                    />
                  </Row>
                  <Row label="Risk mode">
                    <select
                      value={s.riskMode ?? "percent"}
                      onChange={(e) => setStyle({ riskMode: e.target.value as "percent" | "money" })}
                      className="rounded border app-border bg-transparent px-1 py-0.5"
                    >
                      <option value="percent">Percent of account</option>
                      <option value="money">Fixed money</option>
                    </select>
                  </Row>
                  <Row label={`Risk (${s.riskMode === "money" ? "cash" : "%"})`}>
                    <input
                      type="number"
                      value={s.risk ?? 1}
                      onChange={(e) => setStyle({ risk: Number(e.target.value) })}
                      className="w-24 rounded border app-border bg-transparent px-1 py-0.5 text-right"
                    />
                  </Row>
                </>
              )}
            </>
          )}

          {tab === "text" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 py-1">
                <input
                  type="color"
                  aria-label="Text color"
                  value={s.textColor ?? "#e5e7eb"}
                  onChange={(e) => setStyle({ textColor: e.target.value })}
                  className="h-7 w-8 cursor-pointer rounded border app-border bg-transparent p-0.5"
                />
                <select
                  aria-label="Font size"
                  value={s.fontSize}
                  onChange={(e) => setStyle({ fontSize: Number(e.target.value) })}
                  className="rounded border app-border bg-transparent px-1 py-1 text-xs"
                >
                  {[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-pressed={Boolean(s.bold)}
                  onClick={() => setStyle({ bold: !s.bold })}
                  className={`h-7 w-7 rounded border app-border text-xs font-bold ${s.bold ? "bg-brand-400/15 text-brand-300" : "app-muted"}`}
                >
                  B
                </button>
                <button
                  type="button"
                  aria-pressed={Boolean(s.italic)}
                  onClick={() => setStyle({ italic: !s.italic })}
                  className={`h-7 w-7 rounded border app-border text-xs italic ${s.italic ? "bg-brand-400/15 text-brand-300" : "app-muted"}`}
                >
                  I
                </button>
              </div>
              <textarea
                value={s.text}
                placeholder="Add text"
                onChange={(e) => setStyle({ text: e.target.value })}
                rows={4}
                className="w-full resize-y rounded-md border app-border bg-transparent px-2 py-1.5 text-xs outline-none focus:border-brand-400"
              />
              <Row label="Text alignment">
                <select
                  value={s.textPlacement ?? "inside"}
                  onChange={(e) => setStyle({ textPlacement: e.target.value as "inside" | "outside" })}
                  className="rounded border app-border bg-transparent px-1 py-0.5"
                >
                  <option value="inside">Inside</option>
                  <option value="outside">Outside</option>
                </select>
                <select
                  value={s.textAlign ?? "center"}
                  onChange={(e) => setStyle({ textAlign: e.target.value as "left" | "center" | "right" })}
                  className="rounded border app-border bg-transparent px-1 py-0.5"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </Row>
            </div>
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
