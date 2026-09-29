"use client";

import { useState } from "react";
import { Crosshair, RotateCcw, X } from "lucide-react";

import { formatNewYorkDateTime } from "@/lib/date-time";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";
import {
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

type Tab = "inputs" | "style" | "visibility";

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
    <label className="flex min-h-12 items-center justify-between gap-4 rounded-lg border app-border bg-[var(--app-panel-2)]/35 px-3 py-2 text-xs">
      <span className="font-medium app-muted">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </label>
  );
}

const inputCls = "h-9 rounded-lg border app-border bg-[var(--app-panel-solid)] px-2 text-right outline-none focus:border-brand-400/60";

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
  const sessions = [
    { id: "asia", label: "Asia", hint: "Tokyo / Pacific", color: "#2962ff", start: "20:00", end: "00:00", line: false },
    { id: "london", label: "London", hint: "European open", color: "#f9ab00", start: "03:00", end: "08:00", line: true },
    { id: "newYork", label: "New York", hint: "US cash session", color: "#089981", start: "08:00", end: "12:00", line: false },
  ];
  const value = (key: string, fallback: InputValue) => inputs[key] ?? fallback;

  return (
    <div className="space-y-5 pb-2">
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Session clock</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <label className="text-[11px] font-medium app-muted">
            Time zone
            <select value={String(value("timezone", "America/New_York"))} onChange={(event) => onSet("timezone", event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border app-border bg-[var(--app-panel-2)] px-3 text-xs text-[var(--app-text)] outline-none focus:border-brand-400/60">
              <option value="America/New_York">New York</option>
              <option value="Etc/UTC">UTC</option>
              <option value="Europe/London">London</option>
              <option value="Asia/Tokyo">Tokyo</option>
            </select>
          </label>
          <label className="text-[11px] font-medium app-muted">
            Days back
            <input type="number" min={1} max={30} value={Number(value("lookbackDays", 3))} onChange={(event) => onSet("lookbackDays", Math.max(1, Math.min(30, Number(event.target.value))))} className="mt-1.5 h-10 w-full rounded-lg border app-border bg-[var(--app-panel-2)] px-3 text-right text-xs text-[var(--app-text)] outline-none focus:border-brand-400/60" />
          </label>
        </div>
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg border app-border bg-[var(--app-panel-2)]/35 px-3 py-2.5 text-xs">
          <span><span className="block font-medium">Show session ranges</span><span className="mt-0.5 block text-[10px] app-muted">Shade the high-to-low range for every enabled session</span></span>
          <input type="checkbox" checked={value("showBoxes", true) !== false} onChange={(event) => onSet("showBoxes", event.target.checked)} className="h-4 w-4 shrink-0 accent-brand-400" />
        </label>
      </section>

      <div className="space-y-3">
        {sessions.map((session, index) => {
          const enabled = value(`${session.id}Enabled`, true) !== false;
          const lineEnabled = value(`${session.id}LineEnabled`, session.line) === true;
          const sessionColor = String(value(`${session.id}Color`, session.color));
          return (
            <section key={session.id} className={`rounded-xl border app-border bg-[var(--app-panel-2)]/30 p-4 transition-opacity ${enabled ? "" : "opacity-55"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--app-panel-2)] font-mono text-[10px] font-semibold app-muted">{String.fromCharCode(65 + index)}</span>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
                  <input type="checkbox" checked={enabled} onChange={(event) => onSet(`${session.id}Enabled`, event.target.checked)} className="h-4 w-4 accent-brand-400" />
                  Enable
                </label>
                <label className="flex min-w-40 flex-1 items-center gap-2 text-[11px] app-muted">
                  Name
                  <input type="text" value={String(value(`${session.id}Name`, session.label))} onChange={(event) => onSet(`${session.id}Name`, event.target.value)} disabled={!enabled} className="h-9 min-w-0 flex-1 rounded-lg border app-border bg-[var(--app-panel-solid)] px-3 text-xs text-[var(--app-text)] outline-none focus:border-brand-400/60 disabled:cursor-not-allowed" />
                </label>
                <input type="color" value={sessionColor} onChange={(event) => onSet(`${session.id}Color`, event.target.value)} disabled={!enabled} className="h-9 w-11 cursor-pointer rounded-lg border app-border bg-transparent p-1 disabled:cursor-not-allowed" aria-label={`${session.label} color`} />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_7.5rem_1rem_7.5rem] sm:items-end">
                <div><p className="text-[11px] font-medium app-muted">Hours</p><p className="mt-1 text-[10px] app-muted">Times use the selected zone</p></div>
                <label className="text-[10px] app-muted">Starts<input type="time" value={String(value(`${session.id}Start`, session.start))} onChange={(event) => onSet(`${session.id}Start`, event.target.value)} disabled={!enabled} className="mt-1.5 h-9 w-full rounded-lg border app-border bg-[var(--app-panel-solid)] px-2 text-xs text-[var(--app-text)] outline-none focus:border-brand-400/60 disabled:cursor-not-allowed" /></label>
                <span className="hidden h-9 items-center justify-center app-muted sm:flex">–</span>
                <label className="text-[10px] app-muted">Ends<input type="time" value={String(value(`${session.id}End`, session.end))} onChange={(event) => onSet(`${session.id}End`, event.target.value)} disabled={!enabled} className="mt-1.5 h-9 w-full rounded-lg border app-border bg-[var(--app-panel-solid)] px-2 text-xs text-[var(--app-text)] outline-none focus:border-brand-400/60 disabled:cursor-not-allowed" /></label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t app-border pt-3">
                <label className="flex cursor-pointer items-center gap-2 text-[11px]"><input type="checkbox" checked={lineEnabled} onChange={(event) => onSet(`${session.id}LineEnabled`, event.target.checked)} disabled={!enabled} className="h-4 w-4 accent-brand-400 disabled:cursor-not-allowed" /> Start line</label>
                <label className="ml-auto flex items-center gap-2 text-[11px] app-muted">Fill <input type="range" min={0} max={100} value={Number(value(`${session.id}Transparency`, 76))} onChange={(event) => onSet(`${session.id}Transparency`, Number(event.target.value))} disabled={!enabled} className="w-24 accent-brand-400 disabled:cursor-not-allowed" /><span className="w-8 text-right font-mono text-[10px]">{Number(value(`${session.id}Transparency`, 76))}%</span></label>
                <label className="flex items-center gap-2 text-[11px] app-muted">Border<select value={String(value(`${session.id}BorderWidth`, 1))} onChange={(event) => onSet(`${session.id}BorderWidth`, Number(event.target.value))} disabled={!enabled} className="h-8 rounded-lg border app-border bg-[var(--app-panel-solid)] px-2 text-[11px] text-[var(--app-text)] disabled:cursor-not-allowed">{[0, 1, 2, 3, 4].map((width) => <option key={width} value={width}>{width === 0 ? "None" : `${width}px`}</option>)}</select></label>
              </div>

              {lineEnabled && enabled && (
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-[var(--app-panel-2)] p-3 sm:grid-cols-4">
                  <label className="text-[10px] app-muted">Line time<input type="time" value={String(value(`${session.id}LineTime`, session.start))} onChange={(event) => onSet(`${session.id}LineTime`, event.target.value)} className="mt-1 h-8 w-full rounded border app-border bg-[var(--app-panel-solid)] px-2 text-[11px] text-[var(--app-text)]" /></label>
                  <label className="text-[10px] app-muted">Color<input type="color" value={String(value(`${session.id}LineColor`, session.color))} onChange={(event) => onSet(`${session.id}LineColor`, event.target.value)} className="mt-1 h-8 w-full rounded border app-border bg-transparent p-0.5" /></label>
                  <label className="text-[10px] app-muted">Style<select value={String(value(`${session.id}LineStyle`, "dashed"))} onChange={(event) => onSet(`${session.id}LineStyle`, event.target.value)} className="mt-1 h-8 w-full rounded border app-border bg-[var(--app-panel-solid)] px-2 text-[11px] text-[var(--app-text)]"><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label>
                  <label className="text-[10px] app-muted">Width<select value={String(value(`${session.id}LineWidth`, 1))} onChange={(event) => onSet(`${session.id}LineWidth`, Number(event.target.value))} className="mt-1 h-8 w-full rounded border app-border bg-[var(--app-panel-solid)] px-2 text-[11px] text-[var(--app-text)]">{[1, 2, 3, 4].map((width) => <option key={width} value={width}>{width}px</option>)}</select></label>
                </div>
              )}
            </section>
          );
        })}
      </div>
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
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border app-border bg-[var(--app-panel-solid)] px-3 text-[11px] hover:border-brand-400/50"
        >
          <Crosshair size={12} />
          {t > 0 ? formatNewYorkDateTime(t * 1000, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Pick on chart"}
        </button>
      );
    }
    if (inp.type === "boolean") {
      return <input type="checkbox" checked={Boolean(v)} onChange={(e) => setInput(inp.key, e.target.checked)} className="h-4 w-4 accent-brand-400" />;
    }
    if (inp.type === "time") {
      return (
        <input
          type="time"
          value={typeof v === "string" ? v : String(inp.default)}
          onChange={(e) => setInput(inp.key, e.target.value)}
          className="h-9 rounded-lg border app-border bg-[var(--app-panel-solid)] px-2 outline-none focus:border-brand-400/60"
        />
      );
    }
    if (inp.type === "color") {
      return (
        <input
          type="color"
          value={typeof v === "string" ? v : String(inp.default)}
          onChange={(e) => setInput(inp.key, e.target.value)}
          className="h-9 w-11 cursor-pointer rounded-lg border app-border bg-transparent p-1"
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
          className="h-9 w-36 rounded-lg border app-border bg-[var(--app-panel-solid)] px-2 text-right outline-none focus:border-brand-400/60"
        />
      );
    }
    if (inp.type === "source") {
      return (
        <select value={String(v)} onChange={(e) => setInput(inp.key, e.target.value)} className="h-9 min-w-28 rounded-lg border app-border bg-[var(--app-panel-solid)] px-2 outline-none focus:border-brand-400/60">
          {SOURCE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      );
    }
    if (inp.type === "select") {
      return (
        <select value={String(v)} onChange={(e) => setInput(inp.key, e.target.value)} className="h-9 min-w-28 rounded-lg border app-border bg-[var(--app-panel-solid)] px-2 outline-none focus:border-brand-400/60">
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
        className={`w-28 ${inputCls}`}
      />
    );
  };

  const sectionsPresent = SECTION_ORDER.filter((sec) => def.inputs.some((i) => (i.section ?? "inputs") === sec));

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-3 backdrop-blur-[2px]" onPointerDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${def.name} settings`}
        tabIndex={-1}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border app-border bg-[var(--app-panel-solid)] shadow-2xl outline-none ${def.kind === "sessions" ? "max-w-[680px]" : "max-w-[540px]"}`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b app-border px-5 py-4">
          <div className="min-w-0"><h3 className="truncate text-base font-semibold">{def.name}</h3><p className="mt-1 text-[11px] app-muted">{def.description}</p></div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-6 border-b app-border px-5">
          {(["inputs", "style", "visibility"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`border-b-2 px-0 py-3 text-xs font-semibold capitalize transition-colors ${tab === t ? "border-brand-400 text-[var(--app-text)]" : "border-transparent app-muted hover:text-[var(--app-text)]"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === "inputs" && (
            def.kind === "sessions" ? (
              <SessionInputs inputs={value.inputs} onSet={setInput} />
            ) : def.inputs.length === 0 ? (
              <p className="py-4 text-center text-xs app-muted">This indicator has no inputs.</p>
            ) : (
              sectionsPresent.map((sec) => (
                <div key={sec} className="mb-5 last:mb-0">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">{SECTION_LABELS[sec]}</p>
                  <div className="grid gap-2 sm:grid-cols-2">{def.inputs.filter((i) => (i.section ?? "inputs") === sec).map((inp) => (
                    <Row key={inp.key} label={inp.label}>{renderInput(inp)}</Row>
                  ))}</div>
                </div>
              ))
            )
          )}

          {tab === "style" && (def.plots.length === 0 ? <p className="py-10 text-center text-xs app-muted">This indicator has no separate plot styles.</p> : <div className="grid gap-3 sm:grid-cols-2">{def.plots.map((plot) => {
              const s = value.style[plot.key]!;
              return (
                <div key={plot.key} className="rounded-xl border app-border bg-[var(--app-panel-2)]/35 p-3">
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
                      className="h-9 w-11 cursor-pointer rounded-lg border app-border bg-transparent p-1"
                    />
                  </div>
                  {plot.kind === "line" && (
                    <div className="mt-3 flex items-center gap-2">
                      <select value={s.lineStyle} onChange={(e) => setStyle(plot.key, { lineStyle: e.target.value as LineStyleName })} className="h-8 flex-1 rounded-lg border app-border bg-[var(--app-panel-solid)] px-2 text-[11px]">
                        {LINE_STYLES.map((ls) => (
                          <option key={ls.value} value={ls.value}>{ls.label}</option>
                        ))}
                      </select>
                      <select value={s.lineWidth} onChange={(e) => setStyle(plot.key, { lineWidth: Number(e.target.value) })} className="h-8 rounded-lg border app-border bg-[var(--app-panel-solid)] px-2 text-[11px]">
                        {[1, 2, 3, 4].map((w) => (
                          <option key={w} value={w}>{w}px</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2 text-[11px] app-muted">
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
            })}</div>)}

          {tab === "visibility" && (
            <div className="grid gap-2 sm:grid-cols-2">
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
              <p className="rounded-lg bg-[var(--app-panel-2)]/35 p-3 text-[11px] leading-5 app-muted sm:col-span-2">Leave precision blank to inherit the chart&apos;s decimals.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t app-border px-5 py-3">
          <button type="button" onClick={resetDefaults} className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"><RotateCcw size={13} /> Reset</button>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-brand-500 px-5 text-xs font-semibold text-surface-950 hover:bg-brand-400">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
