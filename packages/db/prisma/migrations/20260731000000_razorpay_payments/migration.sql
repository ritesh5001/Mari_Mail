-- Razorpay support + a provider-agnostic payment ledger.
--
-- Written by hand to match the repo's convention. Every step is additive or
-- backfilled before a constraint is applied, so it can run against production
-- with live Stripe rows present.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'RAZORPAY', 'MANUAL');
CREATE TYPE "PaymentStatus"   AS ENUM ('CREATED', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED');
CREATE TYPE "PaymentPurpose"  AS ENUM ('PLAN', 'CREDITS', 'PAYMENT_LINK');

-- PaymentLinkKind gains RAZORPAY. Postgres cannot add an enum value inside a
-- transaction block on older versions; this is safe on 12+ which Neon runs.
ALTER TYPE "PaymentLinkKind" ADD VALUE IF NOT EXISTS 'RAZORPAY';

-- ---------------------------------------------------------------------------
-- Workspace: gateway identity + membership lifecycle bookkeeping
-- ---------------------------------------------------------------------------
ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "razorpayCustomerId"    TEXT,
  ADD COLUMN IF NOT EXISTS "paymentProvider"       "PaymentProvider",
  ADD COLUMN IF NOT EXISTS "lastRenewalReminderAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "downgradedAt"          TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_razorpayCustomerId_key"
  ON "Workspace"("razorpayCustomerId");

-- Existing paying workspaces came through Stripe; label them so the billing
-- page offers them the Stripe portal rather than a Razorpay checkout.
UPDATE "Workspace"
   SET "paymentProvider" = 'STRIPE'
 WHERE "stripeCustomerId" IS NOT NULL
   AND "paymentProvider" IS NULL;

-- The renewal sweep filters on (billingStatus, currentPeriodEnd) daily.
CREATE INDEX IF NOT EXISTS "Workspace_billingStatus_currentPeriodEnd_idx"
  ON "Workspace"("billingStatus", "currentPeriodEnd");

-- ---------------------------------------------------------------------------
-- Payment ledger
-- ---------------------------------------------------------------------------
CREATE TABLE "Payment" (
  "id"                TEXT              NOT NULL,
  "workspaceId"       TEXT              NOT NULL,
  "userId"            TEXT,
  "provider"          "PaymentProvider" NOT NULL,
  "status"            "PaymentStatus"   NOT NULL DEFAULT 'CREATED',
  "purpose"           "PaymentPurpose"  NOT NULL,
  "amountCents"       INTEGER           NOT NULL,
  "currency"          TEXT              NOT NULL DEFAULT 'USD',
  "grantPlan"         "BillingPlan",
  "grantCredits"      INTEGER,
  "periodDays"        INTEGER,
  "razorpayOrderId"   TEXT,
  "razorpayPaymentId" TEXT,
  "stripeSessionId"   TEXT,
  "paymentLinkId"     TEXT,
  "failureReason"     TEXT,
  "paidAt"            TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)      NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- Unique gateway handles are what make fulfilment idempotent: a webhook
-- replayed by the gateway (they retry aggressively) cannot create a second
-- provisioning row.
CREATE UNIQUE INDEX "Payment_razorpayOrderId_key"   ON "Payment"("razorpayOrderId");
CREATE UNIQUE INDEX "Payment_razorpayPaymentId_key" ON "Payment"("razorpayPaymentId");
CREATE UNIQUE INDEX "Payment_stripeSessionId_key"   ON "Payment"("stripeSessionId");
CREATE INDEX "Payment_workspaceId_createdAt_idx"    ON "Payment"("workspaceId", "createdAt");
CREATE INDEX "Payment_status_idx"                   ON "Payment"("status");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BillingEvent: idempotency key becomes (provider, providerEventId)
--
-- `stripeEventId` alone only worked while Stripe was the only gateway. It is
-- kept (now nullable) so historical receipts stay readable, and backfilled into
-- the new column before the NOT NULL lands.
-- ---------------------------------------------------------------------------
ALTER TABLE "BillingEvent"
  ADD COLUMN IF NOT EXISTS "provider"        "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
  ADD COLUMN IF NOT EXISTS "providerEventId" TEXT;

UPDATE "BillingEvent"
   SET "providerEventId" = "stripeEventId"
 WHERE "providerEventId" IS NULL;

ALTER TABLE "BillingEvent" ALTER COLUMN "providerEventId" SET NOT NULL;
ALTER TABLE "BillingEvent" ALTER COLUMN "stripeEventId"   DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "BillingEvent_provider_providerEventId_key"
  ON "BillingEvent"("provider", "providerEventId");
