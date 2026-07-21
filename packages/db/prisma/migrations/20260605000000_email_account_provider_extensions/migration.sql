-- Extend EmailProvider enum with SaaS relays + AWS SES.
-- Postgres requires ADD VALUE outside of a transaction; using IF NOT EXISTS
-- keeps the migration idempotent across environments.
ALTER TYPE "EmailProvider" ADD VALUE IF NOT EXISTS 'RESEND';
ALTER TYPE "EmailProvider" ADD VALUE IF NOT EXISTS 'SENDGRID';
ALTER TYPE "EmailProvider" ADD VALUE IF NOT EXISTS 'POSTMARK';
ALTER TYPE "EmailProvider" ADD VALUE IF NOT EXISTS 'SES';

-- Encrypted credential blob for SaaS providers (API keys, AWS access keys).
-- Reuses the existing AES-256-GCM envelope shape used by `encryptedPassword`
-- and `oauthTokens`.
ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "apiKey" JSONB;

-- Verified sender identity used as the From header. For Gmail/Outlook/SMTP
-- accounts this falls back to `email`/`displayName` when null.
ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "fromEmail" TEXT;
ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "fromName" TEXT;

-- Set once the provider confirms the from-address (SendGrid sender identity,
-- SES verified identity, etc.). Surfaced on the DNS-health card.
ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "senderVerified" BOOLEAN NOT NULL DEFAULT false;
