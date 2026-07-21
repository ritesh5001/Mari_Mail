-- Phase 6: campaign builder, ETA sequencer, tracking, and suppression state.

CREATE TYPE "CampaignContactStatus" AS ENUM (
    'PENDING',
    'SCHEDULED',
    'SENT',
    'OPENED',
    'CLICKED',
    'REPLIED',
    'BOUNCED',
    'UNSUBSCRIBED',
    'FAILED',
    'PAUSED'
);

CREATE TYPE "EmailEventType" AS ENUM (
    'SENT',
    'OPENED',
    'CLICKED',
    'REPLIED',
    'BOUNCED_SOFT',
    'BOUNCED_HARD',
    'UNSUBSCRIBED',
    'SPAM',
    'FAILED'
);

ALTER TABLE "Campaign"
ADD COLUMN "fromName" TEXT,
ADD COLUMN "fromAccountIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "rotationStrategy" "RotationStrategy" NOT NULL DEFAULT 'ROUND_ROBIN',
ADD COLUMN "dailyLimit" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN "scheduleDays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5],
ADD COLUMN "scheduleHourStart" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN "scheduleHourEnd" INTEGER NOT NULL DEFAULT 17,
ADD COLUMN "trackOpens" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "trackClicks" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "stopOnReply" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "stopOnBounce" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "stopOnUnsubscribe" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "targetConfig" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN "triggerConfig" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "CampaignSequence"
ADD COLUMN "abTestEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "abSubjectB" TEXT,
ADD COLUMN "abBodyHtmlB" TEXT,
ADD COLUMN "abSplit" INTEGER NOT NULL DEFAULT 50;

CREATE TABLE "CampaignContact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "vesselId" TEXT,
    "etaTriggerId" TEXT,
    "sequenceId" TEXT,
    "status" "CampaignContactStatus" NOT NULL DEFAULT 'PENDING',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "nextSendAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sequenceId" TEXT,
    "campaignContactId" TEXT,
    "messageId" TEXT,
    "trackingId" TEXT,
    "eventType" "EmailEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GlobalSuppression" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'unsubscribe',
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobalSuppression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignContact_campaignId_contactId_key" ON "CampaignContact"("campaignId", "contactId");
CREATE INDEX "CampaignContact_workspaceId_idx" ON "CampaignContact"("workspaceId");
CREATE INDEX "CampaignContact_contactId_idx" ON "CampaignContact"("contactId");
CREATE INDEX "CampaignContact_status_idx" ON "CampaignContact"("status");
CREATE INDEX "CampaignContact_nextSendAt_idx" ON "CampaignContact"("nextSendAt");
CREATE INDEX "CampaignContact_etaTriggerId_idx" ON "CampaignContact"("etaTriggerId");

CREATE INDEX "EmailEvent_workspaceId_idx" ON "EmailEvent"("workspaceId");
CREATE INDEX "EmailEvent_campaignId_idx" ON "EmailEvent"("campaignId");
CREATE INDEX "EmailEvent_contactId_idx" ON "EmailEvent"("contactId");
CREATE INDEX "EmailEvent_sequenceId_idx" ON "EmailEvent"("sequenceId");
CREATE INDEX "EmailEvent_eventType_idx" ON "EmailEvent"("eventType");
CREATE INDEX "EmailEvent_occurredAt_idx" ON "EmailEvent"("occurredAt");
CREATE INDEX "EmailEvent_trackingId_idx" ON "EmailEvent"("trackingId");

CREATE UNIQUE INDEX "GlobalSuppression_token_key" ON "GlobalSuppression"("token");
CREATE UNIQUE INDEX "GlobalSuppression_email_workspaceId_key" ON "GlobalSuppression"("email", "workspaceId");
CREATE INDEX "GlobalSuppression_workspaceId_idx" ON "GlobalSuppression"("workspaceId");
CREATE INDEX "GlobalSuppression_email_idx" ON "GlobalSuppression"("email");

ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_etaTriggerId_fkey" FOREIGN KEY ("etaTriggerId") REFERENCES "ETATrigger"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "CampaignSequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "CampaignSequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_campaignContactId_fkey" FOREIGN KEY ("campaignContactId") REFERENCES "CampaignContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GlobalSuppression" ADD CONSTRAINT "GlobalSuppression_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
