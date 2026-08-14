-- Workspace do-not-contact list: explicit blocks on a contact or a whole
-- company, distinct from GlobalSuppression (which records recipient opt-outs).

CREATE TYPE "BlockKind" AS ENUM ('CONTACT', 'COMPANY');

CREATE TABLE "WorkspaceBlock" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "BlockKind" NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "contactId" TEXT,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceBlock_workspaceId_kind_value_key"
    ON "WorkspaceBlock"("workspaceId", "kind", "value");

CREATE INDEX "WorkspaceBlock_workspaceId_kind_idx"
    ON "WorkspaceBlock"("workspaceId", "kind");

ALTER TABLE "WorkspaceBlock"
    ADD CONSTRAINT "WorkspaceBlock_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
