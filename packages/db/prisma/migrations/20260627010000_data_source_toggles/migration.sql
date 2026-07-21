-- CreateTable
CREATE TABLE "DataSourceSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "internalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "persistApolloSearchRows" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,

    CONSTRAINT "DataSourceSettings_pkey" PRIMARY KEY ("id")
);
