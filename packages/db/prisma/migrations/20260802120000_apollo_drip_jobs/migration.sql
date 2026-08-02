-- Saved Apollo people-search filters that trickle into a contact list.
-- Additive only: a new enum, a new table, and its indexes/foreign keys.

CREATE TYPE "ApolloDripStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED');

CREATE TABLE "ApolloDripJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "filter" JSONB NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 50,
    "status" "ApolloDripStatus" NOT NULL DEFAULT 'ACTIVE',
    "page" INTEGER NOT NULL DEFAULT 1,
    "offsetInPage" INTEGER NOT NULL DEFAULT 0,
    "totalMatches" INTEGER,
    "revealed" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "lastRunAdded" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApolloDripJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApolloDripJob_status_idx" ON "ApolloDripJob"("status");
CREATE INDEX "ApolloDripJob_workspaceId_idx" ON "ApolloDripJob"("workspaceId");
CREATE INDEX "ApolloDripJob_listId_idx" ON "ApolloDripJob"("listId");

ALTER TABLE "ApolloDripJob" ADD CONSTRAINT "ApolloDripJob_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApolloDripJob" ADD CONSTRAINT "ApolloDripJob_listId_fkey"
    FOREIGN KEY ("listId") REFERENCES "ContactList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApolloDripJob" ADD CONSTRAINT "ApolloDripJob_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
