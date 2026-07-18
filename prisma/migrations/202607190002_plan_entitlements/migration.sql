-- Persist consumption of the one-session Free allowance.
ALTER TABLE "UserProfile"
ADD COLUMN "freeSessionUsedAt" TIMESTAMP(3);

-- Existing accounts that already created a saved session have already used
-- their Free allowance. Keep the earliest creation time as the audit marker.
UPDATE "UserProfile" AS profile
SET "freeSessionUsedAt" = existing."usedAt"
FROM (
  SELECT "userId", MIN("createdAt") AS "usedAt"
  FROM "BacktestSession"
  WHERE "userId" IS NOT NULL
  GROUP BY "userId"
) AS existing
WHERE profile."id" = existing."userId"
  AND profile."freeSessionUsedAt" IS NULL;
