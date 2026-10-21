ALTER TABLE "BacktestSession"
ADD COLUMN "challengeStatus" TEXT,
ADD COLUMN "challengeBreach" TEXT,
ADD COLUMN "challengeDayKey" TEXT,
ADD COLUMN "challengeDayStartEquity" TEXT,
ADD COLUMN "challengeTradingDays" INTEGER;

CREATE INDEX "BacktestSession_userId_challengeStatus_idx"
ON "BacktestSession"("userId", "challengeStatus");

-- Every challenge keeps its rules in the compact config, so each one is marked
-- here even when its full snapshot lives in R2. Runtime fields come from inline
-- snapshots; R2-backed sessions are refined by `npm run challenges:backfill`.
UPDATE "BacktestSession"
SET "challengeStatus" = COALESCE("stateJson"::jsonb #>> '{propFirm,status}', 'active'),
    "challengeBreach" = "stateJson"::jsonb #>> '{propFirm,breach,rule}',
    "challengeDayKey" = "stateJson"::jsonb #>> '{propFirm,dayKey}',
    "challengeDayStartEquity" = "stateJson"::jsonb #>> '{propFirm,dayStartEquity}',
    "challengeTradingDays" = COALESCE(
      jsonb_array_length("stateJson"::jsonb #> '{propFirm,tradingDays}'),
      0
    )
WHERE jsonb_typeof("stateJson"::jsonb #> '{config,propFirm}') = 'object';
