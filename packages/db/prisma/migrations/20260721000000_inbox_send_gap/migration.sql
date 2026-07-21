-- AlterTable: per-inbox randomized send-gap range (5–20 minutes by default).
-- A fresh random value in [min, max] is picked per send and enforced at send
-- time via a per-inbox "last sent at" lock.
ALTER TABLE "EmailAccount"
  ADD COLUMN "sendGapMinSeconds" INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "sendGapMaxSeconds" INTEGER NOT NULL DEFAULT 1200;
