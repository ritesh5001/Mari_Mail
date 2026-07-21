-- CreateTable
CREATE TABLE "SavedContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedContact_userId_idx" ON "SavedContact"("userId");

-- CreateIndex
CREATE INDEX "SavedContact_workspaceId_idx" ON "SavedContact"("workspaceId");

-- CreateIndex
CREATE INDEX "SavedContact_contactId_idx" ON "SavedContact"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedContact_userId_contactId_key" ON "SavedContact"("userId", "contactId");

-- AddForeignKey
ALTER TABLE "SavedContact" ADD CONSTRAINT "SavedContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedContact" ADD CONSTRAINT "SavedContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedContact" ADD CONSTRAINT "SavedContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
