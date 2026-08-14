-- Referral programme: a user invites someone, and is paid a share of that
-- person's first subscription in credits — but only if the subscription lands
-- inside the reward window opened at signup.

CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'REWARDED', 'EXPIRED');

ALTER TYPE "CreditLedgerReason" ADD VALUE 'REFERRAL_REWARD';

ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referrerWorkspaceId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "referredWorkspaceId" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rewardCredits" INTEGER,
    "rewardedAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- A person can be referred exactly once, ever. This is the anti-abuse spine of
-- the whole feature: without it, one account could be re-referred on every
-- renewal, or by several referrers at once.
CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");
CREATE UNIQUE INDEX "Referral_referredWorkspaceId_key" ON "Referral"("referredWorkspaceId");
CREATE INDEX "Referral_referrerUserId_idx" ON "Referral"("referrerUserId");
CREATE INDEX "Referral_status_expiresAt_idx" ON "Referral"("status", "expiresAt");

ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerUserId_fkey"
    FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerWorkspaceId_fkey"
    FOREIGN KEY ("referrerWorkspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey"
    FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredWorkspaceId_fkey"
    FOREIGN KEY ("referredWorkspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
