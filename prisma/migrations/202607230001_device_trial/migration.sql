CREATE TABLE "TrialDevice" (
    "id" TEXT NOT NULL,
    "sessionsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrialDevice_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BacktestSession"
ADD COLUMN "trialDeviceId" TEXT;

CREATE INDEX "TrialDevice_lastUsedAt_idx" ON "TrialDevice"("lastUsedAt");
CREATE INDEX "BacktestSession_trialDeviceId_createdAt_idx"
ON "BacktestSession"("trialDeviceId", "createdAt");

ALTER TABLE "BacktestSession"
ADD CONSTRAINT "BacktestSession_trialDeviceId_fkey"
FOREIGN KEY ("trialDeviceId") REFERENCES "TrialDevice"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
