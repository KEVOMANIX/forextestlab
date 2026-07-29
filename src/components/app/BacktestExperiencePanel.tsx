"use client";

import { useEffect, useState } from "react";
import { Focus, Gauge, Keyboard, ShieldCheck, SlidersHorizontal, X } from "lucide-react";

import { useModalBehavior } from "@/lib/ui/use-modal-behavior";
import type { ChartSettings } from "./ChartSettingsMenu";
import {
  ReplayDiagnosticsPanel,
  type ReplayDiagnosticsSource,
} from "./ReplayDiagnosticsPanel";

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

export function BacktestExperiencePanel({
  settings,
  onChange,
  diagnostics,
}: {
  settings: ChartSettings;
  onChange: (patch: Partial<ChartSettings>) => void;
  diagnostics: ReplayDiagnosticsSource;
}) {
  const [open, setOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [capturing, setCapturing] = useState<keyof ChartSettings["shortcuts"] | null>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("forextestlab:open-experience", show);
    return () => window.removeEventListener("forextestlab:open-experience", show);
  }, []);

  // Escape stands down while a shortcut is being captured, so pressing Escape to
  // abandon a rebind doesn't also close the dialog.
  const dialogRef = useModalBehavior<HTMLElement>({
    open,
    onClose: () => setOpen(false),
    closeOnEscape: !capturing,
  });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid h-8 w-8 place-items-center rounded-md app-muted hover:bg-white/[0.06] hover:text-brand-300" aria-label="Trading experience settings" title="Trading experience settings">
        <SlidersHorizontal size={15} />
      </button>
      {open && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Trading experience settings" className="max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border app-border bg-[var(--app-panel)] shadow-2xl outline-none">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b app-border bg-[var(--app-panel)] px-5 py-4">
              <div><h2 className="font-semibold">Trading experience</h2><p className="mt-1 text-xs app-muted">Shortcuts, execution protection, and session discipline.</p></div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-md app-muted hover:bg-white/[0.06]" aria-label="Close"><X size={16} /></button>
            </header>
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={15} className="text-brand-300" /> Trading safeguards</h3>
                <div className="mt-3 space-y-3">
                  <Toggle label="One-click trading" checked={settings.oneClickTrading} onChange={(oneClickTrading) => onChange({ oneClickTrading })} />
                  <NumberSetting label="Maximum risk per trade" suffix="%" value={settings.maxRiskPerTradePercent} onChange={(maxRiskPerTradePercent) => onChange({ maxRiskPerTradePercent })} />
                  <NumberSetting label="Daily loss limit" suffix="%" value={settings.dailyLossLimitPercent} onChange={(dailyLossLimitPercent) => onChange({ dailyLossLimitPercent })} />
                  <NumberSetting label="Maximum drawdown" suffix="%" value={settings.maxDrawdownLimitPercent} onChange={(maxDrawdownLimitPercent) => onChange({ maxDrawdownLimitPercent })} />
                  <NumberSetting label="Session trade limit" value={settings.sessionTradeLimit} integer onChange={(sessionTradeLimit) => onChange({ sessionTradeLimit })} />
                  <NumberSetting label="Session profit goal" prefix="$" value={settings.sessionGoalAmount} onChange={(sessionGoalAmount) => onChange({ sessionGoalAmount })} />
                  <p className="text-[10px] app-muted">Use 0 to disable a limit. Limits prevent new entries; they never force-close a position.</p>
                </div>
              </div>
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Keyboard size={15} className="text-brand-300" /> Keyboard shortcuts</h3>
                <div className="mt-3 space-y-2">
                  {(Object.keys(SHORTCUT_LABELS) as (keyof ChartSettings["shortcuts"])[]).map((action) => (
                    <div key={action} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
                      <span>{SHORTCUT_LABELS[action]}</span>
                      <button
                        type="button"
                        onClick={() => setCapturing(action)}
                        onKeyDown={(event) => {
                          if (capturing !== action) return;
                          event.preventDefault();
                          if (event.key === "Escape") { setCapturing(null); return; }
                          const duplicate = Object.entries(settings.shortcuts).find(([key, value]) => key !== action && value.toLowerCase() === event.key.toLowerCase());
                          if (duplicate) return;
                          onChange({ shortcuts: { ...settings.shortcuts, [action]: event.key } });
                          setCapturing(null);
                        }}
                        className={`min-w-20 rounded border px-2 py-1 font-mono ${capturing === action ? "border-brand-400 text-brand-300" : "app-border app-muted"}`}
                      >
                        {capturing === action ? "Press key…" : shortcutName(settings.shortcuts[action])}
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => onChange({ distractionFree: !settings.distractionFree })} className="mt-4 flex w-full items-center justify-between rounded-xl border app-border p-3 text-left text-xs hover:border-brand-400/40">
                  <span className="flex items-center gap-2 font-semibold"><Focus size={15} /> Distraction-free chart</span>
                  <span className={settings.distractionFree ? "text-brand-300" : "app-muted"}>{settings.distractionFree ? "On" : "Off"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setDiagnosticsOpen(true);
                  }}
                  className="mt-3 flex w-full items-center justify-between rounded-xl border app-border p-3 text-left text-xs hover:border-brand-400/40"
                >
                  <span>
                    <span className="flex items-center gap-2 font-semibold">
                      <Gauge size={15} /> Replay diagnostics
                    </span>
                    <span className="mt-1 block text-[10px] app-muted">
                      Compare browser performance without changing replay.
                    </span>
                  </span>
                  <span className="text-brand-300">Open</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {diagnosticsOpen && (
        <ReplayDiagnosticsPanel
          source={diagnostics}
          onClose={() => setDiagnosticsOpen(false)}
        />
      )}
    </>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-xs"><span>{label}</span><span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${checked ? "bg-brand-500" : "bg-white/15"}`}><span className={`block h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : ""}`} /></span></button>;
}

function NumberSetting({ label, value, suffix, prefix, integer = false, onChange }: { label: string; value: number; suffix?: string; prefix?: string; integer?: boolean; onChange: (value: number) => void }) {
  return <label className="flex items-center justify-between gap-3 text-xs"><span>{label}</span><span className="flex h-8 w-28 items-center rounded-lg border app-border bg-[var(--app-panel-2)] px-2">{prefix}<input className="min-w-0 flex-1 bg-transparent text-right font-mono outline-none" type="number" min="0" step={integer ? 1 : 0.1} value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} />{suffix}</span></label>;
}
