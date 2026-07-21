-- Phase 5: email account connection, sender state, and warmup tracking.

CREATE TYPE "EmailProvider" AS ENUM ('GMAIL', 'OUTLOOK', 'SMTP');
CREATE TYPE "EmailAccountStatus" AS ENUM ('ACTIVE', 'PAUSED', 'WARMING', 'ERROR');
CREATE TYPE "RotationStrategy" AS ENUM ('ROUND_ROBIN', 'WEIGHTED', 'LEAST_USED');

CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "provider" "EmailProvider" NOT NULL,
    "status" "EmailAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "encryptedPassword" JSONB,
    "oauthTokens" JSONB,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "dailyLimit" INTEGER NOT NULL DEFAULT 50,
    "todaySent" INTEGER NOT NULL DEFAULT 0,
    "warmupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "warmupDay" INTEGER NOT NULL DEFAULT 1,
    "spfOk" BOOLEAN NOT NULL DEFAULT false,
    "dkimOk" BOOLEAN NOT NULL DEFAULT false,
    "dmarcOk" BOOLEAN NOT NULL DEFAULT false,
    "healthScore" INTEGER NOT NULL DEFAULT 0,
    "rotationWeight" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WarmupLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "receivedCount" INTEGER NOT NULL DEFAULT 0,
    "repliedCount" INTEGER NOT NULL DEFAULT 0,
    "healthScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarmupLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailAccount_email_workspaceId_key" ON "EmailAccount"("email", "workspaceId");
CREATE INDEX "EmailAccount_workspaceId_idx" ON "EmailAccount"("workspaceId");
CREATE INDEX "EmailAccount_status_idx" ON "EmailAccount"("status");
CREATE INDEX "EmailAccount_provider_idx" ON "EmailAccount"("provider");

CREATE UNIQUE INDEX "WarmupLog_accountId_date_key" ON "WarmupLog"("accountId", "date");
CREATE INDEX "WarmupLog_accountId_idx" ON "WarmupLog"("accountId");
CREATE INDEX "WarmupLog_date_idx" ON "WarmupLog"("date");

ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarmupLog" ADD CONSTRAINT "WarmupLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
