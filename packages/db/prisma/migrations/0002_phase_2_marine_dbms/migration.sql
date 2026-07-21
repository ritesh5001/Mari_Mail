CREATE TYPE "VesselType" AS ENUM ('BULK_CARRIER', 'TANKER_CRUDE', 'TANKER_PRODUCT', 'TANKER_CHEMICAL', 'TANKER_LPG', 'TANKER_LNG', 'CONTAINER', 'GENERAL_CARGO', 'RORO', 'OFFSHORE_PSV', 'OFFSHORE_AHTS', 'OFFSHORE_DRILL', 'FERRY', 'CRUISE', 'DREDGER', 'HEAVY_LIFT', 'BARGE', 'SUPPLY_BOAT', 'RESEARCH', 'OTHER');
CREATE TYPE "VesselStatus" AS ENUM ('ACTIVE', 'LAID_UP', 'SCRAPPED', 'UNDER_CONSTRUCTION', 'MISSING');
CREATE TYPE "DataSource" AS ENUM ('INTERNAL', 'CSV_IMPORT', 'AIS_ENRICHED', 'MANUAL');
CREATE TYPE "OrgType" AS ENUM ('SHIP_OWNER', 'TECHNICAL_MANAGER', 'SHIP_MANAGER', 'OPERATOR');
CREATE TYPE "PortRegion" AS ENUM ('MIDDLE_EAST', 'INDIAN_SUBCONTINENT', 'SOUTHEAST_ASIA', 'EAST_ASIA', 'EUROPE', 'AMERICAS', 'AFRICA', 'OCEANIA');

CREATE TABLE "ShipOwnerCompany" (
  "id" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "website" TEXT,
  "country" TEXT,
  "city" TEXT,
  "address" TEXT,
  "linkedinUrl" TEXT,
  "orgType" "OrgType" NOT NULL DEFAULT 'SHIP_OWNER',
  "fleetSize" INTEGER NOT NULL DEFAULT 0,
  "vesselTypesOwned" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "flagStatesUsed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "portsFrequentlyUsed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "workspaceId" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "searchVector" tsvector,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShipOwnerCompany_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ISMManagerCompany" (
  "id" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "website" TEXT,
  "country" TEXT,
  "city" TEXT,
  "address" TEXT,
  "linkedinUrl" TEXT,
  "orgType" "OrgType" NOT NULL DEFAULT 'TECHNICAL_MANAGER',
  "fleetSize" INTEGER NOT NULL DEFAULT 0,
  "vesselTypesOwned" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "flagStatesUsed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "portsFrequentlyUsed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "ismCertified" BOOLEAN NOT NULL DEFAULT false,
  "certificationExpiry" TIMESTAMP(3),
  "specializations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "fleetManagedCount" INTEGER NOT NULL DEFAULT 0,
  "workspaceId" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "searchVector" tsvector,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ISMManagerCompany_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommercialManagerCompany" (
  "id" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "website" TEXT,
  "country" TEXT,
  "city" TEXT,
  "address" TEXT,
  "linkedinUrl" TEXT,
  "orgType" "OrgType" NOT NULL DEFAULT 'OPERATOR',
  "fleetSize" INTEGER NOT NULL DEFAULT 0,
  "vesselTypesOwned" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "flagStatesUsed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "portsFrequentlyUsed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "tradeTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "majorCharterersServed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "workspaceId" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "searchVector" tsvector,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialManagerCompany_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vessel" (
  "id" TEXT NOT NULL,
  "imoNumber" TEXT NOT NULL,
  "mmsi" TEXT,
  "callsign" TEXT,
  "vesselName" TEXT NOT NULL,
  "flag" TEXT,
  "vesselType" "VesselType" NOT NULL DEFAULT 'OTHER',
  "dwt" INTEGER,
  "grossTonnage" INTEGER,
  "netTonnage" INTEGER,
  "builtYear" INTEGER,
  "lengthOverall" DOUBLE PRECISION,
  "breadth" DOUBLE PRECISION,
  "draft" DOUBLE PRECISION,
  "classificationSociety" TEXT,
  "shipOwnerCompanyId" TEXT,
  "ismManagerCompanyId" TEXT,
  "commercialManagerCompanyId" TEXT,
  "status" "VesselStatus" NOT NULL DEFAULT 'ACTIVE',
  "workspaceId" TEXT,
  "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "searchVector" tsvector,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vessel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Port" (
  "id" TEXT NOT NULL,
  "portCode" TEXT NOT NULL,
  "portName" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "countryName" TEXT NOT NULL,
  "region" "PortRegion" NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "portType" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "defaultServices" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "avgTurnaroundHours" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Port_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Vessel_imoNumber_key" ON "Vessel"("imoNumber");
CREATE UNIQUE INDEX "Vessel_mmsi_key" ON "Vessel"("mmsi");
CREATE UNIQUE INDEX "Port_portCode_key" ON "Port"("portCode");

CREATE INDEX "ShipOwnerCompany_companyName_idx" ON "ShipOwnerCompany"("companyName");
CREATE INDEX "ShipOwnerCompany_workspaceId_idx" ON "ShipOwnerCompany"("workspaceId");
CREATE INDEX "ISMManagerCompany_companyName_idx" ON "ISMManagerCompany"("companyName");
CREATE INDEX "ISMManagerCompany_workspaceId_idx" ON "ISMManagerCompany"("workspaceId");
CREATE INDEX "CommercialManagerCompany_companyName_idx" ON "CommercialManagerCompany"("companyName");
CREATE INDEX "CommercialManagerCompany_workspaceId_idx" ON "CommercialManagerCompany"("workspaceId");
CREATE INDEX "Vessel_vesselName_idx" ON "Vessel"("vesselName");
CREATE INDEX "Vessel_flag_idx" ON "Vessel"("flag");
CREATE INDEX "Vessel_vesselType_idx" ON "Vessel"("vesselType");
CREATE INDEX "Vessel_workspaceId_idx" ON "Vessel"("workspaceId");
CREATE INDEX "Vessel_shipOwnerCompanyId_idx" ON "Vessel"("shipOwnerCompanyId");
CREATE INDEX "Vessel_ismManagerCompanyId_idx" ON "Vessel"("ismManagerCompanyId");
CREATE INDEX "Vessel_commercialManagerCompanyId_idx" ON "Vessel"("commercialManagerCompanyId");
CREATE INDEX "Port_region_idx" ON "Port"("region");
CREATE INDEX "Port_country_idx" ON "Port"("country");

CREATE INDEX "ShipOwnerCompany_searchVector_idx" ON "ShipOwnerCompany" USING GIN ("searchVector");
CREATE INDEX "ISMManagerCompany_searchVector_idx" ON "ISMManagerCompany" USING GIN ("searchVector");
CREATE INDEX "CommercialManagerCompany_searchVector_idx" ON "CommercialManagerCompany" USING GIN ("searchVector");
CREATE INDEX "Vessel_searchVector_idx" ON "Vessel" USING GIN ("searchVector");

ALTER TABLE "ShipOwnerCompany" ADD CONSTRAINT "ShipOwnerCompany_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ISMManagerCompany" ADD CONSTRAINT "ISMManagerCompany_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialManagerCompany" ADD CONSTRAINT "CommercialManagerCompany_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vessel" ADD CONSTRAINT "Vessel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vessel" ADD CONSTRAINT "Vessel_shipOwnerCompanyId_fkey" FOREIGN KEY ("shipOwnerCompanyId") REFERENCES "ShipOwnerCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vessel" ADD CONSTRAINT "Vessel_ismManagerCompanyId_fkey" FOREIGN KEY ("ismManagerCompanyId") REFERENCES "ISMManagerCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vessel" ADD CONSTRAINT "Vessel_commercialManagerCompanyId_fkey" FOREIGN KEY ("commercialManagerCompanyId") REFERENCES "CommercialManagerCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION marimail_company_search_vector() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector('simple', coalesce(NEW."companyName", '') || ' ' || coalesce(NEW."email", '') || ' ' || coalesce(NEW."country", ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION marimail_vessel_search_vector() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector('simple', coalesce(NEW."vesselName", '') || ' ' || coalesce(NEW."imoNumber", '') || ' ' || coalesce(NEW."mmsi", '') || ' ' || coalesce(NEW."callsign", ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ShipOwnerCompany_searchVector_trigger" BEFORE INSERT OR UPDATE ON "ShipOwnerCompany" FOR EACH ROW EXECUTE FUNCTION marimail_company_search_vector();
CREATE TRIGGER "ISMManagerCompany_searchVector_trigger" BEFORE INSERT OR UPDATE ON "ISMManagerCompany" FOR EACH ROW EXECUTE FUNCTION marimail_company_search_vector();
CREATE TRIGGER "CommercialManagerCompany_searchVector_trigger" BEFORE INSERT OR UPDATE ON "CommercialManagerCompany" FOR EACH ROW EXECUTE FUNCTION marimail_company_search_vector();
CREATE TRIGGER "Vessel_searchVector_trigger" BEFORE INSERT OR UPDATE ON "Vessel" FOR EACH ROW EXECUTE FUNCTION marimail_vessel_search_vector();
