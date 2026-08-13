-- Confirmed demo slot, stored as an absolute instant (UTC). Slots themselves
-- are only ever offered inside India business hours; see
-- server/src/services/demo-slots.ts for the availability rules.
ALTER TABLE "DemoBooking" ADD COLUMN "scheduledAt" TIMESTAMP(3);

CREATE INDEX "DemoBooking_scheduledAt_idx" ON "DemoBooking"("scheduledAt");

-- One live booking per slot.
--
-- Partial, for two reasons Prisma's @@unique cannot express: most rows have no
-- slot at all (the legacy "request a callback" form never set one) and NULLs
-- must not collide, and a CANCELLED booking has to hand its slot back so the
-- time becomes bookable again rather than being burned forever.
CREATE UNIQUE INDEX "DemoBooking_scheduledAt_active_key"
  ON "DemoBooking" ("scheduledAt")
  WHERE "scheduledAt" IS NOT NULL AND "status" <> 'CANCELLED';
