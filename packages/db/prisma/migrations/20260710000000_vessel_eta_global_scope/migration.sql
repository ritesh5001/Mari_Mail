-- Make VesselETA.workspaceId nullable so super-admin edits/creates can land
-- as global ETAs (workspaceId IS NULL), visible to every workspace's Port
-- Radar. Existing rows keep their workspaceId; only future super-admin
-- writes will be global.

ALTER TABLE "VesselETA" ALTER COLUMN "workspaceId" DROP NOT NULL;
