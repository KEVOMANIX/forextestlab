/**
 * How the plans are described everywhere: pricing, the in-app upgrade
 * prompts and the emails. Each line matches a limit in plan-limits.ts and a
 * server-side check; change them together.
 */

export const FREE_PLAN_FEATURES = [
  "3 sessions / month",
  "7 major FX pairs",
  "31 days of history / session",
  "Single-pair replay",
  "Replay speeds up to 1,200×",
  "Simulated market & pending orders",
  "Stop-loss, take-profit & risk sizing",
  "Trading journal",
  "Basic session results",
] as const;

export const PRO_PLAN_FEATURES = [
  "Unlimited sessions",
  "All 38 markets",
  "Full available history",
  "Multi-pair replay",
  "All replay speeds",
  "Simulated market & pending orders",
  "Stop-loss, take-profit & risk sizing",
  "Trading journal & session results",
  "Advanced analytics & reports",
  "AI Analyst",
  "Prop Firm Challenges",
  "CSV trade exports",
  "PDF reports & analytics sharing",
] as const;

export const PRO_TRIAL_SUMMARY =
  "Try every Pro feature free for 7 days. Choose monthly or yearly.";
