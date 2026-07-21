-- Contacts pulled in by a list change on an already-ACTIVE campaign are STAGED
-- for review instead of auto-enrolled. No send path may act on a STAGED row.
--
-- Deliberately additive only: Postgres forbids referencing a new enum value in
-- the same transaction that adds it, and Prisma runs each migration file in a
-- transaction. Do not add a backfill UPDATE here — there is none by design
-- (existing rows are already-enrolled members and must never be demoted).
ALTER TYPE "CampaignContactStatus" ADD VALUE IF NOT EXISTS 'STAGED';

ALTER TABLE "CampaignContact" ADD COLUMN IF NOT EXISTS "stagedAt" TIMESTAMP(3);
ALTER TABLE "CampaignContact" ADD COLUMN IF NOT EXISTS "stagedReason" TEXT;

-- The review queue is always read as (campaignId, status = STAGED).
CREATE INDEX IF NOT EXISTS "CampaignContact_campaignId_status_idx"
  ON "CampaignContact"("campaignId", "status");
