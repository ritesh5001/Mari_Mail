-- Hybrid sending model: personal mailbox senders + campaign ESP senders.

ALTER TYPE "EmailProvider" ADD VALUE IF NOT EXISTS 'MAILGUN';

CREATE TYPE "SendingMode" AS ENUM ('PERSONAL_OUTREACH', 'BULK_CAMPAIGN');
CREATE TYPE "SendingDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'ERROR');

CREATE TABLE "SendingDomain" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "status" "SendingDomainStatus" NOT NULL DEFAULT 'PENDING',
    "spfOk" BOOLEAN NOT NULL DEFAULT false,
    "dkimOk" BOOLEAN NOT NULL DEFAULT false,
    "dmarcOk" BOOLEAN NOT NULL DEFAULT false,
    "trackingDomain" TEXT,
    "bounceDomain" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SendingDomain_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Campaign"
ADD COLUMN "sendingMode" "SendingMode" NOT NULL DEFAULT 'PERSONAL_OUTREACH';

ALTER TABLE "EmailAccount"
ADD COLUMN "mode" "SendingMode" NOT NULL DEFAULT 'PERSONAL_OUTREACH',
ADD COLUMN "providerMeta" JSONB,
ADD COLUMN "sendingDomainId" TEXT;

UPDATE "EmailAccount"
SET "mode" = 'BULK_CAMPAIGN'
WHERE "provider" IN ('RESEND', 'SENDGRID', 'POSTMARK', 'SES');

CREATE UNIQUE INDEX "SendingDomain_workspaceId_domain_provider_key" ON "SendingDomain"("workspaceId", "domain", "provider");
CREATE INDEX "SendingDomain_workspaceId_idx" ON "SendingDomain"("workspaceId");
CREATE INDEX "SendingDomain_provider_idx" ON "SendingDomain"("provider");
CREATE INDEX "SendingDomain_status_idx" ON "SendingDomain"("status");
CREATE INDEX "Campaign_sendingMode_idx" ON "Campaign"("sendingMode");
CREATE INDEX "EmailAccount_mode_idx" ON "EmailAccount"("mode");
CREATE INDEX "EmailAccount_sendingDomainId_idx" ON "EmailAccount"("sendingDomainId");

ALTER TABLE "SendingDomain"
ADD CONSTRAINT "SendingDomain_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailAccount"
ADD CONSTRAINT "EmailAccount_sendingDomainId_fkey" FOREIGN KEY ("sendingDomainId") REFERENCES "SendingDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
