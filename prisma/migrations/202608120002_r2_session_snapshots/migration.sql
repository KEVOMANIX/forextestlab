ALTER TABLE "BacktestSession"
  ADD COLUMN "stateObjectKey" TEXT,
  ADD COLUMN "stateSizeBytes" INTEGER NOT NULL DEFAULT 0;

UPDATE "BacktestSession"
SET "stateSizeBytes" = octet_length("stateJson");
