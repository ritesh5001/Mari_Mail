-- Country access allowance on Workspace (per-plan; Enterprise negotiated per-deal)
ALTER TABLE "Workspace" ADD COLUMN "countryLimit" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Workspace" ADD COLUMN "allowedCountries" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Payment-link enums
CREATE TYPE "PaymentLinkKind" AS ENUM ('STRIPE', 'MANUAL');
CREATE TYPE "PaymentLinkStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');

-- Admin-created payment links (Stripe-generated or manual external URL)
CREATE TABLE "PaymentLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "kind" "PaymentLinkKind" NOT NULL,
    "status" "PaymentLinkStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "url" TEXT NOT NULL,
    "grantPlan" "BillingPlan",
    "grantCountryLimit" INTEGER,
    "grantCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "grantCredits" INTEGER,
    "stripePaymentLinkId" TEXT,
    "stripeSessionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentLink_stripePaymentLinkId_key" ON "PaymentLink"("stripePaymentLinkId");
CREATE UNIQUE INDEX "PaymentLink_stripeSessionId_key" ON "PaymentLink"("stripeSessionId");
CREATE INDEX "PaymentLink_workspaceId_idx" ON "PaymentLink"("workspaceId");
CREATE INDEX "PaymentLink_status_idx" ON "PaymentLink"("status");
CREATE INDEX "PaymentLink_createdAt_idx" ON "PaymentLink"("createdAt");

ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
