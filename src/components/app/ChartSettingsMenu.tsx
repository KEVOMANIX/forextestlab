"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, RotateCcw, X } from "lucide-react";

import { EXCHANGE_ZONE, zoneOptionsAt } from "@/lib/chart/timezones";
import type { Timeframe } from "@/lib/market-data/types";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";

/**
 * Chart preferences and the shape they are stored in.
 *
 * Everything here is per chart rather than per session: in a multi-chart layout
 * one cell can be a plain candle view while another shows trade history, and
 * each keeps its own colours.
 */

export interface ChartSettings {
  upColor: string;
  downColor: string;
  /** Chart background, or "auto" to follow the app theme. */
  background: string;
  grid: boolean;
  magnet: boolean;
  /** Entry/exit arrows for trades the session has already closed. */
  tradeHistory: boolean;
  /** Entry, stop and target lines for positions that are still open. */
  positionLines: boolean;
  /**
   * Compact Buy/Sell buttons submit market orders without opening the planner.
   * One click means one click: there is no confirmation step behind it.
   */
  oneClickTrading: boolean;
  /** Zero disables the corresponding trading safeguard. */
  maxRiskPerTradePercent: number;
  dailyLossLimitPercent: number;
  maxDrawdownLimitPercent: number;
  sessionTradeLimit: number;
  sessionGoalAmount: number;
  distractionFree: boolean;
  shortcuts: {
    toggleReplay: string;
    stepForward: string;
    stepBack: string;
    buy: string;
    sell: string;
    bookmark: string;
    distractionFree: string;
    reference: string;
  };
  drawings: boolean;
  /** Dotted line and axis tag tracking the latest price. */
  priceLine: boolean;
  /** IANA zone id, or "exchange". Labels the axis, crosshair and corner clock. */
  timeZone: string;
  /** Type size for the axes and the chart's own overlays. */
  chartTextSize: ChartTextSize;
  /**
   * Pause replay when a stop or target fills, and offer the trade for review.
   * Only exits the trader did not choose: closing by hand means they are
   * already at the keyboard, and pausing there is one more click, not a prompt.
   */
  pauseOnTradeClose: boolean;
  /** Ask why a trade was taken as it opens, before the outcome can colour it. */
  promptEntryReason: boolean;
  /**
   * Timeframes pinned as buttons in the chart header; the rest live behind the
   * timeframe dropdown. Stored in the order the trader starred them so the row
   * does not reshuffle itself.
   */
  favoriteTimeframes: Timeframe[];
  /**
   * Mask balance, equity and P&L in the status bar.
   *
   * For recording and screen-sharing: the numbers are the one thing on the
   * screen that is nobody else's business.
   */
  hideBalances: boolean;
}

export type ChartTextSize = "small" | "medium" | "large";

export const AUTO_BACKGROUND = "auto";

/**
 * The ladder most intraday traders actually work: two execution timeframes, two
 * structure timeframes and the daily. Anything starred later joins these.
 *
 * A session's base timeframe is usually 1m, and the button for the data as it
 * was recorded should be there without being hunted for.
 */
export const DEFAULT_FAVORITE_TIMEFRAMES: Timeframe[] = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
];

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  upColor: "#22c3a0",
  downColor: "#f4646c",
  background: AUTO_BACKGROUND,
  grid: true,
  magnet: false,
  tradeHistory: true,
  positionLines: true,
  oneClickTrading: false,
  maxRiskPerTradePercent: 0,
  dailyLossLimitPercent: 0,
  maxDrawdownLimitPercent: 0,
  sessionTradeLimit: 0,
  sessionGoalAmount: 0,
  distractionFree: false,
  shortcuts: {
    toggleReplay: " ",
    stepForward: "ArrowRight",
    stepBack: "ArrowLeft",
    buy: "b",
    sell: "s",
    bookmark: "m",
    distractionFree: "f",
    reference: "?",
  },
  drawings: true,
  priceLine: true,
  timeZone: EXCHANGE_ZONE,
  chartTextSize: "medium",
  pauseOnTradeClose: true,
  promptEntryReason: true,
  favoriteTimeframes: DEFAULT_FAVORITE_TIMEFRAMES,
  hideBalances: false,
};

/** Palettes people actually use for candles, plus the app default first. */
const UP_SWATCHES = ["#22c3a0", "#26a69a", "#3fb950", "#2962ff", "#d1d4dc"];
const DOWN_SWATCHES = ["#f4646c", "#ef5350", "#f85149", "#ff9800", "#787b86"];
/** "auto" first: most people want the chart to follow the app theme. */
const BACKGROUND_SWATCHES = [AUTO_BACKGROUND, "#0b0f1a", "#131722", "#000000", "#ffffff"];


const TEXT_SIZES: { value: ChartTextSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

export type SettingsTab =
  | "appearance"
  | "scales"
  | "display"
  | "trading"
  | "risk"
  | "shortcuts";

const TABS: { key: SettingsTab; label: string }[] = [
  { key: "appearance", label: "Symbol" },
  { key: "scales", label: "Scales & lines" },
  { key: "display", label: "Display" },
  { key: "trading", label: "Trading" },
  { key: "risk", label: "Risk limits" },
  { key: "shortcuts", label: "Shortcuts" },
];

const SHORTCUT_LABELS: Record<keyof ChartSettings["shortcuts"], string> = {
  toggleReplay: "Play / pause",
  stepForward: "Next candle",
  stepBack: "Previous candle",
  buy: "Buy",
  sell: "Sell",
  bookmark: "Bookmark candle",
  distractionFree: "Distraction-free mode",
  reference: "Shortcut reference",
};

function shortcutName(value: string) {
  if (value === " ") return "Space";
  return value.length === 1 ? value.toUpperCase() : value.replace("Arrow", "↑ ").trim();
}

/**
 * Every session preference, in one dialog.
 *
 * It used to be two: chart appearance behind the chart's right-click menu, and
 * a separate "trading experience" panel behind a slider icon in the header, with
 * one-click trading appearing in both and no way to guess which one owned a
 * given setting. They are one list of preferences over one workspace, so they
 * are one dialog — reachable from the header gear and from the chart's own
 * right-click menu, which opens it on the section that menu was about.
 *
 * A dialog rather than the popover this started as: the settings had outgrown a
 * 232px strip hanging off the pointer, and a modal gives the fiddly controls —
 * colour pickers, a zone list, key capture — room to be used.
 */
export function ChartSettingsDialog({
  settings,
  theme,
  initialTab = "appearance",
  onChange,
  onReset,
  onClose,
}: {
  settings: ChartSettings;
  theme: "dark" | "light";
  /** Section to open on, so an entry point can land where it is about. */
  initialTab?: SettingsTab;
  onChange: (patch: Partial<ChartSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [capturing, setCapturing] = useState<
    keyof ChartSettings["shortcuts"] | null
  >(null);
  // Escape stands down while a key is being captured, so pressing Escape to
  // abandon a rebind does not also close the dialog.
  const dialogRef = useModalBehavior<HTMLDivElement>({
    open: true,
    onClose,
    closeOnEscape: !capturing,
  });
  // Offsets are labelled at a fixed instant so the list cannot reshuffle under
  // the pointer while the dialog is open.
  const openedAt = useRef(Date.now()).current;
  const zones = useMemo(() => zoneOptionsAt(openedAt), [openedAt]);

  const surface = theme === "dark" ? "#111725" : "#ffffff";
  const inset = theme === "dark" ? "#0b0f1a" : "#f5f7fb";
  const line = theme === "dark" ? "rgba(255,255,255,0.10)" : "#d9e0ec";

  return createPortal(
    <div
      className="fixed inset-0 z-[85] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Chart settings"
        tabIndex={-1}
        onContextMenu={(event) => event.preventDefault()}
        // Portaled outside `.app-shell`, so the scoped theme variables do not
        // reach it — these colours have to be explicit.
        className="flex max-h-[min(34rem,calc(100vh-2rem))] w-[min(38rem,100%)] flex-col overflow-hidden rounded-xl border text-sm shadow-2xl outline-none"
        style={
          {
            backgroundColor: surface,
            borderColor: line,
            color: theme === "dark" ? "#e6ecf7" : "#0f172a",
            "--focus-ring-offset": surface,
          } as React.CSSProperties
        }
      >
        <header
          className="flex shrink-0 items-center justify-between border-b px-4 py-3"
          style={{ borderColor: line }}
        >
          <h2 className="text-base font-semibold">Chart settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chart settings"
            className="grid h-7 w-7 place-items-center rounded-md opacity-70 hover:bg-white/[0.08] hover:opacity-100"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav
            className="flex w-36 shrink-0 flex-col gap-0.5 border-r p-2"
            style={{ borderColor: line, backgroundColor: inset }}
            aria-label="Settings sections"
          >
            {TABS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                aria-current={tab === entry.key ? "page" : undefined}
                className={`rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                  tab === entry.key
                    ? "bg-brand-400/15 font-semibold text-brand-300"
                    : "opacity-75 hover:bg-white/[0.06] hover:opacity-100"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {tab === "appearance" && (
              <div className="space-y-4">
                <ColorRow
                  label="Up colour"
                  value={settings.upColor}
                  swatches={UP_SWATCHES}
                  onChange={(upColor) => onChange({ upColor })}
                />
                <ColorRow
                  label="Down colour"
                  value={settings.downColor}
                  swatches={DOWN_SWATCHES}
                  onChange={(downColor) => onChange({ downColor })}
                />
                <ColorRow
                  label="Background"
                  value={settings.background}
                  swatches={BACKGROUND_SWATCHES}
                  onChange={(background) => onChange({ background })}
                />
              </div>
            )}

            {tab === "scales" && (
              <div className="space-y-1">
                <ToggleRow
                  label="Grid lines"
                  checked={settings.grid}
                  onToggle={() => onChange({ grid: !settings.grid })}
                />
                <ToggleRow
                  label="Current price line"
                  checked={settings.priceLine}
                  onToggle={() => onChange({ priceLine: !settings.priceLine })}
                />
                <ToggleRow
                  label="Magnet crosshair"
                  hint="Snap the crosshair to the nearest OHLC value."
                  checked={settings.magnet}
                  onToggle={() => onChange({ magnet: !settings.magnet })}
                />
                <ToggleRow
                  label="Trade history"
                  hint="Entry and exit arrows for trades already closed."
                  checked={settings.tradeHistory}
                  onToggle={() => onChange({ tradeHistory: !settings.tradeHistory })}
                />
                <ToggleRow
                  label="Open position lines"
                  checked={settings.positionLines}
                  onToggle={() => onChange({ positionLines: !settings.positionLines })}
                />
                <ToggleRow
                  label="Drawings"
                  checked={settings.drawings}
                  onToggle={() => onChange({ drawings: !settings.drawings })}
                />
              </div>
            )}

            {tab === "display" && (
              <div className="space-y-1">
                <ChoiceRow
                  label="Text size"
                  hint="Axis labels, the legend and indicator chips."
                  value={settings.chartTextSize}
                  options={TEXT_SIZES}
                  onChange={(chartTextSize) => onChange({ chartTextSize })}
                />
                <label className="block px-2 pt-3">
                  <span className="mb-1.5 block text-[13px]">Time zone</span>
                  <span className="mb-1.5 block text-[11px] opacity-55">
                    Labels the axis, the crosshair and the session clock.
                  </span>
                  <select
                    value={settings.timeZone}
                    onChange={(event) => onChange({ timeZone: event.target.value })}
                    className="w-full rounded-md border px-2 py-1.5 text-[13px]"
                    style={{ backgroundColor: inset, borderColor: line, color: "inherit" }}
                  >
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.label} ({zone.offset})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="pt-3">
                  <ToggleRow
                    label="Hide account figures"
                    hint="Masks balance, equity and P&L in the status bar — for recording and screen-sharing."
                    checked={settings.hideBalances}
                    onToggle={() => onChange({ hideBalances: !settings.hideBalances })}
                  />
                  <ToggleRow
                    label="Distraction-free chart"
                    hint="Hides the header, the status bar and the side rails."
                    checked={settings.distractionFree}
                    onToggle={() => onChange({ distractionFree: !settings.distractionFree })}
                  />
                </div>
              </div>
            )}

            {tab === "trading" && (
              <div className="space-y-1">
                <ToggleRow
                  label="One-click trading"
                  hint="Buy and Sell send a market order immediately, with no confirmation."
                  checked={settings.oneClickTrading}
                  onToggle={() => onChange({ oneClickTrading: !settings.oneClickTrading })}
                />
                <ToggleRow
                  label="Pause to review a closed trade"
                  hint="When a stop or target fills, pause replay and open the journal card."
                  checked={settings.pauseOnTradeClose}
                  onToggle={() => onChange({ pauseOnTradeClose: !settings.pauseOnTradeClose })}
                />
                <ToggleRow
                  label="Ask why, at entry"
                  hint="Prompts for the reason as a position opens — before the outcome is known. Does not pause."
                  checked={settings.promptEntryReason}
                  onToggle={() => onChange({ promptEntryReason: !settings.promptEntryReason })}
                />
              </div>
            )}

            {tab === "risk" && (
              <div className="space-y-2">
                <NumberRow
                  label="Maximum risk per trade"
                  suffix="%"
                  value={settings.maxRiskPerTradePercent}
                  onChange={(maxRiskPerTradePercent) => onChange({ maxRiskPerTradePercent })}
                />
                <NumberRow
                  label="Daily loss limit"
                  suffix="%"
                  value={settings.dailyLossLimitPercent}
                  onChange={(dailyLossLimitPercent) => onChange({ dailyLossLimitPercent })}
                />
                <NumberRow
                  label="Maximum drawdown"
                  suffix="%"
                  value={settings.maxDrawdownLimitPercent}
                  onChange={(maxDrawdownLimitPercent) => onChange({ maxDrawdownLimitPercent })}
                />
                <NumberRow
                  label="Session trade limit"
                  integer
                  value={settings.sessionTradeLimit}
                  onChange={(sessionTradeLimit) => onChange({ sessionTradeLimit })}
                />
                <NumberRow
                  label="Session profit goal"
                  prefix="$"
                  value={settings.sessionGoalAmount}
                  onChange={(sessionGoalAmount) => onChange({ sessionGoalAmount })}
                />
                <p className="px-2 pt-2 text-[11px] opacity-55">
                  Use 0 to disable a limit. A limit blocks new entries; it never
                  force-closes a position you already hold.
                </p>
              </div>
            )}

            {tab === "shortcuts" && (
              <div className="space-y-1">
                {(Object.keys(SHORTCUT_LABELS) as (keyof ChartSettings["shortcuts"])[]).map(
                  (action) => (
                    <div
                      key={action}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
                    >
                      <span className="text-[13px]">{SHORTCUT_LABELS[action]}</span>
                      <button
                        type="button"
                        onClick={() => setCapturing(action)}
                        onKeyDown={(event) => {
                          if (capturing !== action) return;
                          event.preventDefault();
                          if (event.key === "Escape") {
                            setCapturing(null);
                            return;
                          }
                          // Two actions on one key would make the second
                          // unreachable, so a clash is refused rather than
                          // silently stealing the binding.
                          const duplicate = Object.entries(settings.shortcuts).find(
                            ([key, value]) =>
                              key !== action &&
                              value.toLowerCase() === event.key.toLowerCase(),
                          );
                          if (duplicate) return;
                          onChange({
                            shortcuts: { ...settings.shortcuts, [action]: event.key },
                          });
                          setCapturing(null);
                        }}
                        className={`min-w-20 rounded border px-2 py-1 text-[12px] font-mono ${
                          capturing === action
                            ? "border-brand-400 text-brand-300"
                            : "border-current/25 opacity-70 hover:opacity-100"
                        }`}
                      >
                        {capturing === action
                          ? "Press key…"
                          : shortcutName(settings.shortcuts[action])}
                      </button>
                    </div>
                  ),
                )}
                <p className="px-2 pt-2 text-[11px] opacity-55">
                  Click a key, then press the one you want. Escape abandons the
                  change; a key already in use is refused.
                </p>
              </div>
            )}
          </div>
        </div>

        <footer
          className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3"
          style={{ borderColor: line }}
        >
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] opacity-75 hover:bg-white/[0.06] hover:opacity-100"
          >
            <RotateCcw size={13} aria-hidden />
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-brand-500 px-4 py-1.5 text-[13px] font-semibold text-surface-950 hover:bg-brand-400"
          >
            Done
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-white/[0.06]"
    >
      <span className="min-w-0">
        <span className="block text-[13px]">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] opacity-55">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${
          checked
            ? "border-brand-400 bg-brand-400/20 text-brand-300"
            : "border-current opacity-35"
        }`}
      >
        {checked && <Check size={12} />}
      </span>
    </button>
  );
}

function NumberRow({
  label,
  value,
  prefix,
  suffix,
  integer = false,
  onChange,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  integer?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 px-2">
      <span className="text-[13px]">{label}</span>
      <span className="flex h-8 w-28 shrink-0 items-center gap-0.5 rounded-md border border-current/25 px-2 text-[12px]">
        {prefix}
        <input
          type="number"
          min="0"
          step={integer ? 1 : 0.1}
          value={value}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
          className="min-w-0 flex-1 bg-transparent text-right font-mono outline-none"
        />
        {suffix}
      </span>
    </label>
  );
}

function ChoiceRow<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="px-2">
      <p className="text-[13px]">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] opacity-55">{hint}</p>}
      <div className="mt-1.5 inline-flex overflow-hidden rounded-md border border-current/25">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`px-3 py-1 text-[12px] ${
              option.value === value
                ? "bg-brand-400/20 font-semibold text-brand-300"
                : "opacity-65 hover:opacity-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorRow({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string;
  value: string;
  swatches: string[];
  onChange: (color: string) => void;
}) {
  const options = swatches.includes(value) ? swatches : [value, ...swatches];
  return (
    <div className="px-2">
      <p className="mb-1.5 text-[13px]">{label}</p>
      <div className="flex items-center gap-2">
        {options.slice(0, 5).map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`${label} ${color === AUTO_BACKGROUND ? "theme default" : color}`}
            aria-pressed={color === value}
            onClick={() => onChange(color)}
            title={color === AUTO_BACKGROUND ? "Follow the app theme" : color}
            style={color === AUTO_BACKGROUND ? undefined : { backgroundColor: color }}
            // Every swatch carries a hairline: without one the near-black
            // background choices are invisible against the dialog itself.
            className={`grid h-6 w-6 place-items-center rounded border border-current/25 text-[9px] font-bold ${
              color === AUTO_BACKGROUND ? "opacity-70" : ""
            } ${color === value ? "ring-2 ring-brand-400" : ""}`}
          >
            {color === AUTO_BACKGROUND ? "A" : ""}
          </button>
        ))}
        <label className="ml-auto cursor-pointer text-[12px]" aria-label={`${label} custom`}>
          <span className="underline decoration-dotted opacity-60">Custom</span>
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="sr-only"
          />
        </label>
      </div>
    </div>
  );
}
