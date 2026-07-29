-- MFA (TOTP) on User
ALTER TABLE "User" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "mfaSecret" JSONB;
ALTER TABLE "User" ADD COLUMN "mfaRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "mfaEnrolledAt" TIMESTAMP(3);

-- Session device metadata (for the self-service "your devices" list)
ALTER TABLE "Session" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "Session" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "Session" ADD COLUMN "lastUsedAt" TIMESTAMP(3);

-- Authentication audit trail
CREATE TYPE "AuthEventType" AS ENUM (
  'LOGIN_SUCCESS','LOGIN_FAILED','LOGIN_BLOCKED_LOCKOUT','LOGOUT',
  'PASSWORD_CHANGED','PASSWORD_RESET','EMAIL_VERIFIED',
  'MFA_ENABLED','MFA_DISABLED','MFA_CHALLENGE_FAILED','RECOVERY_CODE_USED',
  'SESSION_REVOKED','REFRESH_REUSE_DETECTED'
);

CREATE TABLE "AuthEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "email" TEXT,
  "type" "AuthEventType" NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthEvent_userId_createdAt_idx" ON "AuthEvent"("userId","createdAt");
CREATE INDEX "AuthEvent_email_createdAt_idx" ON "AuthEvent"("email","createdAt");
CREATE INDEX "AuthEvent_type_createdAt_idx" ON "AuthEvent"("type","createdAt");

ALTER TABLE "AuthEvent" ADD CONSTRAINT "AuthEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
