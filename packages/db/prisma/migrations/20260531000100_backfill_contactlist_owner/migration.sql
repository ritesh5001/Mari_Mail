-- Lists are now fully private to their owner. Backfill ownerId for legacy rows
-- that predate the owner column by assigning them to the workspace owner.
-- Lists with no resolvable owner remain NULL and become invisible under the
-- new owner-scoped rules (acceptable per the privacy requirement).
UPDATE "ContactList" cl
SET "ownerId" = w."ownerId"
FROM "Workspace" w
WHERE cl."workspaceId" = w."id"
  AND cl."ownerId" IS NULL
  AND w."ownerId" IS NOT NULL;
