-- Apollo delivers phone numbers asynchronously to a webhook, never in the
-- match response. This tracks the in-flight half of that transaction so the
-- webhook can attribute an incoming number to the workspace that paid for it,
-- and so an undelivered reveal can be refunded.

CREATE TYPE "ApolloPhoneRequestStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

CREATE TABLE "ApolloPhoneRequest" (
    "id" TEXT NOT NULL,
    "apolloId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "contactId" TEXT,
    "status" "ApolloPhoneRequestStatus" NOT NULL DEFAULT 'PENDING',
    "creditsCharged" INTEGER NOT NULL,
    "phone" TEXT,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "ApolloPhoneRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApolloPhoneRequest_apolloId_status_idx" ON "ApolloPhoneRequest"("apolloId", "status");
CREATE INDEX "ApolloPhoneRequest_status_requestedAt_idx" ON "ApolloPhoneRequest"("status", "requestedAt");
CREATE INDEX "ApolloPhoneRequest_workspaceId_idx" ON "ApolloPhoneRequest"("workspaceId");
