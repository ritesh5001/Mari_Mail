-- Performance indexes for list pages and ETA subqueries.
-- Note: originally used CREATE INDEX CONCURRENTLY, but Prisma's migrate wraps
-- each migration in a transaction and CONCURRENTLY is not allowed there. The
-- brief table locks are acceptable during a one-time schema migration.

CREATE INDEX IF NOT EXISTS "Vessel_workspaceId_vesselName_idx"
  ON "Vessel" ("workspaceId", "vesselName");

CREATE INDEX IF NOT EXISTS "Vessel_workspaceId_flag_idx"
  ON "Vessel" ("workspaceId", "flag");

CREATE INDEX IF NOT EXISTS "Contact_workspaceId_companyName_idx"
  ON "Contact" ("workspaceId", "companyName");
