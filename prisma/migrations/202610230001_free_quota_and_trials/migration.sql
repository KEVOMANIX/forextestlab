-- Free plan: new sessions per account per UTC calendar month.
CREATE TABLE "FreeSessionUsage" (
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FreeSessionUsage_pkey" PRIMARY KEY ("userId", "month")
);

ALTER TABLE "FreeSessionUsage"
ADD CONSTRAINT "FreeSessionUsage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "UserProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Pro trial: one per account, and the trial end of a trialing subscription.
ALTER TABLE "UserProfile" ADD COLUMN "proTrialStartedAt" TIMESTAMP(3);
ALTER TABLE "BillingSubscription" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
