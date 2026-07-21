CREATE TABLE "MarineDataRow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "values" JSONB NOT NULL,
    "vesselName" TEXT,
    "imoNumber" TEXT,
    "mmsi" TEXT,
    "companyName" TEXT,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "title" TEXT,
    "country" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'CSV_IMPORT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarineDataRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarineDataRow_workspaceId_idx" ON "MarineDataRow"("workspaceId");
CREATE INDEX "MarineDataRow_imoNumber_idx" ON "MarineDataRow"("imoNumber");
CREATE INDEX "MarineDataRow_email_idx" ON "MarineDataRow"("email");
CREATE INDEX "MarineDataRow_companyName_idx" ON "MarineDataRow"("companyName");
CREATE INDEX "MarineDataRow_vesselName_idx" ON "MarineDataRow"("vesselName");

ALTER TABLE "MarineDataRow" ADD CONSTRAINT "MarineDataRow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
