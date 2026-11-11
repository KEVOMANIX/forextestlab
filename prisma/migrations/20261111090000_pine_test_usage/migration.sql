CREATE TABLE "PineTestUsage" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PineTestUsage_pkey" PRIMARY KEY ("userId", "day")
);

ALTER TABLE "PineTestUsage"
ADD CONSTRAINT "PineTestUsage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "UserProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
