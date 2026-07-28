import { Decimal, d } from "@/lib/decimal";

import { computePnl } from "./execution";
import { pipValuePerLot } from "./position-sizing";
import type { OpenPosition, PublicSessionState, SessionConfig } from "./types";

export interface LivePositionMetrics {
  pnl: string;
  pips: string;
  rMultiple: string | null;
  remainingRisk: string | null;
  lockedProfit: string | null;
  canBreakEven: boolean;
}

function executablePrice(
  currentPrice: string,
  position: OpenPosition,
  config: SessionConfig,
): Decimal {
  const halfSpread = d(config.spreadPips).times(config.pipSize).dividedBy(2);
  return position.direction === "long"
    ? d(currentPrice).minus(halfSpread)
    : d(currentPrice).plus(halfSpread);
}

function pnlAt(
  position: OpenPosition,
  config: SessionConfig,
  price: string,
): string {
  const pipValue = pipValuePerLot({
    pipSize: config.pipSize,
    quoteCurrency: config.quoteCurrency,
    accountCurrency: config.accountCurrency,
    baseCurrency: config.baseCurrency,
    price,
    symbol: config.symbol,
  }).value;
  return computePnl({
    direction: position.direction,
    entryPrice: position.entryPrice,
    exitPrice: price,
    lots: position.lots,
    pipSize: config.pipSize,
    pipValueAccountPerLot: pipValue,
    commission: position.commission,
  }).pnl;
}

export function livePositionMetrics(
  state: Pick<PublicSessionState, "config" | "currentPrice">,
  position: OpenPosition,
): LivePositionMetrics {
  const current = state.currentPrice
    ? executablePrice(state.currentPrice, position, state.config)
    : d(position.entryPrice);
  const signedDistance =
    position.direction === "long"
      ? current.minus(position.entryPrice)
      : d(position.entryPrice).minus(current);
  const pips = signedDistance.dividedBy(state.config.pipSize).toFixed(1);
  const initialRisk = d(position.initialRiskAmount ?? 0);
  const rMultiple = initialRisk.greaterThan(0)
    ? d(position.unrealizedPnl).dividedBy(initialRisk).toFixed(2)
    : null;
  const stopPnl = position.stopLoss
    ? d(pnlAt(position, state.config, position.stopLoss))
    : null;

  return {
    pnl: position.unrealizedPnl,
    pips,
    rMultiple,
    remainingRisk:
      stopPnl && stopPnl.lessThan(0) ? stopPnl.abs().toFixed(2) : null,
    lockedProfit:
      stopPnl && stopPnl.greaterThanOrEqualTo(0)
        ? stopPnl.toFixed(2)
        : null,
    canBreakEven:
      position.direction === "long"
        ? current.greaterThan(position.entryPrice)
        : current.lessThan(position.entryPrice),
  };
}
