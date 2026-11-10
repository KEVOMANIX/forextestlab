CREATE TABLE "PineScript" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "resultJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PineScript_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PineScript_userId_updatedAt_idx" ON "PineScript"("userId", "updatedAt");
ALTER TABLE "PineScript" ADD CONSTRAINT "PineScript_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
