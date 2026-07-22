-- Vessels are global by IMO — no workspace concept applies. Historical
-- imports and manual adds wrongly stamped the caller's workspaceId onto the
-- vessel row, which made every workspace-scoped read (Port Radar's peer-
-- workspace filter, contact-list vessel checks, saved-vessel lookups) hide
-- those rows from other workspaces. WADI ALMOLOUK (IMO 9897999) is the
-- canonical example: added by the "Office" workspace, invisible to every
-- other workspace's UI even though it exists in the DB.
--
-- Straightforward one-shot fix: null out workspaceId on every Vessel row so
-- the entire fleet is visible to every workspace. Idempotent — running it
-- again is a no-op.

UPDATE "Vessel"
SET "workspaceId" = NULL
WHERE "workspaceId" IS NOT NULL;
