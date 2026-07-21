CREATE TABLE "PaddleCustomerClaim" (
    "customerId" TEXT NOT NULL,
    "email" TEXT,
    "subscriptionId" TEXT,
    "priceId" TEXT,
    "productKey" TEXT,
    "status" TEXT,
    "nextPaymentAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaddleCustomerClaim_pkey" PRIMARY KEY ("customerId")
);

CREATE UNIQUE INDEX "PaddleCustomerClaim_email_key" ON "PaddleCustomerClaim"("email");
CREATE UNIQUE INDEX "PaddleCustomerClaim_subscriptionId_key" ON "PaddleCustomerClaim"("subscriptionId");
CREATE INDEX "PaddleCustomerClaim_email_status_idx" ON "PaddleCustomerClaim"("email", "status");
