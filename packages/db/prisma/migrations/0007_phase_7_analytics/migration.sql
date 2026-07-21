-- CreateTable
CREATE TABLE "ServiceRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "portCode" TEXT,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT DEFAULT 'USD',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceRecord_workspaceId_idx" ON "ServiceRecord"("workspaceId");

-- CreateIndex
CREATE INDEX "ServiceRecord_vesselId_idx" ON "ServiceRecord"("vesselId");

-- CreateIndex
CREATE INDEX "ServiceRecord_serviceDate_idx" ON "ServiceRecord"("serviceDate");

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

