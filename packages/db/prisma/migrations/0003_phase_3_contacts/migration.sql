CREATE TYPE "Seniority" AS ENUM ('INTERN', 'ENTRY', 'MID', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR', 'VP', 'C_LEVEL', 'FOUNDER', 'OWNER');
CREATE TYPE "MarineRole" AS ENUM ('FLEET_MANAGER', 'SHIP_SUPERINTENDENT', 'TECHNICAL_MANAGER', 'CREWING_MANAGER', 'CHARTERING_MANAGER', 'PORT_CAPTAIN', 'MARINE_SURVEYOR', 'CLASS_SURVEYOR', 'UNDERWRITER', 'BROKER', 'PORT_AGENT', 'CHANDLER', 'BUNKER_TRADER', 'OPA_PROVIDER', 'OTHER');
CREATE TYPE "EmailStatus" AS ENUM ('VALID', 'RISKY', 'INVALID', 'UNKNOWN');
CREATE TYPE "CompanyKind" AS ENUM ('SHIP_OWNER', 'ISM_MANAGER', 'COMMERCIAL_MANAGER', 'GENERIC');
CREATE TYPE "ContactListType" AS ENUM ('STATIC', 'SMART');
CREATE TYPE "SavedFilterEntityType" AS ENUM ('VESSEL', 'CONTACT', 'COMPANY', 'ETA');

CREATE TABLE "Contact" (
  "id" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "title" TEXT,
  "companyId" TEXT,
  "companyKind" "CompanyKind" NOT NULL DEFAULT 'GENERIC',
  "companyName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "secondaryEmail" TEXT,
  "department" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "contactOwnerId" TEXT,
  "homePhone" TEXT,
  "mobilePhone" TEXT,
  "corporatePhone" TEXT,
  "otherPhone" TEXT,
  "personLinkedinUrl" TEXT,
  "website" TEXT,
  "companyLinkedinUrl" TEXT,
  "country" TEXT,
  "subsidiaryOf" TEXT,
  "salesforceId" TEXT,
  "seniority" "Seniority" NOT NULL DEFAULT 'MID',
  "marineRole" "MarineRole" NOT NULL DEFAULT 'OTHER',
  "emailStatus" "EmailStatus" NOT NULL DEFAULT 'UNKNOWN',
  "engagementScore" INTEGER NOT NULL DEFAULT 0,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "customFields" JSONB,
  "workspaceId" TEXT,
  "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "searchVector" tsvector,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactList" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "name" TEXT NOT NULL,
  "type" "ContactListType" NOT NULL DEFAULT 'STATIC',
  "filterConfig" JSONB,
  "contactCount" INTEGER NOT NULL DEFAULT 0,
  "color" TEXT NOT NULL DEFAULT '#0077B6',
  "icon" TEXT NOT NULL DEFAULT 'users',
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ListContact" (
  "id" TEXT NOT NULL,
  "listId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedFilter" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "name" TEXT NOT NULL,
  "entityType" "SavedFilterEntityType" NOT NULL,
  "filterConfig" JSONB NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedFilter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Contact_email_workspaceId_key" ON "Contact"("email", "workspaceId");
CREATE UNIQUE INDEX "Contact_salesforceId_key" ON "Contact"("salesforceId");
CREATE UNIQUE INDEX "ListContact_listId_contactId_key" ON "ListContact"("listId", "contactId");

CREATE INDEX "Contact_workspaceId_idx" ON "Contact"("workspaceId");
CREATE INDEX "Contact_contactOwnerId_idx" ON "Contact"("contactOwnerId");
CREATE INDEX "Contact_marineRole_idx" ON "Contact"("marineRole");
CREATE INDEX "Contact_emailStatus_idx" ON "Contact"("emailStatus");
CREATE INDEX "Contact_companyName_idx" ON "Contact"("companyName");
CREATE INDEX "Contact_searchVector_idx" ON "Contact" USING GIN ("searchVector");
CREATE INDEX "Contact_department_idx" ON "Contact" USING GIN ("department");
CREATE INDEX "ContactList_workspaceId_idx" ON "ContactList"("workspaceId");
CREATE INDEX "ListContact_contactId_idx" ON "ListContact"("contactId");
CREATE INDEX "SavedFilter_workspaceId_idx" ON "SavedFilter"("workspaceId");
CREATE INDEX "SavedFilter_createdById_idx" ON "SavedFilter"("createdById");
CREATE INDEX "SavedFilter_entityType_idx" ON "SavedFilter"("entityType");

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_contactOwnerId_fkey" FOREIGN KEY ("contactOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactList" ADD CONSTRAINT "ContactList_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListContact" ADD CONSTRAINT "ListContact_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ContactList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListContact" ADD CONSTRAINT "ListContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedFilter" ADD CONSTRAINT "SavedFilter_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedFilter" ADD CONSTRAINT "SavedFilter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION marimail_contact_search_vector() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector(
    'simple',
    coalesce(NEW."firstName", '') || ' ' ||
    coalesce(NEW."lastName", '') || ' ' ||
    coalesce(NEW."email", '') || ' ' ||
    coalesce(NEW."companyName", '') || ' ' ||
    coalesce(NEW."title", '') || ' ' ||
    coalesce(NEW."salesforceId", '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Contact_searchVector_trigger" BEFORE INSERT OR UPDATE ON "Contact" FOR EACH ROW EXECUTE FUNCTION marimail_contact_search_vector();
