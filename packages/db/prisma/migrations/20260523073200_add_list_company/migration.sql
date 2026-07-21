-- AlterTable
ALTER TABLE "ContactList" ADD COLUMN     "companyCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ListCompany" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyKind" "CompanyKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListCompany_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListCompany_listId_idx" ON "ListCompany"("listId");

-- CreateIndex
CREATE INDEX "ListCompany_companyId_companyKind_idx" ON "ListCompany"("companyId", "companyKind");

-- CreateIndex
CREATE UNIQUE INDEX "ListCompany_listId_companyId_companyKind_key" ON "ListCompany"("listId", "companyId", "companyKind");

-- AddForeignKey
ALTER TABLE "ListCompany" ADD CONSTRAINT "ListCompany_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ContactList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
