-- Add Paddle as the active billing provider while preserving legacy Paystack records.
ALTER TABLE "UserProfile" ADD COLUMN "paddleCustomerId" TEXT;
CREATE UNIQUE INDEX "UserProfile_paddleCustomerId_key" ON "UserProfile"("paddleCustomerId");

ALTER TABLE "BillingPayment" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'paystack';
ALTER TABLE "BillingSubscription" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'paystack';
ALTER TABLE "BillingWebhookEvent" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'paystack';

CREATE INDEX "BillingPayment_provider_status_createdAt_idx"
ON "BillingPayment"("provider", "status", "createdAt");
CREATE INDEX "BillingSubscription_provider_status_idx"
ON "BillingSubscription"("provider", "status");
