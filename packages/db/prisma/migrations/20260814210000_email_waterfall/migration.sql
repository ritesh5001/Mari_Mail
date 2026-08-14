ALTER TYPE "CreditLedgerReason" ADD VALUE IF NOT EXISTS 'WATERFALL_EMAIL';

CREATE TYPE "EmailWaterfallStatus" AS ENUM ('PENDING', 'FOUND', 'NOT_FOUND', 'FAILED');

CREATE TABLE "EmailWaterfallSearch" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT,
  "contactId" TEXT,
  "source" "DataSource" NOT NULL DEFAULT 'APOLLO',
  "externalId" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "personLinkedinUrl" TEXT,
  "status" "EmailWaterfallStatus" NOT NULL DEFAULT 'PENDING',
  "email" TEXT,
  "emailStatus" "EmailStatus",
  "provider" TEXT,
  "creditsCharged" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailWaterfallSearch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailWaterfallSearch_workspaceId_source_externalId_key"
  ON "EmailWaterfallSearch"("workspaceId", "source", "externalId");
CREATE INDEX "EmailWaterfallSearch_requestId_idx" ON "EmailWaterfallSearch"("requestId");
CREATE INDEX "EmailWaterfallSearch_workspaceId_status_idx" ON "EmailWaterfallSearch"("workspaceId", "status");
CREATE INDEX "EmailWaterfallSearch_contactId_idx" ON "EmailWaterfallSearch"("contactId");
CREATE INDEX "EmailWaterfallSearch_createdAt_idx" ON "EmailWaterfallSearch"("createdAt");

ALTER TABLE "EmailWaterfallSearch"
  ADD CONSTRAINT "EmailWaterfallSearch_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailWaterfallSearch"
  ADD CONSTRAINT "EmailWaterfallSearch_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailWaterfallSearch"
  ADD CONSTRAINT "EmailWaterfallSearch_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
