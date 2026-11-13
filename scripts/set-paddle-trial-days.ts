/**
 * Sets the free-trial length on the live Pro trial prices (monthly and
 * yearly). Dry run by default; pass --apply to change them. Only the trial
 * period changes: amount, tax and payment-method rules stay as they are.
 * Subscriptions already trialing keep the trial they started with.
 *
 *   npx tsx scripts/set-paddle-trial-days.ts 14 [--apply]
 */
import { config } from "dotenv";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

config({ path: ".env.local" });
config();

const days = Number(process.argv[2]);
const apply = process.argv.includes("--apply");
if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("Pass the trial length in days, 1-90.");

const apiKey = process.env.PADDLE_LIVE_API_KEY?.trim();
if (!apiKey?.startsWith("pdl_live_")) throw new Error("PADDLE_LIVE_API_KEY must contain a live Paddle API key.");
const paddle = new Paddle(apiKey, { environment: Environment.production });

async function main() {
for (const interval of ["MONTH", "YEAR"] as const) {
  const variable = `PADDLE_LIVE_PRO_${interval}_TRIAL_PRICE_ID`;
  const id = process.env[variable]?.trim();
  if (!id?.startsWith("pri_")) throw new Error(`${variable} must contain a live Paddle price ID.`);
  const before = await paddle.prices.get(id);
  const label = `${interval.toLowerCase()} trial price …${id.slice(-6)}`;
  console.log(`${label}: ${before.trialPeriod?.frequency ?? "none"} ${before.trialPeriod?.interval ?? ""}, ${before.unitPrice.amount} ${before.unitPrice.currencyCode}, status ${before.status}`);
  if (!apply) continue;
  const after = await paddle.prices.update(id, { trialPeriod: { interval: "day", frequency: days } });
  console.log(`${label}: now ${after.trialPeriod?.frequency} ${after.trialPeriod?.interval}, ${after.unitPrice.amount} ${after.unitPrice.currencyCode}`);
}
if (!apply) console.log(`Dry run. Re-run with --apply to set ${days}-day trials.`);
}

void main();
