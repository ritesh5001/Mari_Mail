-- CreateEnum
CREATE TYPE "ETASourceType" AS ENUM ('AIS_AUTO', 'MANUAL_ENTRY', 'CSV_IMPORT', 'API_FEED');

-- CreateEnum
CREATE TYPE "ETAConfidence" AS ENUM ('CONFIRMED', 'ESTIMATED', 'TENTATIVE');

-- CreateEnum
CREATE TYPE "VoyageStatus" AS ENUM ('AT_SEA', 'AT_ANCHOR', 'IN_PORT', 'DRIFTING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignTriggerType" AS ENUM ('MANUAL', 'ETA_BASED', 'PORT_BASED', 'VESSEL_TYPE_BASED', 'CARGO_CHANGE');

-- CreateEnum
CREATE TYPE "SequenceDelayType" AS ENUM ('DAYS_BEFORE_ETA', 'FIXED_DAYS');

-- CreateEnum
CREATE TYPE "SequenceConditionType" AS ENUM ('ALWAYS', 'IF_NOT_OPENED', 'IF_NOT_REPLIED');

-- CreateEnum
CREATE TYPE "ETATriggerStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- DropIndex
DROP INDEX "CommercialManagerCompany_searchVector_idx";

-- DropIndex
DROP INDEX "CommercialManagerCompany_workspaceId_idx";

-- DropIndex
DROP INDEX "Contact_department_idx";

-- DropIndex
DROP INDEX "Contact_searchVector_idx";

-- DropIndex
DROP INDEX "ISMManagerCompany_searchVector_idx";

-- DropIndex
DROP INDEX "ISMManagerCompany_workspaceId_idx";

-- DropIndex
DROP INDEX "ShipOwnerCompany_searchVector_idx";

-- DropIndex
DROP INDEX "ShipOwnerCompany_workspaceId_idx";

-- DropIndex
DROP INDEX "Vessel_searchVector_idx";

-- DropIndex
DROP INDEX "Vessel_workspaceId_idx";

-- CreateTable
CREATE TABLE "VesselETA" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "destinationPort" TEXT NOT NULL,
    "destinationPortName" TEXT NOT NULL,
    "eta" TIMESTAMP(3) NOT NULL,
    "etaSource" "ETASourceType" NOT NULL DEFAULT 'MANUAL_ENTRY',
    "etaConfidence" "ETAConfidence" NOT NULL DEFAULT 'ESTIMATED',
    "currentLat" DOUBLE PRECISION,
    "currentLon" DOUBLE PRECISION,
    "currentPort" TEXT,
    "speedOverGround" DOUBLE PRECISION,
    "lastAISUpdate" TIMESTAMP(3),
    "previousPort" TEXT,
    "previousCargo" TEXT,
    "nextCargo" TEXT,
    "voyageStatus" "VoyageStatus" NOT NULL DEFAULT 'AT_SEA',
    "campaignsTriggered" BOOLEAN NOT NULL DEFAULT false,
    "triggeredAt" TIMESTAMP(3),
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VesselETA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerType" "CampaignTriggerType" NOT NULL DEFAULT 'MANUAL',
    "defaultDaysBefore" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignSequence" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL DEFAULT '',
    "bodyText" TEXT,
    "delayType" "SequenceDelayType" NOT NULL DEFAULT 'DAYS_BEFORE_ETA',
    "delayValue" INTEGER NOT NULL DEFAULT 0,
    "conditionType" "SequenceConditionType" NOT NULL DEFAULT 'ALWAYS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ETATrigger" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "vesselEtaId" TEXT NOT NULL,
    "portCode" TEXT NOT NULL,
    "triggerDaysBefore" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "stepFireTimes" JSONB NOT NULL DEFAULT '[]',
    "status" "ETATriggerStatus" NOT NULL DEFAULT 'PENDING',
    "lastFiredStep" INTEGER,
    "nextFireAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ETATrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortCampaignRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "portCode" TEXT NOT NULL,
    "vesselTypes" "VesselType"[] DEFAULT ARRAY[]::"VesselType"[],
    "campaignId" TEXT NOT NULL,
    "autoEnroll" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortCampaignRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoChangeTrigger" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "campaignId" TEXT NOT NULL,
    "previousCargo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nextCargo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vesselTypes" "VesselType"[] DEFAULT ARRAY[]::"VesselType"[],
    "autoEnroll" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoChangeTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VesselETA_vesselId_idx" ON "VesselETA"("vesselId");

-- CreateIndex
CREATE INDEX "VesselETA_destinationPort_idx" ON "VesselETA"("destinationPort");

-- CreateIndex
CREATE INDEX "VesselETA_eta_idx" ON "VesselETA"("eta");

-- CreateIndex
CREATE INDEX "VesselETA_workspaceId_idx" ON "VesselETA"("workspaceId");

-- CreateIndex
CREATE INDEX "VesselETA_vesselId_destinationPort_eta_idx" ON "VesselETA"("vesselId", "destinationPort", "eta");

-- CreateIndex
CREATE INDEX "Campaign_workspaceId_idx" ON "Campaign"("workspaceId");

-- CreateIndex
CREATE INDEX "Campaign_triggerType_idx" ON "Campaign"("triggerType");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "CampaignSequence_campaignId_idx" ON "CampaignSequence"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSequence_campaignId_stepOrder_key" ON "CampaignSequence"("campaignId", "stepOrder");

-- CreateIndex
CREATE INDEX "ETATrigger_workspaceId_idx" ON "ETATrigger"("workspaceId");

-- CreateIndex
CREATE INDEX "ETATrigger_nextFireAt_idx" ON "ETATrigger"("nextFireAt");

-- CreateIndex
CREATE INDEX "ETATrigger_status_idx" ON "ETATrigger"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ETATrigger_campaignId_vesselEtaId_key" ON "ETATrigger"("campaignId", "vesselEtaId");

-- CreateIndex
CREATE INDEX "PortCampaignRule_workspaceId_idx" ON "PortCampaignRule"("workspaceId");

-- CreateIndex
CREATE INDEX "PortCampaignRule_portCode_idx" ON "PortCampaignRule"("portCode");

-- CreateIndex
CREATE INDEX "PortCampaignRule_priority_idx" ON "PortCampaignRule"("priority");

-- CreateIndex
CREATE INDEX "CargoChangeTrigger_workspaceId_idx" ON "CargoChangeTrigger"("workspaceId");

-- CreateIndex
CREATE INDEX "CargoChangeTrigger_campaignId_idx" ON "CargoChangeTrigger"("campaignId");

-- AddForeignKey
ALTER TABLE "VesselETA" ADD CONSTRAINT "VesselETA_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VesselETA" ADD CONSTRAINT "VesselETA_destinationPort_fkey" FOREIGN KEY ("destinationPort") REFERENCES "Port"("portCode") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "VesselETA" ADD CONSTRAINT "VesselETA_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSequence" ADD CONSTRAINT "CampaignSequence_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ETATrigger" ADD CONSTRAINT "ETATrigger_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ETATrigger" ADD CONSTRAINT "ETATrigger_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ETATrigger" ADD CONSTRAINT "ETATrigger_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ETATrigger" ADD CONSTRAINT "ETATrigger_vesselEtaId_fkey" FOREIGN KEY ("vesselEtaId") REFERENCES "VesselETA"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortCampaignRule" ADD CONSTRAINT "PortCampaignRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortCampaignRule" ADD CONSTRAINT "PortCampaignRule_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortCampaignRule" ADD CONSTRAINT "PortCampaignRule_portCode_fkey" FOREIGN KEY ("portCode") REFERENCES "Port"("portCode") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CargoChangeTrigger" ADD CONSTRAINT "CargoChangeTrigger_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoChangeTrigger" ADD CONSTRAINT "CargoChangeTrigger_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

