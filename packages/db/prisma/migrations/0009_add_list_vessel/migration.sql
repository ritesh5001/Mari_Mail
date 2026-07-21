-- CreateTable
CREATE TABLE "ListVessel" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListVessel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListVessel_vesselId_idx" ON "ListVessel"("vesselId");

-- CreateIndex
CREATE UNIQUE INDEX "ListVessel_listId_vesselId_key" ON "ListVessel"("listId", "vesselId");

-- AddForeignKey
ALTER TABLE "ListVessel" ADD CONSTRAINT "ListVessel_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ContactList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListVessel" ADD CONSTRAINT "ListVessel_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
