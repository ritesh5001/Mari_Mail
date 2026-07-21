-- AlterTable
ALTER TABLE "User" ADD COLUMN "hiddenNavItems" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
