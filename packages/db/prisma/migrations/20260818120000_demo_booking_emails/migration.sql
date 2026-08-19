-- Attendee emails for demo bookings: a confirmation on booking, then reminders
-- 24 hours and 1 hour before the slot. Each column stamps the moment its
-- message went out, so the reminder sweep can't send the same one twice.

ALTER TABLE "DemoBooking" ADD COLUMN "confirmationSentAt" TIMESTAMP(3);
ALTER TABLE "DemoBooking" ADD COLUMN "reminderDaySentAt" TIMESTAMP(3);
ALTER TABLE "DemoBooking" ADD COLUMN "reminderHourSentAt" TIMESTAMP(3);

-- Finding "bookings due a reminder" scans by slot on every sweep; without this
-- it is a full table scan every few minutes.
CREATE INDEX "DemoBooking_scheduledAt_status_idx" ON "DemoBooking"("scheduledAt", "status");
