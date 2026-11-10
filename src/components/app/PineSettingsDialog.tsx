"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";
import { parsePineInputs, PINE_SOURCES, type PineInput, type PineInputValue } from "@/lib/chart/pine-inputs";
import type { PineChartIndicator, PineStyle } from "@/lib/chart/pine-scripts";
import type { PineReport } from "./pine-render";

type Tab = "inputs" | "style";
const field = "h-9 rounded-lg border app-border bg-[var(--app-panel-solid)] px-2 text-xs text-[var(--app-text)] outline-none focus:border-brand-400/60";
const SOURCE_LABELS: Record<string, string> = { open: "Open", high: "High", low: "Low", close: "Close", hl2: "(H + L)/2", hlc3: "(H + L + C)/3", ohlc4: "(O + H + L + C)/4", hlcc4: "(H + L + C + C)/4", volume: "Volume" };

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-1 text-xs">
      <span className="min-w-0 truncate app-muted" title={typeof label === "string" ? label : undefined}>{label}</span>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** "#RRGGBB" for a color input; scripts may carry alpha or named colors. */
function hex6(color: string | null | undefined, fallback = "#2962FF"): string {
  return color && /^#[0-9a-f]{6}/i.test(color) ? color.slice(0, 7) : fallback;
}

/**
 * TradingView-style settings for a Pine script on the chart: the script's own
 * inputs, and the style of each plot, level, fill, background and marker.
 */
export function PineSettingsDialog({
  item,
  report,
  onChange,
  onClose,
}: {
  item: PineChartIndicator;
  report: PineReport | undefined;
  onChange: (patch: Partial<Pick<PineChartIndicator, "inputs" | "style">>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("inputs");
  const dialogRef = useModalBehavior<HTMLDivElement>({ open: true, onClose });
  const inputs = useMemo(() => parsePineInputs(item.code), [item.code]);
  const style: PineStyle = item.style ?? {};

  const setInput = (key: string, value: PineInputValue) => onChange({ inputs: { ...item.inputs, [key]: value } });
  const setPlot = (index: number, patch: NonNullable<PineStyle["plots"]>[string]) =>
    onChange({ style: { ...style, plots: { ...style.plots, [index]: { ...style.plots?.[index], ...patch } } } });
  const setLevel = (index: number, patch: NonNullable<PineStyle["hlines"]>[string]) =>
    onChange({ style: { ...style, hlines: { ...style.hlines, [index]: { ...style.hlines?.[index], ...patch } } } });

  const renderInput = (input: PineInput) => {
    const value = item.inputs?.[input.key] ?? input.defval;
    if (input.defval == null || input.kind === "other") {
      return <code className="max-w-44 truncate rounded bg-[var(--app-panel-2)] px-2 py-1 text-[11px] app-muted" title="Set in the script's code">{input.defvalText}</code>;
    }
    if (input.options) {
      return (
        <select value={String(value)} onChange={(event) => setInput(input.key, input.kind === "int" || input.kind === "float" ? Number(event.target.value) : event.target.value)} className={`${field} min-w-28`}>
          {input.options.map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
        </select>
      );
    }
    switch (input.kind) {
      case "bool":
        return <input type="checkbox" checked={value === true} onChange={(event) => setInput(input.key, event.target.checked)} className="h-4 w-4 accent-brand-400" aria-label={input.title} />;
      case "source":
        return (
          <select value={String(value)} onChange={(event) => setInput(input.key, event.target.value)} className={`${field} min-w-32`} aria-label={input.title}>
            {PINE_SOURCES.map((source) => <option key={source} value={source}>{SOURCE_LABELS[source]}</option>)}
          </select>
        );
      case "color":
        return <input type="color" value={hex6(String(value))} onChange={(event) => setInput(input.key, event.target.value.toUpperCase())} className="h-9 w-11 cursor-pointer rounded-lg border app-border bg-transparent p-1" aria-label={input.title} />;
      case "int":
      case "float":
        return (
          <input
            type="number"
            value={Number(value)}
            min={input.minval}
            max={input.maxval}
            step={input.step ?? (input.kind === "int" ? 1 : "any")}
            aria-label={input.title}
            onChange={(event) => {
              if (event.target.value === "") return;
              let next = Number(event.target.value);
              if (input.minval != null) next = Math.max(input.minval, next);
              if (input.maxval != null) next = Math.min(input.maxval, next);
              setInput(input.key, input.kind === "int" ? Math.round(next) : next);
            }}
            className={`${field} w-28 text-right`}
          />
        );
      default:
        return <input type="text" value={String(value)} onChange={(event) => setInput(input.key, event.target.value)} className={`${field} w-40 text-right`} aria-label={input.title} />;
    }
  };

  const plots = report?.plots ?? [];
  const levels = report?.hlines ?? [];

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-3 backdrop-blur-[2px]" onPointerDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${item.name} settings`}
        tabIndex={-1}
        data-testid="pine-settings-dialog"
        className="flex max-h-[90vh] w-full max-w-[500px] flex-col overflow-hidden rounded-2xl border app-border bg-[var(--app-panel-solid)] shadow-2xl outline-none"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b app-border px-5 py-4">
          <h3 className="truncate text-base font-semibold">{item.name}</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-6 border-b app-border px-5" role="tablist">
          {(["inputs", "style"] as Tab[]).map((name) => (
            <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)} className={`border-b-2 px-0 py-3 text-xs font-semibold capitalize transition-colors ${tab === name ? "border-brand-400 text-[var(--app-text)]" : "border-transparent app-muted hover:text-[var(--app-text)]"}`}>
              {name}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {tab === "inputs" && (inputs.length === 0
            ? <p className="py-6 text-center text-xs app-muted">This script has no inputs.</p>
            : <div className="divide-y divide-[var(--app-border)]">{inputs.map((input) => <Row key={input.key} label={input.title}>{renderInput(input)}</Row>)}</div>)}

          {tab === "style" && (
            !report ? <p className="py-6 text-center text-xs app-muted">Style options appear once the script has run on the chart.</p> : (
              <div className="space-y-4">
                {plots.length > 0 && (
                  <section>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Plots</p>
                    <div className="divide-y divide-[var(--app-border)]">
                      {plots.map((plot, index) => {
                        const custom = style.plots?.[index] ?? {};
                        const visible = custom.visible ?? plot.linewidth > 0;
                        const bars = plot.style === "histogram" || plot.style === "columns";
                        return (
                          <Row key={index} label={
                            <label className="flex items-center gap-2 text-[var(--app-text)]">
                              <input type="checkbox" checked={visible} onChange={(event) => setPlot(index, { visible: event.target.checked, ...(event.target.checked && plot.linewidth <= 0 && custom.linewidth == null ? { linewidth: 1 } : {}) })} className="h-4 w-4 accent-brand-400" />
                              <span className="truncate">{plot.title}</span>
                            </label>
                          }>
                            {plot.colors
                              ? <span className="text-[11px] app-muted" title="This plot's color changes with the script's conditions">Conditional color</span>
                              : <input type="color" value={hex6(custom.color ?? plot.color)} onChange={(event) => setPlot(index, { color: event.target.value })} className="h-9 w-11 cursor-pointer rounded-lg border app-border bg-transparent p-1" aria-label={`${plot.title} color`} />}
                            {!bars && (
                              <select value={custom.linewidth ?? Math.max(1, plot.linewidth)} onChange={(event) => setPlot(index, { linewidth: Number(event.target.value) })} className={field} aria-label={`${plot.title} width`}>
                                {[1, 2, 3, 4].map((width) => <option key={width} value={width}>{width}px</option>)}
                              </select>
                            )}
                          </Row>
                        );
                      })}
                    </div>
                  </section>
                )}
                {levels.length > 0 && (
                  <section>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Levels</p>
                    <div className="divide-y divide-[var(--app-border)]">
                      {levels.map((level, index) => {
                        const custom = style.hlines?.[index] ?? {};
                        return (
                          <Row key={index} label={
                            <label className="flex items-center gap-2 text-[var(--app-text)]">
                              <input type="checkbox" checked={custom.visible !== false} onChange={(event) => setLevel(index, { visible: event.target.checked })} className="h-4 w-4 accent-brand-400" />
                              <span className="truncate">{level.title ?? "Level"}{level.price != null ? ` · ${level.price}` : ""}</span>
                            </label>
                          }>
                            <input type="color" value={hex6(custom.color ?? level.color, "#787B86")} onChange={(event) => setLevel(index, { color: event.target.value })} className="h-9 w-11 cursor-pointer rounded-lg border app-border bg-transparent p-1" aria-label={`${level.title ?? "Level"} color`} />
                          </Row>
                        );
                      })}
                    </div>
                  </section>
                )}
                {(report.fills.length > 0 || report.backgrounds.length > 0 || report.markers.length > 0) && (
                  <section>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] app-muted">Other</p>
                    <div className="divide-y divide-[var(--app-border)]">
                      {([
                        ["fills", "Fills between lines", report.fills.length > 0],
                        ["backgrounds", "Background colors", report.backgrounds.length > 0],
                        ["markers", "Shapes and arrows", report.markers.length > 0],
                      ] as const).filter(([, , present]) => present).map(([key, label]) => (
                        <Row key={key} label={label}>
                          <input type="checkbox" checked={style[key] !== false} onChange={(event) => onChange({ style: { ...style, [key]: event.target.checked } })} className="h-4 w-4 accent-brand-400" aria-label={label} />
                        </Row>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t app-border px-5 py-3">
          <button type="button" onClick={() => onChange({ inputs: {}, style: {} })} className="h-9 rounded-lg border app-border px-4 text-xs font-semibold hover:bg-[var(--app-panel-2)]">
            Defaults
          </button>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-brand-500 px-5 text-xs font-semibold text-surface-950 hover:bg-brand-400">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
