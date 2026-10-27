CREATE TABLE "AiChat" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT,
  "title" TEXT NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "messagesJson" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiChat_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiChat_userId_updatedAt_idx" ON "AiChat"("userId", "updatedAt");
ALTER TABLE "AiChat" ADD CONSTRAINT "AiChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiChat" ADD CONSTRAINT "AiChat_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BacktestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TradingPlan" (
  "userId" TEXT NOT NULL,
  "rules" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TradingPlan_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "TradingPlan" ADD CONSTRAINT "TradingPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
