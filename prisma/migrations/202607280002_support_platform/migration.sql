ALTER TABLE "SupportConversation"
  ADD COLUMN "accessTokenHash" TEXT,
  ADD COLUMN "subject" TEXT NOT NULL DEFAULT 'Support request',
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'widget',
  ADD COLUMN "assignedAgentId" TEXT,
  ADD COLUMN "linkedSessionId" TEXT,
  ADD COLUMN "contextJson" TEXT,
  ADD COLUMN "customerUnreadCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "agentUnreadCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "customerLastReadAt" TIMESTAMP(3),
  ADD COLUMN "agentLastReadAt" TIMESTAMP(3),
  ADD COLUMN "firstResponseAt" TIMESTAMP(3),
  ADD COLUMN "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "snoozedUntil" TIMESTAMP(3),
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "satisfactionScore" INTEGER,
  ADD COLUMN "satisfactionComment" TEXT,
  ADD COLUMN "satisfactionAt" TIMESTAMP(3),
  ADD COLUMN "lastCustomerNotificationAt" TIMESTAMP(3);

ALTER TABLE "SupportMessage"
  ADD COLUMN "clientMessageId" TEXT,
  ADD COLUMN "senderId" TEXT,
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'customer',
  ADD COLUMN "metadataJson" TEXT,
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "readAt" TIMESTAMP(3),
  ADD COLUMN "editedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "SupportAgent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'agent',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportAgent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportAttachment" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportTag" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#22c3a0',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportConversationTag" (
  "conversationId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportConversationTag_pkey" PRIMARY KEY ("conversationId", "tagId")
);

CREATE TABLE "SupportSavedReply" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "category" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportSavedReply_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportMessage_clientMessageId_key" ON "SupportMessage"("clientMessageId");
CREATE UNIQUE INDEX "SupportAgent_userId_key" ON "SupportAgent"("userId");
CREATE UNIQUE INDEX "SupportAgent_email_key" ON "SupportAgent"("email");
CREATE UNIQUE INDEX "SupportTag_name_key" ON "SupportTag"("name");
CREATE UNIQUE INDEX "SupportSavedReply_title_key" ON "SupportSavedReply"("title");
CREATE INDEX "SupportConversation_assignedAgentId_status_updatedAt_idx" ON "SupportConversation"("assignedAgentId", "status", "updatedAt");
CREATE INDEX "SupportConversation_priority_status_updatedAt_idx" ON "SupportConversation"("priority", "status", "updatedAt");
CREATE INDEX "SupportConversation_lastMessageAt_idx" ON "SupportConversation"("lastMessageAt");
CREATE INDEX "SupportMessage_conversationId_visibility_createdAt_idx" ON "SupportMessage"("conversationId", "visibility", "createdAt");
CREATE INDEX "SupportAgent_active_displayName_idx" ON "SupportAgent"("active", "displayName");
CREATE INDEX "SupportAttachment_messageId_createdAt_idx" ON "SupportAttachment"("messageId", "createdAt");
CREATE INDEX "SupportConversationTag_tagId_createdAt_idx" ON "SupportConversationTag"("tagId", "createdAt");
CREATE INDEX "SupportSavedReply_active_title_idx" ON "SupportSavedReply"("active", "title");

ALTER TABLE "SupportConversation"
  ADD CONSTRAINT "SupportConversation_assignedAgentId_fkey"
  FOREIGN KEY ("assignedAgentId") REFERENCES "SupportAgent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportAttachment"
  ADD CONSTRAINT "SupportAttachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "SupportMessage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportConversationTag"
  ADD CONSTRAINT "SupportConversationTag_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportConversationTag"
  ADD CONSTRAINT "SupportConversationTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "SupportTag"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
