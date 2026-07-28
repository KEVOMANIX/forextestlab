"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CandlestickChart,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  MoreHorizontal,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  tradePlanMetrics,
  type TradePlan,
} from "@/lib/backtest/trade-plan";
import type {
  OrderRequest,
  OrderType,
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
  onPlaceOrder: (order: OrderRequest, options?: { oneClick?: boolean }) => void;
  onTemplateChange: (template: Omit<OrderRequest, "direction">) => void;
  oneClickTrading: boolean;
  referencePair?: string | null;
  activationRequest?: {
    id: number;
    direction: TradeDirection;
  } | null;
  onActivationHandled?: (id: number) => void;
}

function number(value: string) {
  if (!Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  oneClickTrading,
  referencePair = null,
  activationRequest = null,
  onActivationHandled,
}: OrderTicketProps) {
  const [sizingMode, setSizingMode] = useState<
    "risk-percent" | "fixed-lots"
  >("fixed-lots");
  const [riskPercent, setRiskPercent] = useState("1");
  const [lots, setLots] = useState("0.10");
  const [exitsOpen, setExitsOpen] = useState(true);
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [expiryMinutes, setExpiryMinutes] = useState("0");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const handledActivationRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const unavailable =
    state.status === "finished" ||
    !state.currentPrice ||
    Boolean(referencePair) ||
    busy;
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
  const marginPercent =
    metrics?.valid && Number(state.equity) > 0
      ? Math.min(100, (Number(metrics.margin) / Number(state.equity)) * 100)
      : 0;

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
      orderType,
      entryPrice: orderType === "market" ? undefined : tradePlan.entryPrice,
      expiresAt:
        orderType !== "market" &&
        Number(expiryMinutes) > 0 &&
        state.currentTime != null
          ? state.currentTime + Number(expiryMinutes) * 60_000
          : undefined,
      sizingMode,
      lots: sizingMode === "fixed-lots" ? lots : undefined,
      riskPercent: sizingMode === "risk-percent" ? riskPercent : undefined,
      stopLoss: tradePlan.stopLoss || undefined,
      takeProfit: tradePlan.takeProfit || undefined,
    });
    onClearPlan();
    setPanelOpen(false);
  }

  function selectOrderType(next: OrderType) {
    setOrderType(next);
    if (!tradePlan || next === "market" || mid == null) return;
    const distance = pip * 10;
    const above =
      (next === "stop" && tradePlan.direction === "long") ||
      (next === "limit" && tradePlan.direction === "short");
    onPlanChange(
      "entryPrice",
      (mid + (above ? distance : -distance)).toFixed(precision),
    );
  }

  function toggleExit(level: "stopLoss" | "takeProfit") {
    if (!tradePlan) return;
    if (tradePlan[level]) {
      onPlanChange(level, "");
      return;
    }
    const entry = Number(tradePlan.entryPrice);
    const distance = pip * (level === "stopLoss" ? 20 : 40);
    const positive =
      (tradePlan.direction === "long" && level === "takeProfit") ||
      (tradePlan.direction === "short" && level === "stopLoss");
    onPlanChange(
      level,
      (entry + (positive ? distance : -distance)).toFixed(precision),
    );
  }

  function clampPosition(x: number, y: number) {
    const panel = panelRef.current;
    const parent = panel?.parentElement;
    if (!panel || !parent) return { x, y };
    const padding = 8;
    return {
      x: Math.min(
        Math.max(padding, x),
        Math.max(padding, parent.clientWidth - panel.offsetWidth - padding),
      ),
      y: Math.min(
        Math.max(padding, y),
        Math.max(padding, parent.clientHeight - panel.offsetHeight - padding),
      ),
    };
  }

  const openPlanner = useCallback((direction: TradeDirection) => {
    onDirectionChange(direction);
    setPanelPosition(null);
    setPanelOpen(true);
  }, [onDirectionChange]);

  const activateQuote = useCallback((direction: TradeDirection) => {
    if (!oneClickTrading) {
      openPlanner(direction);
      return;
    }
    onPlaceOrder({
      direction,
      sizingMode,
      lots: sizingMode === "fixed-lots" ? lots : undefined,
      riskPercent: sizingMode === "risk-percent" ? riskPercent : undefined,
    }, { oneClick: true });
    onClearPlan();
    setPanelOpen(false);
  }, [
    lots,
    onClearPlan,
    oneClickTrading,
    onPlaceOrder,
    openPlanner,
    riskPercent,
    sizingMode,
  ]);

  useEffect(() => {
    if (
      !activationRequest ||
      handledActivationRef.current === activationRequest.id
    ) {
      return;
    }
    handledActivationRef.current = activationRequest.id;
    activateQuote(activationRequest.direction);
    onActivationHandled?.(activationRequest.id);
  }, [activateQuote, activationRequest, onActivationHandled]);

  function beginPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const panel = panelRef.current;
    const parent = panel?.parentElement;
    if (!panel || !parent) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const panelBounds = panel.getBoundingClientRect();
    const parentBounds = parent.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - panelBounds.left,
      offsetY: event.clientY - panelBounds.top,
    };
    setPanelPosition(
      clampPosition(
        panelBounds.left - parentBounds.left,
        panelBounds.top - parentBounds.top,
      ),
    );
  }

  function movePanel(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const panel = panelRef.current;
    const parent = panel?.parentElement;
    if (!drag || drag.pointerId !== event.pointerId || !parent) return;
    const bounds = parent.getBoundingClientRect();
    setPanelPosition(
      clampPosition(
        event.clientX - bounds.left - drag.offsetX,
        event.clientY - bounds.top - drag.offsetY,
      ),
    );
  }

  function endPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  useEffect(() => {
    const keepInBounds = () => {
      setPanelPosition((current) =>
        current ? clampPosition(current.x, current.y) : current,
      );
    };
    window.addEventListener("resize", keepInBounds);
    return () => window.removeEventListener("resize", keepInBounds);
  }, []);

  if (!panelOpen) {
    return (
      <div
        className="pointer-events-auto absolute left-2 top-2 flex items-center gap-1 rounded-lg border border-white/10 bg-[#202020]/95 p-1 shadow-xl backdrop-blur"
        aria-label="Quick order planner"
      >
        <span className="hidden px-2 text-[11px] font-semibold text-[#c7c7c7] sm:inline">
          {state.config.symbol}
        </span>
        {oneClickTrading && (
          <span className="rounded bg-amber-400/15 px-1.5 py-1 text-[8px] font-bold uppercase tracking-wide text-amber-300">
            1-click
          </span>
        )}
        <CompactQuoteButton
          direction="short"
          price={bid?.toFixed(precision) ?? "—"}
          disabled={unavailable}
          onClick={() => activateQuote("short")}
        />
        <CompactQuoteButton
          direction="long"
          price={ask?.toFixed(precision) ?? "—"}
          disabled={unavailable}
          onClick={() => activateQuote("long")}
        />
      </div>
    );
  }

  return (
    <section
      ref={panelRef}
      className="pointer-events-auto absolute flex max-h-[calc(100%-1rem)] w-[360px] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#202020] text-[#e6e6e6] shadow-2xl"
      style={
        panelPosition
          ? { left: panelPosition.x, top: panelPosition.y }
          : {
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
            }
      }
      aria-label="Trade order planner"
      data-testid="trade-order-panel"
    >
      <header
        className="flex h-12 shrink-0 touch-none cursor-move select-none items-center gap-2 px-3"
        data-testid="trade-order-drag-handle"
        onPointerDown={beginPanelDrag}
        onPointerMove={movePanel}
        onPointerUp={endPanelDrag}
        onPointerCancel={endPanelDrag}
      >
        <span className="grid h-6 w-6 place-items-center rounded bg-white text-black">
          <CandlestickChart size={15} aria-hidden />
        </span>
        <strong className="text-xs">{state.config.symbol}</strong>
        <div className="ml-auto flex items-center gap-1">
          <span
            className="grid h-8 w-8 place-items-center text-[#777]"
            aria-hidden
          >
            <SlidersHorizontal size={15} />
          </span>
          <span
            className="grid h-8 w-8 place-items-center text-[#777]"
            aria-hidden
          >
            <MoreHorizontal size={17} />
          </span>
          <button
            type="button"
            onClick={() => {
              onClearPlan();
              setPanelOpen(false);
            }}
            className="grid h-8 w-8 place-items-center rounded text-[#b6b6b6] hover:bg-white/5 hover:text-white"
            aria-label="Clear trade plan"
            title="Clear trade plan"
          >
            <X size={19} />
          </button>
        </div>
      </header>

      {referencePair ? (
        <div className="mx-3 mb-3 rounded border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
          {referencePair} is a reference chart. Select {state.config.symbol} to
          place a trade.
        </div>
      ) : (
        <>
          <div className="mx-3 grid grid-cols-2 overflow-hidden rounded-md">
            <QuoteSide
              direction="short"
              selected={tradePlan?.direction === "short"}
              price={bid?.toFixed(precision) ?? "—"}
              disabled={unavailable}
              onClick={() => onDirectionChange("short")}
            />
            <QuoteSide
              direction="long"
              selected={tradePlan?.direction === "long"}
              price={ask?.toFixed(precision) ?? "—"}
              disabled={unavailable}
              onClick={() => onDirectionChange("long")}
            />
          </div>

          <div
            className="mx-3 mt-3 grid grid-cols-3 border-b border-white/20"
            role="tablist"
            aria-label="Order type"
          >
            {(["market", "limit", "stop"] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="tab"
                aria-selected={orderType === type}
                onClick={() => selectOrderType(type)}
                className={`relative h-9 text-xs font-semibold capitalize ${
                  orderType === type
                    ? "text-white after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:rounded-full after:bg-white"
                    : "text-[#9b9b9b] hover:text-white"
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {!tradePlan ? (
              <div className="grid min-h-64 place-items-center px-6 text-center">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Choose Sell or Buy
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[#929292]">
                    A market plan will appear with draggable entry, stop and
                    target levels.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="pt-4">
                  {orderType !== "market" && (
                    <div className="mb-4 space-y-3">
                      <DarkField
                        label={`${tradePlan.direction === "long" ? "Buy" : "Sell"} ${orderType} price`}
                        value={tradePlan.entryPrice}
                        onChange={(value) => onPlanChange("entryPrice", value)}
                        suffix={state.config.symbol}
                      />
                      <label className="block text-[11px] text-[#a8a8a8]">
                        Expiry
                        <select
                          value={expiryMinutes}
                          onChange={(event) =>
                            setExpiryMinutes(event.target.value)
                          }
                          className="mt-1 h-10 w-full rounded border border-white/15 bg-[#252525] px-3 text-xs text-white outline-none focus:border-[#2962ff]"
                          aria-label="Pending order expiry"
                        >
                          <option value="0">Good till cancelled</option>
                          <option value="60">1 hour</option>
                          <option value="240">4 hours</option>
                          <option value="1440">24 hours</option>
                        </select>
                      </label>
                    </div>
                  )}
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-[#a8a8a8]">Position size</span>
                    <div className="flex rounded bg-[#2b2b2b] p-0.5">
                      {(["fixed-lots", "risk-percent"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setSizingMode(mode)}
                          aria-pressed={sizingMode === mode}
                          className={`rounded px-2 py-1 text-[10px] font-semibold ${
                            sizingMode === mode
                              ? "bg-white text-black"
                              : "text-[#a8a8a8]"
                          }`}
                        >
                          {mode === "fixed-lots" ? "Lots" : "Risk %"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <DarkField
                    label={
                      sizingMode === "fixed-lots"
                        ? "Position size in lots"
                        : "Account risk percent"
                    }
                    value={
                      sizingMode === "fixed-lots" ? lots : riskPercent
                    }
                    onChange={
                      sizingMode === "fixed-lots" ? setLots : setRiskPercent
                    }
                    suffix={
                      sizingMode === "fixed-lots"
                        ? `${metrics?.lots ?? "—"} lot`
                        : `${metrics?.lots ?? "—"} lot`
                    }
                  />
                </div>

                <div className="mt-5 border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={() => setExitsOpen((open) => !open)}
                    className="flex w-full items-center justify-between text-left text-xs font-semibold text-white"
                    aria-expanded={exitsOpen}
                  >
                    Exits
                    {exitsOpen ? (
                      <ChevronUp size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </button>
                  {exitsOpen && (
                    <div className="mt-3 space-y-4">
                      <ExitField
                        label="Take profit, price"
                        value={tradePlan.takeProfit}
                        pips={metrics?.targetPips ?? "—"}
                        enabled={Boolean(tradePlan.takeProfit)}
                        onToggle={() => toggleExit("takeProfit")}
                        onChange={(value) =>
                          onPlanChange("takeProfit", value)
                        }
                      />
                      <ExitField
                        label="Stop loss, price"
                        value={tradePlan.stopLoss}
                        pips={metrics?.stopPips ?? "—"}
                        enabled={Boolean(tradePlan.stopLoss)}
                        onToggle={() => toggleExit("stopLoss")}
                        onChange={(value) => onPlanChange("stopLoss", value)}
                      />
                    </div>
                  )}
                </div>

                <div className="mt-5 border-t border-white/10 pt-4">
                  <h3 className="text-xs font-semibold text-white">
                    Order info
                  </h3>
                  <div className="mt-3 flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1 text-[#b4b4b4]">
                      Margin <CircleHelp size={11} />
                    </span>
                    <strong>
                      {number(metrics?.margin ?? "0")} /{" "}
                      {number(state.equity)} {state.config.accountCurrency}
                    </strong>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#3c3c3c]">
                    <div
                      className="h-full rounded-full bg-[#2962ff]"
                      style={{ width: `${marginPercent}%` }}
                    />
                  </div>
                  <dl className="mt-4 space-y-2 text-[11px]">
                    <InfoRow
                      label="Leverage"
                      value={`${metrics?.leverage ?? "—"}:1`}
                    />
                    <InfoRow
                      label="Pip value"
                      value={`${number(metrics?.pipValue ?? "0")} ${state.config.accountCurrency}`}
                    />
                    <InfoRow
                      label="Trade value"
                      value={`${number(metrics?.tradeValue ?? "0")} ${state.config.accountCurrency}`}
                    />
                    <InfoRow
                      label="Risk / reward"
                      value={`${metrics?.riskReward ?? "—"}R · ${number(metrics?.riskAmount ?? "0")} / ${number(metrics?.projectedProfit ?? "0")} ${state.config.accountCurrency}`}
                      valueClass="text-brand-300"
                    />
                  </dl>
                </div>

                {metrics?.error && (
                  <p className="mt-3 rounded border border-bear/30 bg-bear/10 px-2 py-1.5 text-[10px] text-bear">
                    {metrics.error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={submit}
                  disabled={unavailable || !metrics?.valid}
                  className={`mt-5 flex min-h-12 w-full flex-col items-center justify-center rounded-lg text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:bg-[#454545] disabled:text-[#777] ${
                    tradePlan.direction === "long"
                      ? "bg-[#2962ff] hover:bg-[#3970ff]"
                      : "bg-bear hover:opacity-90"
                  }`}
                >
                  <span>
                    {tradePlan.direction === "long" ? "Buy" : "Sell"}
                  </span>
                  <span className="mt-0.5 text-[10px] font-semibold">
                    {metrics?.lots ?? "—"} lot {state.config.symbol}{" "}
                    {orderType.toUpperCase()}
                  </span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function CompactQuoteButton({
  direction,
  price,
  disabled,
  onClick,
}: {
  direction: TradeDirection;
  price: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const long = direction === "long";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${long ? "Buy" : "Sell"} plan at ${price}`}
      className={`flex h-9 min-w-[92px] flex-col items-center justify-center rounded-md px-3 text-[10px] font-bold leading-none transition disabled:cursor-not-allowed disabled:opacity-40 ${
        long
          ? "bg-[#2962ff] text-white hover:bg-[#3970ff]"
          : "bg-bear text-white hover:opacity-90"
      }`}
    >
      <span>{long ? "Buy" : "Sell"}</span>
      <span className="mt-1 font-mono text-[10px] font-semibold">{price}</span>
    </button>
  );
}

function QuoteSide({
  direction,
  selected,
  price,
  disabled,
  onClick,
}: {
  direction: TradeDirection;
  selected: boolean;
  price: string;
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
      aria-label={`${long ? "Buy" : "Sell"} plan at ${price}`}
      className={`flex h-12 flex-col justify-center px-2 text-xs transition disabled:opacity-40 ${
        long ? "items-end bg-[#17366f]" : "items-start bg-[#393939]"
      } ${selected ? "ring-1 ring-inset ring-white/30" : ""}`}
    >
      <span className={long ? "text-[#4f82ff]" : "text-[#dadada]"}>
        {long ? "Buy" : "Sell"}
      </span>
      <span className={long ? "text-[#2f6fff]" : "text-[#d7e5ff]"}>
        {price}
      </span>
    </button>
  );
}

function DarkField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string;
  value: string;
  suffix: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <div className="flex h-10 items-center rounded-md border border-[#4a4a4a] bg-[#202020] px-2 focus-within:border-[#777]">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-white outline-none"
          aria-label={label}
        />
        <span className="text-[10px] text-[#919191]">{suffix}</span>
        <ChevronDown size={12} className="ml-1 text-[#777]" />
      </div>
    </label>
  );
}

function ExitField({
  label,
  value,
  pips,
  enabled,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  pips: string;
  enabled: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] text-[#9f9f9f]">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Toggle ${label}`}
          onClick={onToggle}
          className={`relative h-5 w-9 rounded-full transition ${
            enabled ? "bg-[#2962ff]" : "bg-[#555]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#c8c8c8] transition ${
              enabled ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
      <div
        className={`flex h-10 items-center rounded-md border px-2 ${
          enabled
            ? "border-[#4a4a4a] text-white"
            : "border-[#3a3a3a] text-[#666]"
        }`}
      >
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={!enabled}
          inputMode="decimal"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none disabled:text-[#666]"
          aria-label={`Planned ${label.toLowerCase()}`}
        />
        <span className="text-[10px] text-[#818181]">{pips} pips</span>
        <ChevronDown size={12} className="ml-1 text-[#666]" />
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[#b4b4b4]">{label}</dt>
      <dd className={`font-semibold text-white ${valueClass}`}>{value}</dd>
    </div>
  );
}
