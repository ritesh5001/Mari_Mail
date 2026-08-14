-- Persist explicit campaign-wizard milestones for the dashboard itinerary.
ALTER TABLE "Campaign"
  ADD COLUMN "setupLeadsCompletedAt" TIMESTAMP(3),
  ADD COLUMN "setupSequenceCompletedAt" TIMESTAMP(3),
  ADD COLUMN "setupOptionsCompletedAt" TIMESTAMP(3);
