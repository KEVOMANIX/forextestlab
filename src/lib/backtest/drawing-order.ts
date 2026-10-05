import type { DrawingJSON } from "@/lib/chart/drawing/types";
import { estimatedMarketEntry, type TradePlan } from "./trade-plan";
import type { OrderType, PublicSessionState } from "./types";

/** Copy a position drawing into a draft; placing the order remains explicit. */
export function drawingOrderDraft(drawing: DrawingJSON, state: PublicSessionState): { plan: TradePlan; orderType: OrderType; riskPercent: string } {
  if (drawing.kind !== "long" && drawing.kind !== "short") throw new Error("Select a Long or Short Position tool.");
  const [entry, stop, target] = drawing.points;
  if (!entry || !stop || !target || ![entry.price, stop.price, target.price].every(p => Number.isFinite(p) && p > 0)) throw new Error("Set a valid entry, stop loss, and take profit on the drawing.");
  const sign = drawing.kind === "long" ? 1 : -1;
  if ((entry.price - stop.price) * sign <= 0 || (target.price - entry.price) * sign <= 0) throw new Error("The stop and target must be on opposite sides of entry for this direction.");
  const market = Number(state.currentPrice);
  if (state.status === "finished" || !Number.isFinite(market) || market <= 0) throw new Error("This chart is not ready to trade.");
  const precision = state.config.pricePrecision;
  const atMarket = Math.abs(entry.price - market) < 10 ** -precision / 2;
  const orderType: OrderType = atMarket ? "market" : (entry.price - market) * sign < 0 ? "limit" : "stop";
  const entryPrice = atMarket ? estimatedMarketEntry(state, drawing.kind) : entry.price.toFixed(precision);
  const plan = { direction: drawing.kind, entryPrice: entryPrice ?? entry.price.toFixed(precision), stopLoss: stop.price.toFixed(precision), takeProfit: target.price.toFixed(precision) };
  if ((Number(plan.entryPrice) - Number(plan.stopLoss)) * sign <= 0 || (Number(plan.takeProfit) - Number(plan.entryPrice)) * sign <= 0) throw new Error("These levels are too close after price rounding or market execution costs. Adjust the drawing.");
  const balance = Number(state.balance);
  const account = drawing.style.accountSize ?? balance;
  const risk = drawing.style.risk ?? 1;
  const cash = drawing.style.riskMode === "money" ? risk : account * risk / 100;
  if (!(balance > 0) || !Number.isFinite(cash) || cash <= 0) throw new Error("Set a positive risk amount on the position tool.");
  return { plan, orderType, riskPercent: String(cash / balance * 100) };
}
