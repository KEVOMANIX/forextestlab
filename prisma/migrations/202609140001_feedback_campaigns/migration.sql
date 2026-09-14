CREATE TABLE "FeedbackCampaign" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "FeedbackRecipient" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "campaignId" TEXT NOT NULL REFERENCES "FeedbackCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attemptedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "FeedbackRecipient_token_key" ON "FeedbackRecipient"("token");
CREATE UNIQUE INDEX "FeedbackRecipient_campaignId_email_key" ON "FeedbackRecipient"("campaignId", "email");
CREATE INDEX "FeedbackRecipient_campaignId_status_idx" ON "FeedbackRecipient"("campaignId", "status");
CREATE TABLE "FeedbackEmailOptOut" (
  "email" TEXT NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Prisma's trusted server connection owns these tables. No public client may
-- read campaign addresses/tokens or change sending and opt-out state.
ALTER TABLE "FeedbackCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeedbackRecipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeedbackEmailOptOut" ENABLE ROW LEVEL SECURITY;
