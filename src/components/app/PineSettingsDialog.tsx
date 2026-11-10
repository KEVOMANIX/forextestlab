"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";
import { parsePineInputs, PINE_SOURCES, type PineInput, type PineInputValue } from "@/lib/chart/pine-inputs";
import { distinctPineColors, remapPineColor, type PineChartIndicator, type PineColorMap, type PineStyle } from "@/lib/chart/pine-scripts";
import type { PineReport } from "./pine-render";

type Tab = "inputs" | "style";
const field = "h-9 rounded-lg border app-border bg-[var(--app-panel-solid)] px-2 text-xs text-[var(--app-text)] outline-none focus:border-brand-400/60";
const SOURCE_LABELS: Record<string, string> = { open: "Open", high: "High", low: "Low", close: "Close", hl2: "(H + L)/2", hlc3: "(H + L + C)/3", ohlc4: "(O + H + L + C)/4", hlcc4: "(H + L + C + C)/4", volume: "Volume" };
const LOCATIONS: { value: string; label: string }[] = [
  { value: "abovebar", label: "Above bar" }, { value: "belowbar", label: "Below bar" }, { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" }, { value: "absolute", label: "Absolute" },
];
const SHAPE_GLYPHS: Record<string, string> = {
  circle: "●", square: "■", diamond: "◆", triangleup: "▲", triangledown: "▼", arrowup: "⬆", arrowdown: "⬇",
  labelup: "⬓", labeldown: "⬒", cross: "+", xcross: "×", flag: "⚑",
};

function Row({ label, children, indent = false }: { label: React.ReactNode; children?: React.ReactNode; indent?: boolean }) {
  return (
    <div className={`flex min-h-11 items-center justify-between gap-3 py-1 text-xs ${indent ? "pl-7" : ""}`}>
      <div className="min-w-0 flex-1 truncate">{label}</div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex min-w-0 items-center gap-2.5 text-[var(--app-text)]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 shrink-0 accent-brand-400" />
      <span className="truncate">{label || " "}</span>
    </label>
  );
}

/** A color swatch over a checkerboard, so transparent script colors still read as colors. */
function Swatch({ color, onChange, label }: { color: string; onChange: (hex: string) => void; label: string }) {
  const alpha = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(color)?.[1];
  const opacity = alpha ? parseInt(alpha, 16) / 255 : 1;
  return (
    <label className="relative grid h-9 w-9 cursor-pointer place-items-center overflow-hidden rounded-lg border app-border bg-[conic-gradient(#8884_25%,transparent_0_50%,#8884_0_75%,transparent_0)] bg-[length:8px_8px]" title={label}>
      <span className="absolute inset-1.5 rounded" style={{ backgroundColor: color.slice(0, 7), opacity: Math.max(opacity, 0.12) }} />
      <input type="color" value={color.slice(0, 7)} onChange={(event) => onChange(event.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label} />
    </label>
  );
}

/** One swatch per distinct color the element uses; a single color sits on its row. */
function ColorSet({ item, map, onChange, label }: { item: { color: string | null; colors: (string | null)[] | null }; map: PineColorMap | undefined; onChange: (map: PineColorMap) => void; label: string }) {
  const colors = distinctPineColors(item);
  if (colors.length === 0) return null;
  const set = (original: string, hex: string) => onChange({ ...map, [original]: hex });
  if (colors.length === 1) return <Swatch color={remapPineColor(colors[0], map) ?? colors[0]!} onChange={(hex) => set(colors[0]!, hex)} label={`${label} color`} />;
  return null;
}
function ColorRows({ item, map, onChange, label }: { item: { color: string | null; colors: (string | null)[] | null }; map: PineColorMap | undefined; onChange: (map: PineColorMap) => void; label: string }) {
  const colors = distinctPineColors(item);
  if (colors.length < 2) return null;
  return <>{colors.map((original, index) => (
    <Row key={original} indent label={<span className="app-muted">Color {index}</span>}>
      <Swatch color={remapPineColor(original, map) ?? original} onChange={(hex) => onChange({ ...map, [original]: hex })} label={`${label} color ${index}`} />
    </Row>
  ))}</>;
}

/**
 * TradingView-style settings for a Pine script on the chart: the script's own
 * inputs, and the style of everything it draws. Changes show on the chart as
 * they are made; Cancel puts back what was there when the dialog opened.
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
  const opened = useRef({ inputs: item.inputs ?? {}, style: item.style ?? {} });
  const cancel = () => { onChange(opened.current); onClose(); };
  const dialogRef = useModalBehavior<HTMLDivElement>({ open: true, onClose: cancel });
  const inputs = useMemo(() => parsePineInputs(item.code), [item.code]);
  const style: PineStyle = item.style ?? {};

  const setInput = (key: string, value: PineInputValue) => onChange({ inputs: { ...item.inputs, [key]: value } });
  const patch = <K extends "plots" | "shapes" | "hlines" | "fillItems" | "backgroundItems">(group: K, index: number, change: NonNullable<PineStyle[K]>[string]) =>
    onChange({ style: { ...style, [group]: { ...style[group], [index]: { ...style[group]?.[index], ...change } } } });

  const renderInput = (input: PineInput) => {
    const value = item.inputs?.[input.key] ?? input.defval;
    if (input.defval == null || input.kind === "other") {
      return <code className="max-w-44 truncate rounded bg-[var(--app-panel-2)] px-2 py-1 text-[11px] app-muted" title="Set in the script's code">{input.defvalText}</code>;
    }
    if (input.options) {
      return (
        <select value={String(value)} onChange={(event) => setInput(input.key, input.kind === "int" || input.kind === "float" ? Number(event.target.value) : event.target.value)} className={`${field} min-w-28`} aria-label={input.title}>
          {input.options.map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
        </select>
      );
    }
    switch (input.kind) {
      case "source":
        return (
          <select value={String(value)} onChange={(event) => setInput(input.key, event.target.value)} className={`${field} min-w-32`} aria-label={input.title}>
            {PINE_SOURCES.map((source) => <option key={source} value={source}>{SOURCE_LABELS[source]}</option>)}
          </select>
        );
      case "color":
        return <Swatch color={String(value)} onChange={(hex) => setInput(input.key, hex)} label={input.title} />;
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
  const shapes = report?.shapes ?? [];
  const levels = report?.hlines ?? [];
  const fills = report?.fills ?? [];
  const backgrounds = report?.backgrounds ?? [];
  const section = "mb-1 mt-4 text-[10px] font-semibold uppercase tracking-[0.15em] app-muted first:mt-1";

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-3 backdrop-blur-[2px]" onPointerDown={cancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${item.name} settings`}
        tabIndex={-1}
        data-testid="pine-settings-dialog"
        className="flex max-h-[90vh] w-full max-w-[460px] flex-col overflow-hidden rounded-2xl border app-border bg-[var(--app-panel-solid)] shadow-2xl outline-none"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b app-border px-5 py-4">
          <h3 className="truncate text-base font-semibold">{item.name}</h3>
          <button type="button" aria-label="Close" onClick={cancel} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]">
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
          {tab === "inputs" && (
            <div>
              <Row label={<span className="app-muted">Indicator timeframe</span>}>
                <select disabled className={`${field} min-w-28 opacity-70`} title="Scripts run on the chart's own timeframe"><option>Chart</option></select>
              </Row>
              {inputs.length === 0 && <p className="py-4 text-center text-xs app-muted">This script has no other inputs.</p>}
              {inputs.map((input) => input.kind === "bool" && input.defval != null
                ? <Row key={input.key} label={<Check checked={(item.inputs?.[input.key] ?? input.defval) === true} onChange={(value) => setInput(input.key, value)} label={input.title} />} />
                : <Row key={input.key} label={<span className="app-muted" title={input.title}>{input.title}</span>}>{renderInput(input)}</Row>)}
            </div>
          )}

          {tab === "style" && (
            !report ? <p className="py-6 text-center text-xs app-muted">Style options appear once the script has run on the chart.</p> : (
              <div>
                {plots.map((plot, index) => {
                  const custom = style.plots?.[index];
                  const map = custom?.colors ?? (custom?.color && plot.color ? { [plot.color.toUpperCase()]: custom.color } : undefined);
                  const bars = plot.style === "histogram" || plot.style === "columns";
                  const visible = custom?.visible ?? plot.linewidth > 0;
                  return (
                    <div key={`plot-${index}`}>
                      <Row label={<Check checked={visible} onChange={(value) => patch("plots", index, { visible: value, ...(value && plot.linewidth <= 0 && custom?.linewidth == null ? { linewidth: 1 } : {}) })} label={plot.title.startsWith("Plot ") ? "" : plot.title} />}>
                        <ColorSet item={plot} map={map} onChange={(colors) => patch("plots", index, { colors, color: undefined })} label={plot.title} />
                        {!bars && (
                          <select value={custom?.linewidth ?? Math.max(0, plot.linewidth)} onChange={(event) => patch("plots", index, { linewidth: Number(event.target.value) })} className={field} aria-label={`${plot.title} width`}>
                            {[0, 1, 2, 3, 4].map((width) => <option key={width} value={width}>{width}px</option>)}
                          </select>
                        )}
                      </Row>
                      <ColorRows item={plot} map={map} onChange={(colors) => patch("plots", index, { colors, color: undefined })} label={plot.title} />
                    </div>
                  );
                })}
                {shapes.map((shape, index) => {
                  const custom = style.shapes?.[index];
                  const label = shape.title ?? (shape.kind === "arrow" ? "Arrows" : shape.kind === "char" ? `Character ${shape.style}` : "Shapes");
                  const item = shape.kind === "arrow" ? { color: null, colors: [shape.colorup ?? null, shape.colordown ?? null] } : shape;
                  return (
                    <div key={`shape-${index}`}>
                      <Row label={<Check checked={custom?.visible !== false} onChange={(value) => patch("shapes", index, { visible: value })} label={label} />}>
                        <ColorSet item={item} map={custom?.colors} onChange={(colors) => patch("shapes", index, { colors })} label={label} />
                        {shape.kind !== "arrow" && <span className="grid h-9 w-9 place-items-center rounded-lg border app-border text-sm app-muted" aria-hidden>{shape.kind === "char" ? shape.style : SHAPE_GLYPHS[shape.style] ?? "×"}</span>}
                        {shape.kind !== "arrow" && (
                          <select value={custom?.location ?? shape.location} onChange={(event) => patch("shapes", index, { location: event.target.value })} className={`${field} w-28`} aria-label={`${label} location`}>
                            {LOCATIONS.map((location) => <option key={location.value} value={location.value}>{location.label}</option>)}
                          </select>
                        )}
                      </Row>
                      <ColorRows item={item} map={custom?.colors} onChange={(colors) => patch("shapes", index, { colors })} label={label} />
                    </div>
                  );
                })}
                {levels.map((level, index) => {
                  const custom = style.hlines?.[index];
                  return (
                    <Row key={`level-${index}`} label={<Check checked={custom?.visible !== false} onChange={(value) => patch("hlines", index, { visible: value })} label={`${level.title ?? "Level"}${level.price != null ? ` · ${level.price}` : ""}`} />}>
                      <Swatch color={(custom?.color ?? level.color).toUpperCase()} onChange={(hex) => patch("hlines", index, { color: hex })} label={`${level.title ?? "Level"} color`} />
                    </Row>
                  );
                })}
                {fills.map((fill, index) => {
                  const custom = style.fillItems?.[index];
                  const label = fill.title ?? `Fill ${index + 1}`;
                  return (
                    <div key={`fill-${index}`}>
                      <Row label={<Check checked={custom?.visible !== false && style.fills !== false} onChange={(value) => onChange({ style: { ...style, fills: undefined, fillItems: { ...style.fillItems, [index]: { ...custom, visible: value } } } })} label={label} />}>
                        <ColorSet item={fill} map={custom?.colors} onChange={(colors) => patch("fillItems", index, { colors })} label={label} />
                      </Row>
                      <ColorRows item={fill} map={custom?.colors} onChange={(colors) => patch("fillItems", index, { colors })} label={label} />
                    </div>
                  );
                })}
                {backgrounds.map((background, index) => {
                  const custom = style.backgroundItems?.[index];
                  const label = background.title ?? `Background ${index + 1}`;
                  return (
                    <div key={`bg-${index}`}>
                      <Row label={<Check checked={custom?.visible !== false && style.backgrounds !== false} onChange={(value) => onChange({ style: { ...style, backgrounds: undefined, backgroundItems: { ...style.backgroundItems, [index]: { ...custom, visible: value } } } })} label={label} />}>
                        <ColorSet item={background} map={custom?.colors} onChange={(colors) => patch("backgroundItems", index, { colors })} label={label} />
                      </Row>
                      <ColorRows item={background} map={custom?.colors} onChange={(colors) => patch("backgroundItems", index, { colors })} label={label} />
                    </div>
                  );
                })}

                <p className={section}>Output values</p>
                <Row label={<span className="app-muted">Precision</span>}>
                  <select value={style.precision ?? ""} onChange={(event) => onChange({ style: { ...style, precision: event.target.value === "" ? null : Number(event.target.value) } })} className={`${field} w-28`} aria-label="Precision">
                    <option value="">Default</option>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((digits) => <option key={digits} value={digits}>{digits}</option>)}
                  </select>
                </Row>
                <Row label={<Check checked={style.priceLabels !== false} onChange={(value) => onChange({ style: { ...style, priceLabels: value } })} label="Labels on price scale" />} />
                <Row label={<Check checked={style.statusValues !== false} onChange={(value) => onChange({ style: { ...style, statusValues: value } })} label="Values in status line" />} />
              </div>
            )
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t app-border px-5 py-3">
          <button type="button" onClick={() => onChange({ inputs: {}, style: {} })} className="h-9 rounded-lg border app-border px-4 text-xs font-semibold hover:bg-[var(--app-panel-2)]">
            Defaults
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={cancel} className="h-9 rounded-lg border app-border px-4 text-xs font-semibold hover:bg-[var(--app-panel-2)]">
              Cancel
            </button>
            <button type="button" onClick={onClose} className="h-9 rounded-lg bg-brand-500 px-5 text-xs font-semibold text-surface-950 hover:bg-brand-400">
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
