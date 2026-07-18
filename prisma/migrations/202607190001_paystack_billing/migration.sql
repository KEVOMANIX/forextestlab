-- Billing entitlement fields
ALTER TABLE "UserProfile"
ADD COLUMN "billingPlan" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN "billingStatus" TEXT NOT NULL DEFAULT 'inactive',
ADD COLUMN "proAccessUntil" TIMESTAMP(3),
ADD COLUMN "paystackCustomerCode" TEXT;

CREATE UNIQUE INDEX "UserProfile_paystackCustomerCode_key"
ON "UserProfile"("paystackCustomerCode");

-- Paystack transactions
CREATE TABLE "BillingPayment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "providerTransactionId" TEXT,
  "productKey" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'initialized',
  "channel" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BillingPayment_reference_key" ON "BillingPayment"("reference");
CREATE INDEX "BillingPayment_userId_createdAt_idx" ON "BillingPayment"("userId", "createdAt");
CREATE INDEX "BillingPayment_status_createdAt_idx" ON "BillingPayment"("status", "createdAt");

-- Recurring card subscriptions
CREATE TABLE "BillingSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subscriptionCode" TEXT NOT NULL,
  "planCode" TEXT NOT NULL,
  "productKey" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "nextPaymentAt" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BillingSubscription_subscriptionCode_key" ON "BillingSubscription"("subscriptionCode");
CREATE INDEX "BillingSubscription_userId_status_idx" ON "BillingSubscription"("userId", "status");

-- Hash of the raw webhook payload makes delivery retries idempotent.
CREATE TABLE "BillingWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingWebhookEvent_eventType_processedAt_idx"
ON "BillingWebhookEvent"("eventType", "processedAt");
