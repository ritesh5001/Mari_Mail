-- CreateTable
CREATE TABLE "ApolloRevealCache" (
    "id" TEXT NOT NULL,
    "apolloId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT,
    "title" TEXT,
    "companyName" TEXT NOT NULL,
    "companyDomain" TEXT,
    "companyLinkedinUrl" TEXT,
    "companyWebsite" TEXT,
    "email" TEXT,
    "emailStatus" TEXT,
    "mobilePhone" TEXT,
    "personLinkedinUrl" TEXT,
    "country" TEXT,
    "seniority" "Seniority" NOT NULL DEFAULT 'MID',
    "rawApolloData" JSONB,
    "emailRevealedAt" TIMESTAMP(3),
    "phoneRevealedAt" TIMESTAMP(3),
    "firstRevealedWorkspaceId" TEXT,
    "firstRevealedUserId" TEXT,
    "reuseCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApolloRevealCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApolloRevealCache_apolloId_key" ON "ApolloRevealCache"("apolloId");

-- CreateIndex
CREATE INDEX "ApolloRevealCache_email_idx" ON "ApolloRevealCache"("email");

-- CreateIndex
CREATE INDEX "ApolloRevealCache_companyName_idx" ON "ApolloRevealCache"("companyName");

-- CreateIndex
CREATE INDEX "ApolloRevealCache_emailRevealedAt_idx" ON "ApolloRevealCache"("emailRevealedAt");

-- Backfill: any Contact row already revealed from Apollo (has a real email
-- and stores an apolloId in customFields) becomes a cache row so future
-- reveals of that person skip Apollo.
INSERT INTO "ApolloRevealCache" (
    "id",
    "apolloId",
    "firstName",
    "lastName",
    "title",
    "companyName",
    "email",
    "emailStatus",
    "mobilePhone",
    "personLinkedinUrl",
    "country",
    "seniority",
    "emailRevealedAt",
    "phoneRevealedAt",
    "firstRevealedWorkspaceId",
    "reuseCount",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT ON ("customFields"->>'apolloId')
    'aprc_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "customFields"->>'apolloId',
    "firstName",
    "lastName",
    "title",
    "companyName",
    CASE WHEN "email" LIKE 'apollo-%@unknown.local' THEN NULL ELSE "email" END,
    CASE WHEN "email" LIKE 'apollo-%@unknown.local' THEN NULL ELSE "emailStatus"::text END,
    "mobilePhone",
    "personLinkedinUrl",
    "country",
    "seniority",
    CASE WHEN "email" LIKE 'apollo-%@unknown.local' OR "email" IS NULL THEN NULL ELSE "createdAt" END,
    CASE WHEN "mobilePhone" IS NULL THEN NULL ELSE "createdAt" END,
    "workspaceId",
    0,
    "createdAt",
    "updatedAt"
FROM "Contact"
WHERE "source" = 'APOLLO'
  AND "customFields" ? 'apolloId'
  AND (
    ("email" IS NOT NULL AND "email" NOT LIKE 'apollo-%@unknown.local')
    OR "mobilePhone" IS NOT NULL
  )
ORDER BY "customFields"->>'apolloId', "updatedAt" DESC
ON CONFLICT ("apolloId") DO NOTHING;
