-- AlterEnum
ALTER TYPE "DataSource" ADD VALUE 'MARIBIZ';

-- CreateTable
CREATE TABLE "MaribizSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cacheTtlSeconds" INTEGER NOT NULL DEFAULT 1800,
    "maxResultsPerQuery" INTEGER NOT NULL DEFAULT 25,
    "lastTestAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestError" TEXT,
    "lastTestTotalRows" INTEGER,
    "lastTestLatencyMs" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "MaribizSettings_pkey" PRIMARY KEY ("id")
);
