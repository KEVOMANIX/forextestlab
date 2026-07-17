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

const nullablePrice = z.union([positiveNumericString, z.null()]);

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
    steps: z.number().int().min(1).max(240).optional(),
  }),
  z.object({ type: z.literal("restart") }),
  z.object({ type: z.literal("end"), targetIndex: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("close"), targetIndex: z.number().int().nonnegative().optional() }),
  z.object({
    type: z.literal("set-speed"),
    speed: z.union([
      z.literal(15),
      z.literal(30),
      z.literal(60),
      z.literal(120),
      z.literal(300),
      z.literal(600),
    ]),
  }),
  z.object({
    type: z.literal("place-order"),
    targetIndex: z.number().int().nonnegative().optional(),
    direction: z.enum(["long", "short"]),
    sizingMode: z.enum(["fixed-lots", "risk-percent"]),
    lots: positiveNumericString.optional(),
    riskPercent: positiveNumericString.optional(),
    stopLoss: positiveNumericString.optional(),
    takeProfit: positiveNumericString.optional(),
  }),
  z.object({ type: z.literal("modify-stop"), price: nullablePrice, targetIndex: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("modify-target"), price: nullablePrice, targetIndex: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("notes"), notes: z.string().max(5000) }),
]);

export type ActionInput = z.infer<typeof actionSchema>;
