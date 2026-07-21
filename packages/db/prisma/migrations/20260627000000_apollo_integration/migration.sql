-- AlterEnum
ALTER TYPE "DataSource" ADD VALUE 'APOLLO';

-- AlterEnum
ALTER TYPE "CreditLedgerReason" ADD VALUE 'REVEAL_EMAIL';
ALTER TYPE "CreditLedgerReason" ADD VALUE 'REVEAL_PHONE';

-- CreateTable
CREATE TABLE "ApolloSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "apiKey" JSONB,
    "apiBaseUrl" TEXT NOT NULL DEFAULT 'https://api.apollo.io/api/v1',
    "cacheTtlSeconds" INTEGER NOT NULL DEFAULT 1800,
    "maxResultsPerQuery" INTEGER NOT NULL DEFAULT 25,
    "creditsPerEmailReveal" INTEGER NOT NULL DEFAULT 1,
    "creditsPerPhoneReveal" INTEGER NOT NULL DEFAULT 1,
    "lastTestAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestError" TEXT,
    "lastTestLatencyMs" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ApolloSettings_pkey" PRIMARY KEY ("id")
);
