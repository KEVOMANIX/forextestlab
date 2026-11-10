"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";
import { parsePineInputs, PINE_SOURCES, type PineInput, type PineInputValue } from "@/lib/chart/pine-inputs";
import { distinctPineColors, pineLegendTitle, remapPineColor, type PineChartIndicator, type PineColorMap, type PineStyle } from "@/lib/chart/pine-scripts";
import type { PineReport } from "./pine-render";
import { ColorSwatch } from "./PineColorPicker";

type Tab = "inputs" | "style";
const field = "h-9 rounded-lg border app-border bg-[var(--app-panel-solid)] px-2 text-xs text-[var(--app-text)] outline-none focus:border-brand-400/60";
const SOURCE_LABELS: Record<string, string> = { open: "Open", high: "High", low: "Low", close: "Close", hl2: "(H + L)/2", hlc3: "(H + L + C)/3", ohlc4: "(O + H + L + C)/4", hlcc4: "(H + L + C + C)/4", volume: "Volume" };
/** input.timeframe() values as TradingView lists them ("" = the chart's own). */
const TIMEFRAMES: { value: string; label: string }[] = [
  { value: "", label: "Chart" }, { value: "1", label: "1 minute" }, { value: "3", label: "3 minutes" }, { value: "5", label: "5 minutes" },
  { value: "15", label: "15 minutes" }, { value: "30", label: "30 minutes" }, { value: "45", label: "45 minutes" }, { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" }, { value: "180", label: "3 hours" }, { value: "240", label: "4 hours" }, { value: "D", label: "1 day" },
  { value: "W", label: "1 week" }, { value: "M", label: "1 month" },
];
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
/** A color swatch with TradingView's picker (palette, custom colors, opacity); emits "#RRGGBBAA". */
function Swatch({ color, onChange, label }: { color: string; onChange: (color: string) => void; label: string }) {
  return <ColorSwatch color={color} onChange={onChange} label={label} />;
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

  /** One input's control; `compact` for controls sharing an inline row. */
  const renderInput = (input: PineInput, compact = false) => {
    const value = item.inputs?.[input.key] ?? input.defval;
    const width = (wide: string, narrow: string) => (compact ? narrow : wide);
    if (input.defval == null || input.kind === "other") {
      return <code className="max-w-44 truncate rounded bg-[var(--app-panel-2)] px-2 py-1 text-[11px] app-muted" title="Set in the script's code">{input.defvalText}</code>;
    }
    if (input.options) {
      return (
        <select value={String(value)} onChange={(event) => setInput(input.key, input.kind === "int" || input.kind === "float" ? Number(event.target.value) : event.target.value)} className={`${field} ${width("min-w-28", "min-w-0 max-w-32")}`} aria-label={input.title}>
          {input.options.map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
        </select>
      );
    }
    switch (input.kind) {
      case "bool":
        return <input type="checkbox" checked={value === true} onChange={(event) => setInput(input.key, event.target.checked)} className="h-4 w-4 shrink-0 accent-brand-400" aria-label={input.title} />;
      case "timeframe": {
        const known = TIMEFRAMES.some((option) => option.value === String(value));
        return (
          <select value={String(value)} onChange={(event) => setInput(input.key, event.target.value)} className={`${field} ${width("min-w-32", "min-w-0 max-w-32")}`} aria-label={input.title}>
            {!known && <option value={String(value)}>{String(value)}</option>}
            {TIMEFRAMES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        );
      }
      case "source":
        return (
          <select value={String(value)} onChange={(event) => setInput(input.key, event.target.value)} className={`${field} ${width("min-w-32", "min-w-0 max-w-32")}`} aria-label={input.title}>
            {PINE_SOURCES.map((source) => <option key={source} value={source}>{SOURCE_LABELS[source]}</option>)}
          </select>
        );
      case "color":
        // The picker sets the hue; the script's own transparency is kept.
        return <Swatch color={String(value)} onChange={(next) => setInput(input.key, next)} label={input.title} />;
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
            className={`${field} ${width("w-28", "w-16")} text-right`}
          />
        );
      default:
        if (typeof input.defval === "string" && input.defval.includes("\n")) {
          return <textarea value={String(value)} onChange={(event) => setInput(input.key, event.target.value)} rows={Math.min(6, String(value).split("\n").length + 1)} className={`${field} h-auto w-full py-2 font-mono leading-5`} aria-label={input.title} />;
        }
        return <input type="text" value={String(value)} onChange={(event) => setInput(input.key, event.target.value)} className={`${field} ${input.kind === "session" ? width("w-36", "w-28") : width("w-40", "w-24")} text-right`} aria-label={input.title} />;
    }
  };

  /** Inputs laid out as TradingView does: group headings, and inputs sharing inline= on one row. */
  const layout: { heading?: string; inputs: PineInput[] }[] = [];
  let lastGroup: string | undefined;
  for (const input of inputs) {
    const previous = layout.at(-1);
    const heading = input.group && input.group !== lastGroup ? input.group : undefined;
    lastGroup = input.group ?? lastGroup;
    if (!heading && previous && input.inline && previous.inputs[0]?.inline === input.inline && previous.inputs[0]?.group === input.group) previous.inputs.push(input);
    else layout.push({ heading, inputs: [input] });
  }

  const renderRow = (row: PineInput[]) => {
    const [first] = row;
    if (!first) return null;
    const multiline = row.length === 1 && typeof first.defval === "string" && first.defval.includes("\n");
    if (multiline) {
      return (
        <div className="py-1.5 text-xs">
          <p className="mb-1.5 app-muted" title={first.tooltip}>{first.title}</p>
          {renderInput(first)}
        </div>
      );
    }
    if (row.length === 1) {
      return first.kind === "bool" && first.defval != null
        ? <Row label={<span title={first.tooltip}><Check checked={(item.inputs?.[first.key] ?? first.defval) === true} onChange={(value) => setInput(first.key, value)} label={first.title} /></span>} />
        : <Row label={<span className="app-muted" title={first.tooltip ?? first.title}>{first.title}</span>}>{renderInput(first)}</Row>;
    }
    // An inline row: each input in order, titled only where the script titles it.
    return (
      <div className="flex min-h-11 flex-wrap items-center gap-2 py-1 text-xs">
        {row.map((input) => (
          <span key={input.key} className="flex min-w-0 items-center gap-2" title={input.tooltip}>
            {input.kind === "bool" && input.defval != null
              ? <Check checked={(item.inputs?.[input.key] ?? input.defval) === true} onChange={(value) => setInput(input.key, value)} label={input.rawTitle} />
              : <>{input.rawTitle && <span className="app-muted">{input.rawTitle}</span>}{renderInput(input, true)}</>}
          </span>
        ))}
      </div>
    );
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
          <h3 className="truncate text-base font-semibold">{pineLegendTitle(item.code) ?? item.name}</h3>
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
              {layout.map((row) => (
                <div key={row.inputs[0]!.key}>
                  {row.heading && <p className={section}>{row.heading}</p>}
                  {renderRow(row.inputs)}
                </div>
              ))}
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

                {(report.drawings?.length ?? 0) > 0 && <Row label={<Check checked={style.drawings !== false} onChange={(value) => onChange({ style: { ...style, drawings: value } })} label="Labels, lines, boxes and tables" />} />}

                <p className={section}>Output values</p>
                <Row label={<span className="app-muted">Precision</span>}>
                  <select value={style.precision ?? ""} onChange={(event) => onChange({ style: { ...style, precision: event.target.value === "" ? null : Number(event.target.value) } })} className={`${field} w-28`} aria-label="Precision">
                    <option value="">Default</option>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((digits) => <option key={digits} value={digits}>{digits}</option>)}
                  </select>
                </Row>
                <Row label={<Check checked={style.priceLabels !== false} onChange={(value) => onChange({ style: { ...style, priceLabels: value } })} label="Labels on price scale" />} />
                <Row label={<Check checked={style.inputsInStatus !== false} onChange={(value) => onChange({ style: { ...style, inputsInStatus: value } })} label="Inputs in status line" />} />
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
