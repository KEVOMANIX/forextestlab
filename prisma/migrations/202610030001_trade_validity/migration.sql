ALTER TABLE "SimulatedTrade"
ADD COLUMN "validity" TEXT NOT NULL DEFAULT 'valid';

CREATE INDEX "SimulatedTrade_sessionId_validity_idx"
ON "SimulatedTrade"("sessionId", "validity");

-- Backfill sessions whose complete snapshot is still inline. Projection rows
-- are append-only in the same order as closedTrades, so ordinality is the only
-- stable bridge for legacy rows whose generated database id differs from the
-- engine trade id.
WITH snapshot_trade AS (
  SELECT
    session."id" AS "sessionId",
    trade.ordinality,
    COALESCE(trade.value #>> '{journal,validity}', 'valid') AS validity
  FROM "BacktestSession" AS session
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(session."stateJson"::jsonb -> 'closedTrades', '[]'::jsonb)
  ) WITH ORDINALITY AS trade(value, ordinality)
), projected_trade AS (
  SELECT
    trade."id",
    trade."sessionId",
    ROW_NUMBER() OVER (
      PARTITION BY trade."sessionId"
      ORDER BY trade."createdAt", trade."exitTime", trade."id"
    ) AS ordinality
  FROM "SimulatedTrade" AS trade
)
UPDATE "SimulatedTrade" AS trade
SET "validity" = snapshot_trade.validity
FROM projected_trade
JOIN snapshot_trade
  ON snapshot_trade."sessionId" = projected_trade."sessionId"
 AND snapshot_trade.ordinality = projected_trade.ordinality
WHERE trade."id" = projected_trade."id";
