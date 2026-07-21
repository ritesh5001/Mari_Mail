-- CreateEnum
CREATE TYPE "BillingPlan" AS ENUM ('STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'PAUSED', 'TRIALING');

-- CreateEnum
CREATE TYPE "CreditLedgerReason" AS ENUM ('PLAN_REPLENISH', 'ADD_ON_PURCHASE', 'ADMIN_GRANT', 'VIEW_VESSEL', 'SAVE_VESSEL', 'EXPORT_VESSEL', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('USER_BANNED', 'USER_UNBANNED', 'USER_IMPERSONATED', 'CREDITS_GRANTED', 'PLAN_CHANGED', 'GLOBAL_VESSEL_VERIFIED', 'GLOBAL_COMPANY_VERIFIED', 'GLOBAL_CONTACT_VERIFIED', 'PORT_RULE_CHANGED', 'OTHER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "themePreference" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "billingStatus" "BillingStatus" NOT NULL DEFAULT 'TRIALING',
ADD COLUMN     "creditBalance" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "emailLimit" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "inboxLimit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "plan" "BillingPlan" NOT NULL DEFAULT 'STARTER',
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripePriceId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "teamLimit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "vesselLimit" INTEGER NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reason" "CreditLedgerReason" NOT NULL,
    "detail" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "AdminAuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingEvent_stripeEventId_key" ON "BillingEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "BillingEvent_workspaceId_idx" ON "BillingEvent"("workspaceId");

-- CreateIndex
CREATE INDEX "BillingEvent_eventType_idx" ON "BillingEvent"("eventType");

-- CreateIndex
CREATE INDEX "CreditLedger_workspaceId_idx" ON "CreditLedger"("workspaceId");

-- CreateIndex
CREATE INDEX "CreditLedger_createdAt_idx" ON "CreditLedger"("createdAt");

-- CreateIndex
CREATE INDEX "CreditLedger_reason_idx" ON "CreditLedger"("reason");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorId_idx" ON "AdminAuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_stripeCustomerId_key" ON "Workspace"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_stripeSubscriptionId_key" ON "Workspace"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Workspace_plan_idx" ON "Workspace"("plan");

-- CreateIndex
CREATE INDEX "Workspace_stripeCustomerId_idx" ON "Workspace"("stripeCustomerId");

-- AddForeignKey
ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

