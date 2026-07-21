-- AlterTable: per-campaign random gap upper bound
ALTER TABLE "Campaign"
  ADD COLUMN "sendGapMaxSeconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: workspace default random gap range (5–20 minutes)
ALTER TABLE "Workspace"
  ADD COLUMN "defaultSendGapMinSeconds" INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "defaultSendGapMaxSeconds" INTEGER NOT NULL DEFAULT 1200;
