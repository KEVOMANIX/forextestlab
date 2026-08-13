CREATE TABLE "OperationalCheck" (
    "id" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "message" TEXT,
    "metadataJson" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationalCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousId" TEXT,
    "path" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationalCheck_component_checkedAt_idx" ON "OperationalCheck"("component", "checkedAt");
CREATE INDEX "OperationalCheck_status_checkedAt_idx" ON "OperationalCheck"("status", "checkedAt");
CREATE INDEX "ProductEvent_name_createdAt_idx" ON "ProductEvent"("name", "createdAt");
CREATE INDEX "ProductEvent_userId_createdAt_idx" ON "ProductEvent"("userId", "createdAt");
CREATE INDEX "ProductEvent_anonymousId_createdAt_idx" ON "ProductEvent"("anonymousId", "createdAt");
CREATE INDEX "ProductEvent_createdAt_idx" ON "ProductEvent"("createdAt");
CREATE INDEX "ProductFeedback_createdAt_idx" ON "ProductFeedback"("createdAt");
CREATE INDEX "ProductFeedback_userId_createdAt_idx" ON "ProductFeedback"("userId", "createdAt");
CREATE INDEX "ProductFeedback_sessionId_idx" ON "ProductFeedback"("sessionId");
