CREATE TABLE "AnalyticsShare" (
  "token" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "snapshotJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnalyticsShare_pkey" PRIMARY KEY ("token")
);
CREATE UNIQUE INDEX "AnalyticsShare_sessionId_key" ON "AnalyticsShare"("sessionId");
ALTER TABLE "AnalyticsShare" ADD CONSTRAINT "AnalyticsShare_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BacktestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
