/**
 * How the plans are described everywhere: pricing, the in-app upgrade
 * prompts and the emails. Each line matches a limit in plan-limits.ts and a
 * server-side check; change them together.
 */

export const FREE_PLAN_FEATURES = [
  "3 sessions / month",
  "7 major FX pairs",
  "31 days of history / session",
  "Single-pair replay · up to 1,200×",
  "Trading journal & basic results",
] as const;

export const PRO_PLAN_FEATURES = [
  "Unlimited sessions",
  "All 38 markets",
  "Full available history",
  "Multi-pair replay · all speeds",
  "Trading journal & results",
  "Advanced analytics & reports",
  "AI Analyst",
  "Prop Firm Challenges",
  "CSV & PDF exports",
] as const;

export const PRO_TRIAL_SUMMARY =
  "Try every Pro feature free for 7 days. Choose monthly or yearly.";
