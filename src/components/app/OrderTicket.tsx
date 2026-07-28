"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Trash2,
} from "lucide-react";

import {
  tradePlanMetrics,
  type TradePlan,
} from "@/lib/backtest/trade-plan";
import type {
  OrderRequest,
  PublicSessionState,
  TradeDirection,
} from "@/lib/backtest/types";

type PlanLevel = keyof Omit<TradePlan, "direction">;

interface OrderTicketProps {
  state: PublicSessionState;
  busy: boolean;
  tradePlan: TradePlan | null;
  onDirectionChange: (direction: TradeDirection) => void;
  onPlanChange: (level: PlanLevel, value: string) => void;
  onClearPlan: () => void;
  onPlaceOrder: (order: OrderRequest) => void;
  onTemplateChange: (template: Omit<OrderRequest, "direction">) => void;
  referencePair?: string | null;
}

function money(value: string, currency: string) {
  if (value === "—") return value;
  return `${currency} ${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function OrderTicket({
  state,
  busy,
  tradePlan,
  onDirectionChange,
  onPlanChange,
  onClearPlan,
  onPlaceOrder,
  onTemplateChange,
  referencePair = null,
}: OrderTicketProps) {
  const [sizingMode, setSizingMode] = useState<
    "risk-percent" | "fixed-lots"
  >("fixed-lots");
  const [riskPercent, setRiskPercent] = useState("1");
  const [lots, setLots] = useState("0.10");
  const [mobileDetails, setMobileDetails] = useState(false);
  const unavailable =
    state.status === "finished" ||
    !state.currentPrice ||
    Boolean(referencePair) ||
    busy;

  const pair = state.config.symbol;
  const precision = state.config.pricePrecision ?? 5;
  const pip = Number(state.config.pipSize) || 0;
  const spread = Number(state.config.spreadPips) || 0;
  const mid = state.currentPrice != null ? Number(state.currentPrice) : null;
  const ask = mid != null ? mid + (spread * pip) / 2 : null;
  const bid = mid != null ? mid - (spread * pip) / 2 : null;
  const metrics = useMemo(
    () =>
      tradePlan
        ? tradePlanMetrics({
            state,
            plan: tradePlan,
            sizingMode,
            lots,
            riskPercent,
          })
        : null,
    [lots, riskPercent, sizingMode, state, tradePlan],
  );

  useEffect(() => {
    onTemplateChange({
      sizingMode,
      lots: sizingMode === "fixed-lots" ? lots : undefined,
      riskPercent: sizingMode === "risk-percent" ? riskPercent : undefined,
    });
  }, [lots, onTemplateChange, riskPercent, sizingMode]);

  function submit() {
    if (unavailable || !tradePlan || !metrics?.valid) return;
    onPlaceOrder({
      direction: tradePlan.direction,
      sizingMode,
      lots: sizingMode === "fixed-lots" ? lots : undefined,
      riskPercent: sizingMode === "risk-percent" ? riskPercent : undefined,
      stopLoss: tradePlan.stopLoss,
      takeProfit: tradePlan.takeProfit,
    });
    onClearPlan();
  }

  return (
    <div className="max-w-[min(780px,calc(100vw-6rem))] overflow-x-auto rounded-lg border app-border bg-[var(--app-panel)]/95 p-1 shadow-xl backdrop-blur">
      <div className="flex min-w-max items-center gap-1.5">
        {referencePair && (
          <div className="rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-300">
            {referencePair} · view only
          </div>
        )}
        <span
          className="hidden px-1 text-xs font-semibold app-muted sm:inline"
          title="Active pair"
        >
          {pair}
        </span>
        <DirectionButton
          direction="short"
          selected={tradePlan?.direction === "short"}
          price={bid?.toFixed(precision)}
          disabled={unavailable}
          onClick={() => onDirectionChange("short")}
        />
        <DirectionButton
          direction="long"
          selected={tradePlan?.direction === "long"}
          price={ask?.toFixed(precision)}
          disabled={unavailable}
          onClick={() => onDirectionChange("long")}
        />
        <button
          type="button"
          onClick={() => setMobileDetails((open) => !open)}
          className="inline-flex h-8 items-center gap-1 rounded-md border app-border px-2 text-xs font-semibold sm:hidden"
          aria-expanded={mobileDetails}
        >
          Size <ChevronDown size={13} aria-hidden />
        </button>
        <div
          className={`${mobileDetails ? "flex" : "hidden"} h-8 items-center rounded-md border app-border p-0.5 sm:flex`}
        >
          {(["fixed-lots", "risk-percent"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSizingMode(mode)}
              aria-pressed={sizingMode === mode}
              className={`h-7 rounded px-2 text-[11px] font-semibold ${
                sizingMode === mode
                  ? "bg-brand-400/15 text-brand-300"
                  : "app-muted"
              }`}
            >
              {mode === "fixed-lots" ? "Lots" : "Risk %"}
            </button>
          ))}
        </div>
        <label
          className={`${mobileDetails ? "flex" : "hidden"} h-8 items-center gap-1.5 rounded-md border app-border bg-[var(--app-panel-2)] px-2 sm:flex`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider app-muted">
            {sizingMode === "fixed-lots" ? "Size" : "Risk"}
          </span>
          <input
            className="w-14 bg-transparent font-mono text-sm outline-none"
            inputMode="decimal"
            value={sizingMode === "fixed-lots" ? lots : riskPercent}
            onChange={(event) =>
              sizingMode === "fixed-lots"
                ? setLots(event.target.value)
                : setRiskPercent(event.target.value)
            }
            aria-label={
              sizingMode === "fixed-lots"
                ? "Lot size"
                : "Account risk percent"
            }
          />
          {sizingMode === "risk-percent" && (
            <span className="text-xs app-muted">%</span>
          )}
        </label>
        {!tradePlan && !referencePair && (
          <span className="px-2 text-[10px] app-muted">
            Choose Buy or Sell to start a plan
          </span>
        )}
      </div>

      {tradePlan && metrics && (
        <div
          className="mt-1 border-t app-border px-1 pt-1"
          data-testid="trade-planner"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <PriceField
              label="Entry"
              value={tradePlan.entryPrice}
              onChange={(value) => onPlanChange("entryPrice", value)}
            />
            <PriceField
              label="Stop"
              value={tradePlan.stopLoss}
              onChange={(value) => onPlanChange("stopLoss", value)}
            />
            <PriceField
              label="Target"
              value={tradePlan.takeProfit}
              onChange={(value) => onPlanChange("takeProfit", value)}
            />
            <Metric label="Size" value={`${metrics.lots} lot`} />
            <Metric
              label="Risk"
              value={`${money(metrics.riskAmount, state.config.accountCurrency)} · ${metrics.stopPips}p`}
              tone="text-bear"
            />
            <Metric
              label="Reward"
              value={`${money(metrics.projectedProfit, state.config.accountCurrency)} · ${metrics.targetPips}p`}
              tone="text-brand-300"
            />
            <Metric label="R:R" value={`${metrics.riskReward}R`} />
            <Metric
              label="Spread"
              value={money(metrics.spreadCost, state.config.accountCurrency)}
            />
            <button
              type="button"
              onClick={submit}
              disabled={unavailable || !metrics.valid}
              className={`ml-auto inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 ${
                tradePlan.direction === "long"
                  ? "bg-brand-500 text-surface-950 hover:bg-brand-400"
                  : "bg-bear hover:opacity-90"
              }`}
            >
              {tradePlan.direction === "long" ? (
                <ArrowUpRight size={14} />
              ) : (
                <ArrowDownRight size={14} />
              )}
              Place {tradePlan.direction === "long" ? "Buy" : "Sell"}
            </button>
            <button
              type="button"
              onClick={onClearPlan}
              className="grid h-9 w-9 place-items-center rounded-md border app-border app-muted hover:text-bear"
              aria-label="Clear trade plan"
              title="Clear trade plan"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-[9px]">
            <span className={metrics.valid ? "app-muted" : "text-bear"}>
              {metrics.error ??
                "Drag the chart levels or enter exact prices. Market orders fill at the current simulated price."}
            </span>
            <span className="shrink-0 app-muted">
              Estimated fill includes spread and slippage
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function DirectionButton({
  direction,
  selected,
  price,
  disabled,
  onClick,
}: {
  direction: TradeDirection;
  selected: boolean;
  price?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const long = direction === "long";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`inline-flex h-9 min-w-24 items-center justify-center gap-1.5 rounded-md px-3 font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        long
          ? `bg-brand-500 text-surface-950 hover:bg-brand-400 ${selected ? "ring-2 ring-brand-200 ring-offset-1 ring-offset-[var(--app-panel)]" : ""}`
          : `bg-bear text-white hover:opacity-90 ${selected ? "ring-2 ring-red-200 ring-offset-1 ring-offset-[var(--app-panel)]" : ""}`
      }`}
    >
      {long ? (
        <ArrowUpRight size={16} aria-hidden />
      ) : (
        <ArrowDownRight size={16} aria-hidden />
      )}
      <span className="flex flex-col items-center leading-none">
        <span className="text-[9px] font-bold uppercase tracking-wide opacity-80">
          {long ? "Buy plan" : "Sell plan"}
        </span>
        {price && <span className="mt-0.5 font-mono text-xs">{price}</span>}
      </span>
    </button>
  );
}

function PriceField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex h-9 items-center gap-1 rounded-md border app-border bg-[var(--app-panel-2)] px-2">
      <span className="text-[9px] font-semibold uppercase app-muted">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        className="w-[76px] bg-transparent font-mono text-[11px] outline-none"
        aria-label={`Planned ${label.toLowerCase()} price`}
      />
    </label>
  );
}

function Metric({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex h-9 min-w-[76px] flex-col justify-center rounded-md border app-border px-2">
      <span className="text-[9px] font-semibold uppercase app-muted">
        {label}
      </span>
      <span className={`font-mono text-[10px] font-semibold ${tone}`}>
        {value}
      </span>
    </div>
  );
}
