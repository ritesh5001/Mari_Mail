-- ETAs, like vessels, are global by design — one voyage per (vessel, port).
-- Historical imports stamped the caller's workspaceId onto every ETA row,
-- and the CSV importer keyed dedupe on exact ETA time, so a re-import with
-- a corrected time (03:30 → 04:30) created a second row instead of updating.
-- Two of these are visible in the UI as: WADI ALMOLOUK, TAILWIND, SY HANGZHOU
-- each carrying a stale workspace-scoped ETA AND a global ETA for the same
-- voyage.
--
-- This migration:
--   1) Picks a "surviving" row per (vesselId, destinationPort) — the row with
--      the LATEST eta wins (newest known schedule; that's what the shipmaster
--      would say is authoritative). Ties broken by newest createdAt.
--   2) Re-parents any ETATrigger rows that point at the duplicates to the
--      surviving row, so no in-flight campaign trigger is lost.
--   3) Deletes the duplicate rows.
--   4) Nulls out workspaceId on all remaining rows so ETAs become globally
--      visible.
--
-- Idempotent: a second run finds no duplicate groups and no scoped rows.

BEGIN;

-- 1a) Delete triggers that point at a loser ETA where the survivor already has
--     a trigger for the same campaign — the ETATrigger (campaignId, vesselEtaId)
--     unique would otherwise be violated when we re-parent in step 1b.
DELETE FROM "ETATrigger" t
USING (
  SELECT r.id AS drop_id, s.keep_id, r."vesselId", r."destinationPort"
  FROM (
    SELECT
      id,
      "vesselId",
      "destinationPort",
      ROW_NUMBER() OVER (
        PARTITION BY "vesselId", "destinationPort"
        ORDER BY eta DESC, "createdAt" DESC
      ) AS rn
    FROM "VesselETA"
  ) r
  JOIN (
    SELECT
      id AS keep_id,
      "vesselId",
      "destinationPort"
    FROM (
      SELECT
        id,
        "vesselId",
        "destinationPort",
        ROW_NUMBER() OVER (
          PARTITION BY "vesselId", "destinationPort"
          ORDER BY eta DESC, "createdAt" DESC
        ) AS rn
      FROM "VesselETA"
    ) sub
    WHERE sub.rn = 1
  ) s ON s."vesselId" = r."vesselId" AND s."destinationPort" = r."destinationPort"
  WHERE r.rn > 1
) losers
WHERE t."vesselEtaId" = losers.drop_id
  AND EXISTS (
    SELECT 1 FROM "ETATrigger" t2
    WHERE t2."vesselEtaId" = losers.keep_id
      AND t2."campaignId" = t."campaignId"
  );

-- b) Re-parent surviving triggers to the survivor ETA.
UPDATE "ETATrigger" t
SET "vesselEtaId" = losers.keep_id
FROM (
  SELECT r.id AS drop_id, s.keep_id
  FROM (
    SELECT
      id,
      "vesselId",
      "destinationPort",
      ROW_NUMBER() OVER (
        PARTITION BY "vesselId", "destinationPort"
        ORDER BY eta DESC, "createdAt" DESC
      ) AS rn
    FROM "VesselETA"
  ) r
  JOIN (
    SELECT
      id AS keep_id,
      "vesselId",
      "destinationPort"
    FROM (
      SELECT
        id,
        "vesselId",
        "destinationPort",
        ROW_NUMBER() OVER (
          PARTITION BY "vesselId", "destinationPort"
          ORDER BY eta DESC, "createdAt" DESC
        ) AS rn
      FROM "VesselETA"
    ) sub
    WHERE sub.rn = 1
  ) s ON s."vesselId" = r."vesselId" AND s."destinationPort" = r."destinationPort"
  WHERE r.rn > 1
) losers
WHERE t."vesselEtaId" = losers.drop_id;

-- 2) Delete the duplicate ETA rows (triggers on them now either point at the
--    survivor or have been dropped above).
DELETE FROM "VesselETA" v
USING (
  SELECT id AS drop_id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "vesselId", "destinationPort"
        ORDER BY eta DESC, "createdAt" DESC
      ) AS rn
    FROM "VesselETA"
  ) ranked
  WHERE rn > 1
) losers
WHERE v.id = losers.drop_id;

-- 3) Null out workspaceId on every remaining row so ETAs are globally visible.
UPDATE "VesselETA"
SET "workspaceId" = NULL
WHERE "workspaceId" IS NOT NULL;

COMMIT;
