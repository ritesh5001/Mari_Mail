-- AlterTable
ALTER TABLE "ContactList" ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "ContactList_ownerId_idx" ON "ContactList"("ownerId");

-- AddForeignKey
ALTER TABLE "ContactList" ADD CONSTRAINT "ContactList_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
