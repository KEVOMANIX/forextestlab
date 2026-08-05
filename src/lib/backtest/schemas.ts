/**
 * Zod schemas for all backtester API requests. Every server endpoint validates
 * its input against these before touching the engine or database.
 */

import { z } from "zod";

import { isFiniteNumeric } from "@/lib/decimal";
import { TIMEFRAMES } from "@/lib/market-data/types";

const numericString = z
  .string()
  .trim()
  .refine((v) => isFiniteNumeric(v), "Must be a numeric value.");

const positiveNumericString = numericString.refine(
  (v) => Number(v) > 0,
  "Must be greater than zero.",
);

export const timeframeSchema = z.enum(
  TIMEFRAMES as [string, ...string[]],
);

/**
 * Challenge rules accepted at session creation.
 *
 * Validated server-side rather than trusted from the client: the rules are the
 * contract the run is graded against, so a browser must not be able to post
 * itself a 90% drawdown allowance.
 */
export const propFirmRulesSchema = z.object({
  preset: z.enum(["ftmo-phase-1", "ftmo-phase-2", "custom"]),
  phase: z.union([z.literal(1), z.literal(2)]),
  profitTargetPercent: z.number().min(0).max(1000),
  maxDailyLossPercent: z.number().min(0).max(100),
  maxTotalLossPercent: z.number().min(0).max(100),
  lossBasis: z.enum(["initial", "peak-equity"]),
  dailyResetZone: z.string().trim().min(1).max(64),
  minTradingDays: z.number().int().min(0).max(365),
});

export const createSessionSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
    symbols: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[A-Z0-9]{3,6}$/, "Each market must use its supported symbol code."),
      )
      .min(1, "Select at least one currency pair.")
      .max(12)
      .refine((symbols) => new Set(symbols).size === symbols.length, {
        message: "Currency pairs must be unique.",
      }),
    startTime: z.number().int().nonnegative(),
    endTime: z.number().int().nonnegative(),
    startingBalance: positiveNumericString.optional(),
    spreadPips: numericString.optional(),
    commissionPerLot: numericString.optional(),
    slippagePips: numericString.optional(),
    executionPolicy: z.enum(["conservative", "optimistic"]).optional(),
    propFirm: propFirmRulesSchema.optional(),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "endTime must be after startTime.",
    path: ["endTime"],
  });

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const sessionMetadataSchema = z.object({
  archived: z.boolean().optional(),
  name: z.string().trim().min(2).max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
});

export const extendSessionSchema = z.object({
  endTime: z.number().int().positive(),
  /** How many candles the caller's own local engine array currently holds. */
  count: z.number().int().min(0).optional(),
});

/** The routine buffer-refill call — no `endTime`, just how much the caller already has. */
export const extendBufferSchema = z.object({
  count: z.number().int().min(0).optional(),
});

const nullablePrice = z.union([positiveNumericString, z.null()]);
const journalRuleSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(100),
  followed: z.boolean(),
});
const tradeJournalUpdateSchema = z.object({
  entryReason: z.string().max(3000),
  exitReview: z.string().max(3000),
  setupTags: z.array(z.string().trim().min(1).max(32)).max(12),
  mistakeTags: z.array(z.string().trim().min(1).max(32)).max(12),
  emotion: z.string().trim().max(40),
  confidence: z.number().int().min(1).max(5).nullable(),
  ruleChecklist: z.array(journalRuleSchema).max(12),
  validity: z.enum(["valid", "invalid", "experimental"]),
});

export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("sync"),
    targetIndex: z.number().int().nonnegative(),
    status: z.enum(["running", "paused"]).optional(),
  }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("next") }),
  z.object({
    type: z.literal("prev"),
    steps: z.number().int().min(1).max(2_000).optional(),
    targetIndex: z.number().int().nonnegative().optional(),
  }),
  z.object({ type: z.literal("restart") }),
  z.object({ type: z.literal("end"), targetIndex: z.number().int().nonnegative().optional() }),
  z.object({
    type: z.literal("close"),
    positionId: z.string().min(1).optional(),
    lots: positiveNumericString.optional(),
    targetIndex: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("close-all"),
    targetIndex: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("set-speed"),
    speed: z.union([
      z.literal(15),
      z.literal(30),
      z.literal(60),
      z.literal(120),
      z.literal(300),
      z.literal(600),
      z.literal(900),
      z.literal(1200),
      z.literal(1800),
      z.literal(3600),
      z.literal(7200),
    ]),
  }),
  z.object({
    type: z.literal("place-order"),
    clientOrderId: z.string().uuid().optional(),
    targetIndex: z.number().int().nonnegative().optional(),
    direction: z.enum(["long", "short"]),
    orderType: z.enum(["market", "limit", "stop"]).optional(),
    entryPrice: positiveNumericString.optional(),
    expiresAt: z.number().int().positive().optional(),
    sizingMode: z.enum(["fixed-lots", "risk-percent"]),
    lots: positiveNumericString.optional(),
    riskPercent: positiveNumericString.optional(),
    stopLoss: positiveNumericString.optional(),
    takeProfit: positiveNumericString.optional(),
  }),
  z.object({ type: z.literal("modify-pending"), orderId: z.string().min(1), price: positiveNumericString, targetIndex: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("cancel-pending"), orderId: z.string().min(1), targetIndex: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("modify-stop"), positionId: z.string().min(1).optional(), price: nullablePrice, targetIndex: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("modify-target"), positionId: z.string().min(1).optional(), price: nullablePrice, targetIndex: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("modify-trailing"), positionId: z.string().min(1).optional(), pips: nullablePrice, targetIndex: z.number().int().nonnegative().optional() }),
  z.object({
    type: z.literal("update-journal"),
    journalId: z.string().min(1).max(120),
    journal: tradeJournalUpdateSchema,
  }),
  z.object({
    type: z.literal("add-bookmark"),
    bookmarkId: z.string().uuid(),
    note: z.string().trim().max(280).optional(),
    targetIndex: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("update-bookmark"),
    bookmarkId: z.string().uuid(),
    note: z.string().trim().max(280),
  }),
  z.object({
    type: z.literal("delete-bookmark"),
    bookmarkId: z.string().uuid(),
  }),
  z.object({ type: z.literal("notes"), notes: z.string().max(5000) }),
]);

export type ActionInput = z.infer<typeof actionSchema>;
