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

type InputValue = number | string | boolean;

/** A purpose-built editor for the session overlay. The normal key/value input
 * list is ideal for a moving average, but turns three session windows and
 * their start lines into an unreadable wall of controls. */
function SessionInputs({
  inputs,
  onSet,
}: {
  inputs: IndicatorInstance["inputs"];
  onSet: (key: string, value: InputValue) => void;
}) {
  const [active, setActive] = useState("london");
  const sessions = [
    { id: "asia", label: "Asia", hint: "Tokyo / Pacific", color: "#2962ff" },
    { id: "london", label: "London", hint: "European open", color: "#f9ab00" },
    { id: "newYork", label: "New York", hint: "US cash session", color: "#089981" },
  ];
  const current = sessions.find((session) => session.id === active) ?? sessions[1]!;
  const value = (key: string, fallback: InputValue) => inputs[key] ?? fallback;
  const enabled = value(`${current.id}Enabled`, true) !== false;
  const lineEnabled = value(`${current.id}LineEnabled`, current.id === "london") === true;
  const currentColor = String(value(`${current.id}Color`, current.color));

  return (
    <div className="space-y-4 py-1">
      <section className="rounded-lg border app-border bg-[var(--app-panel-2)]/45 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] app-muted">Session clock</p>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
          <label className="min-w-0 text-[11px] app-muted">
            Time zone
            <select
              value={String(value("timezone", "America/New_York"))}
              onChange={(event) => onSet("timezone", event.target.value)}
              className="mt-1 h-8 w-full rounded border app-border bg-[var(--app-panel-solid)] px-2 text-xs text-[var(--app-text)]"
            >
              <option value="America/New_York">New York</option>
              <option value="UTC">UTC</option>
              <option value="Europe/London">London</option>
              <option value="Asia/Tokyo">Tokyo</option>
            </select>
          </label>
          <label className="text-[11px] app-muted">
            Days back
            <input
              type="number"
              min={1}
              max={30}
              value={Number(value("lookbackDays", 3))}
              onChange={(event) => onSet("lookbackDays", Math.max(1, Math.min(30, Number(event.target.value))))}
              className="mt-1 h-8 w-full rounded border app-border bg-[var(--app-panel-solid)] px-2 text-right text-xs text-[var(--app-text)]"
            />
          </label>
        </div>
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-md border app-border bg-[var(--app-panel-solid)] px-2.5 py-2 text-xs">
          <span className="min-w-0">
            <span className="block font-medium text-[var(--app-text)]">Session boxes</span>
            <span className="block text-[11px] text-[var(--app-muted)]">Shade each session range on the chart</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-[11px] text-[var(--app-muted)]">
            {value("showBoxes", true) !== false ? "Shown" : "Lines only"}
            <input
              type="checkbox"
              checked={value("showBoxes", true) !== false}
              onChange={(event) => onSet("showBoxes", event.target.checked)}
              className="h-4 w-4 accent-brand-400"
            />
          </span>
        </label>
      </section>

      <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--app-panel-2)] p-1" role="tablist" aria-label="Trading session">
        {sessions.map((session) => {
          const sessionEnabled = value(`${session.id}Enabled`, true) !== false;
          return (
            <button
              key={session.id}
              type="button"
              role="tab"
              aria-selected={active === session.id}
              onClick={() => setActive(session.id)}
              className={`min-w-0 rounded-md px-1.5 py-2 text-left transition-colors ${
                active === session.id ? "bg-[var(--app-panel-solid)] shadow-sm" : "hover:bg-white/[0.04]"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                <i className="h-2 w-2 rounded-full" style={{ backgroundColor: String(value(`${session.id}Color`, session.color)) }} />
                <span className="truncate">{session.label}</span>
              </span>
              <span className={`mt-0.5 block text-[9px] ${sessionEnabled ? "app-muted" : "text-bear"}`}>
                {sessionEnabled ? "Enabled" : "Hidden"}
              </span>
            </button>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-lg border app-border">
        <div className="flex items-center gap-3 border-b app-border bg-[var(--app-panel-2)]/45 px-3 py-2.5">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onSet(`${current.id}Enabled`, event.target.checked)}
            className="h-4 w-4 accent-brand-400"
            aria-label={`Show ${current.label} session`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{current.label} session</p>
            <p className="text-[10px] app-muted">{current.hint}</p>
          </div>
          <input
            type="color"
            value={currentColor}
            onChange={(event) => onSet(`${current.id}Color`, event.target.value)}
            className="h-7 w-9 rounded border app-border bg-transparent p-0.5"
            aria-label={`${current.label} session color`}
          />
        </div>

        <div className={`space-y-4 p-3 ${enabled ? "" : "opacity-45"}`}>
          <div className="grid grid-cols-[minmax(0,1fr)_5.25rem_5.25rem] gap-2">
            <label className="min-w-0 text-[11px] app-muted">
              Label
              <input
                type="text"
                value={String(value(`${current.id}Name`, current.label))}
                onChange={(event) => onSet(`${current.id}Name`, event.target.value)}
                disabled={!enabled}
                className="mt-1 h-8 w-full rounded border app-border bg-transparent px-2 text-xs text-[var(--app-text)] disabled:cursor-not-allowed"
              />
            </label>
            <label className="text-[11px] app-muted">
              Starts
              <input type="time" value={String(value(`${current.id}Start`, "00:00"))} onChange={(event) => onSet(`${current.id}Start`, event.target.value)} disabled={!enabled} className="mt-1 h-8 w-full rounded border app-border bg-transparent px-1 text-xs text-[var(--app-text)] disabled:cursor-not-allowed" />
            </label>
            <label className="text-[11px] app-muted">
              Ends
              <input type="time" value={String(value(`${current.id}End`, "00:00"))} onChange={(event) => onSet(`${current.id}End`, event.target.value)} disabled={!enabled} className="mt-1 h-8 w-full rounded border app-border bg-transparent px-1 text-xs text-[var(--app-text)] disabled:cursor-not-allowed" />
            </label>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3">
            <label className="text-[11px] app-muted">
              Fill transparency <span className="float-right text-[var(--app-text)]">{Number(value(`${current.id}Transparency`, 76))}%</span>
              <input type="range" min={0} max={100} value={Number(value(`${current.id}Transparency`, 76))} onChange={(event) => onSet(`${current.id}Transparency`, Number(event.target.value))} disabled={!enabled} className="mt-2 w-full accent-brand-400 disabled:cursor-not-allowed" />
            </label>
            <label className="text-[11px] app-muted">
              Border
              <select value={String(value(`${current.id}BorderWidth`, 1))} onChange={(event) => onSet(`${current.id}BorderWidth`, Number(event.target.value))} disabled={!enabled} className="mt-1 h-8 w-full rounded border app-border bg-transparent px-2 text-xs text-[var(--app-text)] disabled:cursor-not-allowed">
                {[0, 1, 2, 3, 4].map((width) => <option key={width} value={width}>{width === 0 ? "None" : `${width}px`}</option>)}
              </select>
            </label>
          </div>

          <div className="border-t app-border pt-3">
            <label className="flex items-center justify-between text-xs font-semibold">
              <span>Session start line</span>
              <span className="flex items-center gap-2 text-[10px] font-medium app-muted">
                {lineEnabled ? "Shown" : "Hidden"}
                <input type="checkbox" checked={lineEnabled} onChange={(event) => onSet(`${current.id}LineEnabled`, event.target.checked)} disabled={!enabled} className="h-4 w-4 accent-brand-400 disabled:cursor-not-allowed" />
              </span>
            </label>
            <div className={`mt-3 grid grid-cols-4 gap-2 ${lineEnabled && enabled ? "" : "pointer-events-none opacity-40"}`}>
              <label className="text-[10px] app-muted">Time<input type="time" value={String(value(`${current.id}LineTime`, "00:00"))} onChange={(event) => onSet(`${current.id}LineTime`, event.target.value)} className="mt-1 h-8 w-full rounded border app-border bg-transparent px-1 text-xs text-[var(--app-text)]" /></label>
              <label className="text-[10px] app-muted">Color<input type="color" value={String(value(`${current.id}LineColor`, current.color))} onChange={(event) => onSet(`${current.id}LineColor`, event.target.value)} className="mt-1 h-8 w-full rounded border app-border bg-transparent p-0.5" /></label>
              <label className="text-[10px] app-muted">Style<select value={String(value(`${current.id}LineStyle`, "dashed"))} onChange={(event) => onSet(`${current.id}LineStyle`, event.target.value)} className="mt-1 h-8 w-full rounded border app-border bg-transparent px-1 text-[11px] text-[var(--app-text)]"><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label>
              <label className="text-[10px] app-muted">Width<select value={String(value(`${current.id}LineWidth`, 1))} onChange={(event) => onSet(`${current.id}LineWidth`, Number(event.target.value))} className="mt-1 h-8 w-full rounded border app-border bg-transparent px-1 text-[11px] text-[var(--app-text)]">{[1, 2, 3, 4].map((width) => <option key={width} value={width}>{width}px</option>)}</select></label>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

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
    if (inp.type === "time") {
      return (
        <input
          type="time"
          value={typeof v === "string" ? v : String(inp.default)}
          onChange={(e) => setInput(inp.key, e.target.value)}
          className="rounded border app-border bg-transparent px-1.5 py-1"
        />
      );
    }
    if (inp.type === "color") {
      return (
        <input
          type="color"
          value={typeof v === "string" ? v : String(inp.default)}
          onChange={(e) => setInput(inp.key, e.target.value)}
          className="h-7 w-10 rounded border app-border bg-transparent p-0.5"
          aria-label={inp.label}
        />
      );
    }
    if (inp.type === "text") {
      return (
        <input
          type="text"
          value={typeof v === "string" ? v : String(inp.default)}
          onChange={(e) => setInput(inp.key, e.target.value)}
          className="w-32 rounded border app-border bg-transparent px-1.5 py-1 text-right"
        />
      );
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
            def.kind === "sessions" ? (
              <SessionInputs inputs={value.inputs} onSet={setInput} />
            ) : def.inputs.length === 0 ? (
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
