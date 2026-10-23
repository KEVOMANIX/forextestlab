/**
 * How the plans are described everywhere: pricing, the in-app upgrade
 * prompts and the emails. Each line matches a limit in plan-limits.ts and a
 * server-side check; change them together.
 */

export const FREE_PLAN_FEATURES = [
  "3 new sessions a month, renewing on the 1st",
  "The seven major FX pairs",
  "Sessions up to 31 days, from any point in history",
  "Simulated orders, stop-loss, take-profit and position sizing",
  "Trading journal and session results",
  "No card required",
] as const;

export const PRO_PLAN_FEATURES = [
  "Unlimited new sessions",
  "All 38 markets and the full available history",
  "Multi-pair replay on one synchronised clock",
  "All replay speeds",
  "Full analytics and AI insights",
  "Trade and analytics exports",
  "Prop Firm Challenge mode",
] as const;

export const PRO_TRIAL_SUMMARY =
  "Try Pro free for 7 days. Choose monthly or yearly and add a card; it is charged automatically when the trial ends unless you cancel before then. One trial per account.";
