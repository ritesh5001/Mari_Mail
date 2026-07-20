import { prisma, type EmailAccount } from "@marimail/db";
import { encryptJsonSecret } from "./email-account.service.js";

type PlatformConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
};

// Bare local-part@domain — no angle brackets, no display name, no spaces.
// Matching what SMTP / Resend "envelope from" actually accepts. If
// PLATFORM_FROM_EMAIL is set to a formatted string like
// "MariMail <no-reply@mail.maribiz.ai>", extract the address inside the
// brackets; if that itself is malformed we return null and refuse to write
// an inbox row rather than persist a value that every send will bounce on.
const RAW_EMAIL_RE = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

function normalisePlatformFromEmail(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const bracket = trimmed.match(/<([^>]+)>/);
  const candidate = (bracket ? bracket[1] : trimmed).trim().toLowerCase();
  return RAW_EMAIL_RE.test(candidate) ? candidate : null;
}

function readPlatformConfig(): PlatformConfig | null {
  const apiKey = process.env.PLATFORM_RESEND_API_KEY?.trim();
  const fromEmail = normalisePlatformFromEmail(process.env.PLATFORM_FROM_EMAIL);
  if (!apiKey || !fromEmail) {
    if (apiKey && !fromEmail) {
      console.warn(
        "[platform-inbox] PLATFORM_FROM_EMAIL is missing or malformed; refusing to provision a platform inbox. Set it to a bare address like no-reply@example.com.",
      );
    }
    return null;
  }
  return {
    apiKey,
    fromEmail,
    fromName: process.env.PLATFORM_FROM_NAME?.trim() || "MariMail",
  };
}

/**
 * Ensures a hidden, workspace-scoped EmailAccount exists holding the
 * platform-owned Resend credentials so regular users can send campaigns
 * without connecting their own mailbox. Returns null when the platform
 * env is not configured — callers fall back to the prior BYO-only flow.
 *
 * Safe to call on every readiness check / send: uses upsert against the
 * existing `@@unique([email, workspaceId])` constraint and only writes
 * the encrypted apiKey on create or when env credentials change.
 */
export async function ensurePlatformInbox(workspaceId: string): Promise<EmailAccount | null> {
  const config = readPlatformConfig();
  if (!config) return null;

  // Retire stale platform-default rows in this workspace whose email no
  // longer matches the current env. Without this, changing
  // PLATFORM_FROM_EMAIL leaves orphan rows that selectInbox still rotates
  // through, sending from an unverified domain that the provider rejects.
  await prisma.emailAccount.updateMany({
    where: {
      workspaceId,
      isPlatformDefault: true,
      email: { not: config.fromEmail },
    },
    data: { isPlatformDefault: false, status: "PAUSED" },
  });

  const existing = await prisma.emailAccount.findUnique({
    where: { email_workspaceId: { email: config.fromEmail, workspaceId } },
  });

  if (existing) {
    // Always refresh the encrypted apiKey + identity fields so an env-side
    // rotation propagates to the DB on the next readiness check.
    return prisma.emailAccount.update({
      where: { id: existing.id },
      data: {
        isPlatformDefault: true,
        provider: "RESEND",
        mode: "BULK_CAMPAIGN",
        status: "ACTIVE",
        apiKey: encryptJsonSecret({ apiKey: config.apiKey }),
        fromEmail: config.fromEmail,
        fromName: config.fromName,
      },
    });
  }

  return prisma.emailAccount.create({
    data: {
      workspaceId,
      email: config.fromEmail,
      displayName: "MariMail Platform",
      provider: "RESEND",
      mode: "BULK_CAMPAIGN",
      status: "ACTIVE",
      isPlatformDefault: true,
      apiKey: encryptJsonSecret({ apiKey: config.apiKey }),
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      dailyLimit: 200,
      warmupEnabled: false,
    },
  });
}
