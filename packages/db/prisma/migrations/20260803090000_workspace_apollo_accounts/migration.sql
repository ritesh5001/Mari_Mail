-- Per-workspace Apollo API keys ("bring your own Apollo").
-- Additive only: a new enum, a new table, indexes and foreign keys.

CREATE TYPE "ApolloAccountStatus" AS ENUM ('UNTESTED', 'ACTIVE', 'ERROR');

CREATE TABLE "WorkspaceApolloAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "label" TEXT NOT NULL,
    "apiKey" JSONB NOT NULL,
    "apiBaseUrl" TEXT NOT NULL DEFAULT 'https://api.apollo.io/api/v1',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "ApolloAccountStatus" NOT NULL DEFAULT 'UNTESTED',
    "lastTestAt" TIMESTAMP(3),
    "lastTestError" TEXT,
    "lastTestInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceApolloAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceApolloAccount_workspaceId_idx" ON "WorkspaceApolloAccount"("workspaceId");
CREATE INDEX "WorkspaceApolloAccount_workspaceId_isDefault_idx" ON "WorkspaceApolloAccount"("workspaceId", "isDefault");

ALTER TABLE "WorkspaceApolloAccount" ADD CONSTRAINT "WorkspaceApolloAccount_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceApolloAccount" ADD CONSTRAINT "WorkspaceApolloAccount_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
