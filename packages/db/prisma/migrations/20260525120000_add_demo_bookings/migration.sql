CREATE TYPE "DemoBookingStatus" AS ENUM ('PENDING', 'CONTACTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "DemoBooking" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "fleetSize" TEXT,
    "message" TEXT,
    "preferredAt" TIMESTAMP(3),
    "timezone" TEXT,
    "status" "DemoBookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "source" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoBooking_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemoBooking_status_idx" ON "DemoBooking"("status");
CREATE INDEX "DemoBooking_createdAt_idx" ON "DemoBooking"("createdAt");
CREATE INDEX "DemoBooking_email_idx" ON "DemoBooking"("email");

CREATE TABLE "DemoSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "adminEmail" TEXT,
    "successMessage" TEXT NOT NULL DEFAULT 'Thanks! We''ll be in touch within one business day.',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "DemoSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "DemoSettings" ("id", "enabled", "successMessage", "updatedAt")
VALUES ('singleton', true, 'Thanks! We''ll be in touch within one business day.', CURRENT_TIMESTAMP);
