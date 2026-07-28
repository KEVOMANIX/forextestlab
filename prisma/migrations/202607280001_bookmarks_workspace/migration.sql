ALTER TABLE "UserProfile"
  ADD COLUMN "workspaceJson" TEXT,
  ADD COLUMN "workspaceTemplatesJson" TEXT;

ALTER TABLE "BacktestSession"
  ADD COLUMN "parentSessionId" TEXT,
  ADD COLUMN "branchPointIndex" INTEGER,
  ADD COLUMN "branchPointTime" BIGINT,
  ADD COLUMN "branchRootId" TEXT;

CREATE INDEX "BacktestSession_parentSessionId_idx"
  ON "BacktestSession"("parentSessionId");
CREATE INDEX "BacktestSession_branchRootId_idx"
  ON "BacktestSession"("branchRootId");

ALTER TABLE "BacktestSession"
  ADD CONSTRAINT "BacktestSession_parentSessionId_fkey"
  FOREIGN KEY ("parentSessionId") REFERENCES "BacktestSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
