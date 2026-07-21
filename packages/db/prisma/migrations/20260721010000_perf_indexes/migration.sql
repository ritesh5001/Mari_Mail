-- Performance indexes for hot dashboard queries.
-- CREATE INDEX IF NOT EXISTS keeps this safe to re-run and non-destructive.

-- Campaign list: filter by workspace, sort by createdAt desc (was a filesort).
CREATE INDEX IF NOT EXISTS "Campaign_workspaceId_createdAt_idx"
  ON "Campaign" ("workspaceId", "createdAt");

-- ETATrigger lookups by vesselEtaId (recompute + analytics joins). vesselEtaId
-- was only the 2nd column of the composite unique, so it couldn't serve these.
CREATE INDEX IF NOT EXISTS "ETATrigger_vesselEtaId_idx"
  ON "ETATrigger" ("vesselEtaId");

-- CampaignContact by vesselId (vessel CRM history + analytics per-vessel joins).
CREATE INDEX IF NOT EXISTS "CampaignContact_vesselId_idx"
  ON "CampaignContact" ("vesselId");
