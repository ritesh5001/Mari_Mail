-- Flag identifying the hidden, workspace-scoped EmailAccount that holds the
-- platform-owned Resend credentials. Used by ensurePlatformInbox + the
-- listing filters that keep this row out of admin/user UIs.
ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "isPlatformDefault" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "EmailAccount_workspaceId_isPlatformDefault_idx"
  ON "EmailAccount" ("workspaceId", "isPlatformDefault");
