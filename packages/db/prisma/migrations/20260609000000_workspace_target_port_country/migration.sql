-- Per-workspace target port country. ISO 2-letter code matching Port.country.
-- When set, the Vessels page and Port Radar filter to vessels with upcoming
-- ETAs at ports in this country. Null = no filter (legacy / not-yet-picked).
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "targetPortCountry" TEXT;
