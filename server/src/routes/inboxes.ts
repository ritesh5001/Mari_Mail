import { Prisma } from "@marimail/db";
import { prisma } from "@marimail/db";
import { encryptSecret, randomToken } from "@marimail/utils";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { checkDnsHealth } from "../services/dns-health.service.js";
import {
  classifyTransportError,
  defaultSendingMode,
  encryptJsonSecret,
  getTodaySent,
  sanitizeEmailAccount,
  sendCredentialTest,
  sendTestEmail,
} from "../services/email-account.service.js";
import { emitWorkspaceEvent } from "../services/realtime.js";
import { workspaceHasSendingInbox } from "../services/sending-readiness.js";
import { deleteToken, getToken, setToken } from "../services/token-store.js";

export const inboxRouter = Router();

const providerSchema = z.enum([
  "GMAIL",
  "OUTLOOK",
  "SMTP",
  "RESEND",
  "SENDGRID",
  "POSTMARK",
  "SES",
  "MAILGUN",
]);
const statusSchema = z.enum(["ACTIVE", "PAUSED", "WARMING", "ERROR"]);
const sendingModeSchema = z.enum(["PERSONAL_OUTREACH", "BULK_CAMPAIGN"]);

const oauthTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z.string().optional(),
  scope: z.string().optional(),
});

const createSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1).optional(),
  provider: providerSchema,
  mode: sendingModeSchema.optional(),
  sendingDomainId: z.string().optional(),
  smtpHost: z.string().trim().min(1).optional(),
  smtpPort: z.number().int().min(1).max(65_535).optional(),
  smtpUser: z.string().trim().min(1).optional(),
  smtpPassword: z.string().min(1).optional(),
  smtpSecure: z.boolean().default(true),
  oauthTokens: oauthTokensSchema.optional(),
  // SaaS provider credentials (encrypted at rest)
  apiKey: z.string().trim().min(8).optional(),
  awsAccessKeyId: z.string().trim().min(8).optional(),
  awsSecretAccessKey: z.string().trim().min(8).optional(),
  awsRegion: z.string().trim().min(2).max(40).optional(),
  mailgunDomain: z.string().trim().min(3).optional(),
  mailgunBaseUrl: z.string().url().optional(),
  // From identity (used for SaaS providers; for SMTP/OAuth defaults to email/displayName)
  fromEmail: z.string().email().optional(),
  fromName: z.string().trim().min(1).optional(),
  dailyLimit: z.number().int().min(1).max(2_000).default(50),
  warmupEnabled: z.boolean().default(true),
  rotationWeight: z.number().int().min(1).max(100).default(1),
});

const API_KEY_PROVIDERS = new Set([
  "RESEND",
  "SENDGRID",
  "POSTMARK",
  "MAILGUN",
]);
const OAUTH_PROVIDERS = new Set(["GMAIL", "OUTLOOK"]);

const updateSchema = z.object({
  displayName: z.string().trim().min(1).nullable().optional(),
  status: statusSchema.optional(),
  mode: sendingModeSchema.optional(),
  sendingDomainId: z.string().nullable().optional(),
  smtpHost: z.string().trim().min(1).nullable().optional(),
  smtpPort: z.number().int().min(1).max(65_535).nullable().optional(),
  smtpUser: z.string().trim().min(1).nullable().optional(),
  smtpPassword: z.string().min(1).optional(),
  smtpSecure: z.boolean().optional(),
  dailyLimit: z.number().int().min(1).max(2_000).optional(),
  warmupEnabled: z.boolean().optional(),
  warmupDay: z.number().int().min(1).max(365).optional(),
  rotationWeight: z.number().int().min(1).max(100).optional(),
});

const oauthCallbackSchema = z.object({
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().optional(),
  scope: z.string().optional(),
  code: z.string().optional(),
});

const testSchema = z.object({
  to: z.string().email().optional(),
});

// Same shape as createSchema except every credential is optional at the zod
// layer — provider-specific guards run in the handler so the user gets a
// friendly message per missing field instead of a generic zod error.
const credentialTestSchema = createSchema
  .partial({ dailyLimit: true, warmupEnabled: true, rotationWeight: true })
  .extend({ to: z.string().email() });

function accountWhere(workspaceId: string, id: string) {
  // Platform-default rows are managed by the server, never via this API.
  return { id, workspaceId, isPlatformDefault: false };
}

async function safeAccountList(workspaceId: string) {
  const accounts = await prisma.emailAccount.findMany({
    where: { workspaceId, isPlatformDefault: false },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { sendingDomain: true },
  });

  return Promise.all(
    accounts.map(async (account) =>
      sanitizeEmailAccount(account, await getTodaySent(account.id)),
    ),
  );
}

function appUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function apiUrl() {
  return process.env.API_URL ?? "http://localhost:3001";
}

function oauthRedirectUri(provider: "google" | "outlook") {
  return `${apiUrl()}/api/inboxes/oauth/${provider}/callback`;
}

function emailDomain(email: string | undefined | null) {
  return email?.split("@")[1]?.trim().toLowerCase() || undefined;
}

async function findSendingDomain(workspaceId: string, id: string | undefined) {
  if (!id) return null;
  return prisma.sendingDomain.findFirst({ where: { id, workspaceId } });
}

inboxRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    return sendData(res, { accounts: await safeAccountList(workspaceId) });
  } catch (error) {
    return next(error);
  }
});

// Lightweight check used by dashboard banners / campaign empty-states so the
// frontend can render setup nudges without fetching the full inbox list.
inboxRouter.get("/readiness", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const ready = await workspaceHasSendingInbox(workspaceId);
    return sendData(res, { ready });
  } catch (error) {
    return next(error);
  }
});

inboxRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = createSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        input.error.issues[0]?.message ?? "Invalid input",
      );
    }

    if (OAUTH_PROVIDERS.has(input.data.provider)) {
      return sendError(
        res,
        400,
        "OAUTH_FLOW_REQUIRED",
        `Use the ${input.data.provider} OAuth connect flow for this provider`,
      );
    }

    if (input.data.provider === "SMTP") {
      const missing =
        !input.data.smtpHost ||
        !input.data.smtpPort ||
        !input.data.smtpUser ||
        !input.data.smtpPassword;
      if (missing) {
        return sendError(
          res,
          400,
          "SMTP_REQUIRED",
          "SMTP host, port, username, and password are required",
        );
      }
    }

    if (API_KEY_PROVIDERS.has(input.data.provider) && !input.data.apiKey) {
      return sendError(
        res,
        400,
        "API_KEY_REQUIRED",
        `${input.data.provider} requires an API key`,
      );
    }

    if (input.data.provider === "SES") {
      if (
        !input.data.awsAccessKeyId ||
        !input.data.awsSecretAccessKey ||
        !input.data.awsRegion
      ) {
        return sendError(
          res,
          400,
          "SES_REQUIRED",
          "SES requires accessKeyId, secretAccessKey, and region",
        );
      }
    }

    const { workspaceId } = (req as AuthedRequest).auth;
    const sendingDomain = await findSendingDomain(
      workspaceId,
      input.data.sendingDomainId,
    );
    if (input.data.sendingDomainId && !sendingDomain) {
      return sendError(
        res,
        404,
        "SENDING_DOMAIN_NOT_FOUND",
        "Sending domain not found",
      );
    }
    if (
      input.data.provider === "MAILGUN" &&
      !input.data.mailgunDomain &&
      !sendingDomain?.domain
    ) {
      return sendError(
        res,
        400,
        "MAILGUN_DOMAIN_REQUIRED",
        "Mailgun requires a sending domain",
      );
    }
    const fromAddress = input.data.fromEmail ?? input.data.email;
    const dns = await checkDnsHealth(fromAddress);
    const encryptedPassword = input.data.smtpPassword
      ? (encryptSecret(
          input.data.smtpPassword,
        ) as unknown as Prisma.InputJsonValue)
      : undefined;
    const oauthTokens = input.data.oauthTokens
      ? encryptJsonSecret(input.data.oauthTokens)
      : undefined;

    let apiKey: Prisma.InputJsonValue | undefined;
    if (API_KEY_PROVIDERS.has(input.data.provider)) {
      apiKey = encryptJsonSecret(
        input.data.provider === "MAILGUN"
          ? {
              apiKey: input.data.apiKey,
              domain:
                input.data.mailgunDomain ??
                sendingDomain?.domain ??
                emailDomain(input.data.fromEmail),
              baseUrl: input.data.mailgunBaseUrl,
            }
          : { apiKey: input.data.apiKey },
      );
    } else if (input.data.provider === "SES") {
      apiKey = encryptJsonSecret({
        accessKeyId: input.data.awsAccessKeyId,
        secretAccessKey: input.data.awsSecretAccessKey,
        region: input.data.awsRegion,
      });
    }

    const account = await prisma.emailAccount.create({
      data: {
        workspaceId,
        email: input.data.email.toLowerCase(),
        displayName: input.data.displayName,
        provider: input.data.provider,
        mode: input.data.mode ?? defaultSendingMode(input.data.provider),
        status: input.data.warmupEnabled ? "WARMING" : "ACTIVE",
        encryptedPassword,
        oauthTokens,
        apiKey,
        providerMeta:
          input.data.provider === "MAILGUN"
            ? ({
                domain: input.data.mailgunDomain ?? sendingDomain?.domain,
                baseUrl: input.data.mailgunBaseUrl,
              } as Prisma.InputJsonValue)
            : undefined,
        smtpHost: input.data.smtpHost,
        smtpPort: input.data.smtpPort,
        smtpUser: input.data.smtpUser,
        smtpSecure: input.data.smtpSecure,
        fromEmail: input.data.fromEmail?.toLowerCase(),
        fromName: input.data.fromName,
        sendingDomainId: sendingDomain?.id,
        dailyLimit: input.data.dailyLimit,
        warmupEnabled: input.data.warmupEnabled,
        rotationWeight: input.data.rotationWeight,
        spfOk: dns.spfOk,
        dkimOk: dns.dkimOk,
        dmarcOk: dns.dmarcOk,
        healthScore: dns.healthScore,
      },
    });

    emitWorkspaceEvent(workspaceId, "inbox:created", { inboxId: account.id });
    return sendData(
      res,
      sanitizeEmailAccount(account, await getTodaySent(account.id)),
      201,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENCRYPTION_KEY")) {
      return sendError(res, 500, "ENCRYPTION_NOT_CONFIGURED", error.message);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return sendError(
          res,
          409,
          "DUPLICATE_INBOX",
          "This sender email is already connected",
        );
      }
      // P2022 (missing column) / P2003 (FK fail) / P2010 (raw query failure)
      // bubble up with a concrete reason so the wizard shows it instead of
      // "Unexpected server error" — usually means the migration hasn't been
      // applied to this database yet.
      console.error("[inboxes] prisma error on create:", error);
      return sendError(
        res,
        500,
        "DB_ERROR",
        `Database error (${error.code}): ${error.message.split("\n")[0]}`,
      );
    }
    if (error instanceof Prisma.PrismaClientValidationError) {
      console.error("[inboxes] prisma validation error on create:", error);
      return sendError(
        res,
        500,
        "DB_VALIDATION",
        "Database rejected the inbox payload. The provider-extensions migration may not be applied.",
      );
    }
    if (error instanceof Error) {
      console.error("[inboxes] create failed:", error);
      return sendError(res, 500, "INBOX_CREATE_FAILED", error.message);
    }
    return next(error);
  }
});

// Send a real message using credentials supplied in the request body — never
// persisted. Used by the Add-Inbox wizard so a user can verify their flow
// before clicking Save.
inboxRouter.post("/test-credentials", requireAuth, async (req, res, next) => {
  try {
    const input = credentialTestSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        input.error.issues[0]?.message ?? "Invalid input",
      );
    }
    const data = input.data;

    if (data.provider === "SMTP") {
      if (
        !data.smtpHost ||
        !data.smtpPort ||
        !data.smtpUser ||
        !data.smtpPassword
      ) {
        return sendError(
          res,
          400,
          "SMTP_REQUIRED",
          "SMTP host, port, username, and password are required",
        );
      }
    }
    if (API_KEY_PROVIDERS.has(data.provider) && !data.apiKey) {
      return sendError(
        res,
        400,
        "API_KEY_REQUIRED",
        `${data.provider} requires an API key`,
      );
    }
    if (data.provider === "MAILGUN" && !data.mailgunDomain) {
      return sendError(
        res,
        400,
        "MAILGUN_DOMAIN_REQUIRED",
        "Mailgun requires a sending domain",
      );
    }
    if (data.provider === "SES") {
      if (!data.awsAccessKeyId || !data.awsSecretAccessKey || !data.awsRegion) {
        return sendError(
          res,
          400,
          "SES_REQUIRED",
          "SES requires accessKeyId, secretAccessKey, and region",
        );
      }
    }
    if (OAUTH_PROVIDERS.has(data.provider)) {
      return sendError(
        res,
        400,
        "OAUTH_FLOW_REQUIRED",
        `${data.provider} test sends are available after OAuth connection`,
      );
    }

    try {
      const result = await sendCredentialTest(
        {
          provider: data.provider,
          email: data.email,
          displayName: data.displayName,
          smtpHost: data.smtpHost,
          smtpPort: data.smtpPort,
          smtpUser: data.smtpUser,
          smtpPassword: data.smtpPassword,
          smtpSecure: data.smtpSecure,
          oauthTokens: data.oauthTokens,
          apiKey: data.apiKey,
          awsAccessKeyId: data.awsAccessKeyId,
          awsSecretAccessKey: data.awsSecretAccessKey,
          awsRegion: data.awsRegion,
          mailgunDomain: data.mailgunDomain,
          mailgunBaseUrl: data.mailgunBaseUrl,
          fromEmail: data.fromEmail,
          fromName: data.fromName,
        },
        data.to,
      );
      return sendData(res, {
        ok: true,
        messageId: result.messageId,
        to: data.to,
      });
    } catch (error) {
      console.error("[inboxes] test-credentials send failed:", error);
      const { reason, hint } = classifyTransportError(error);
      return sendError(res, 400, "TEST_SEND_FAILED", `${reason}. ${hint}`);
    }
  } catch (error) {
    return next(error);
  }
});

inboxRouter.get("/oauth/google/start", requireAuth, async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return sendError(
      res,
      500,
      "GOOGLE_OAUTH_NOT_CONFIGURED",
      "Google OAuth credentials are not configured",
    );
  }
  const { userId, workspaceId } = (req as AuthedRequest).auth;
  const state = randomToken(24);
  await setToken(
    `inbox-oauth:${state}`,
    JSON.stringify({ provider: "GMAIL", userId, workspaceId }),
    10 * 60,
  );
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: oauthRedirectUri("google"),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state,
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.send",
    ].join(" "),
  });
  return res.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
});

inboxRouter.get("/oauth/google/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  if (!code || !state)
    return res.redirect(`${appUrl()}/dashboard/inboxes?oauth=missing`);
  const stateValue = await getToken(`inbox-oauth:${state}`);
  await deleteToken(`inbox-oauth:${state}`);
  if (
    !stateValue ||
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET
  ) {
    return res.redirect(`${appUrl()}/dashboard/inboxes?oauth=invalid`);
  }
  const parsed = JSON.parse(stateValue) as { workspaceId: string };
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: oauthRedirectUri("google"),
        grant_type: "authorization_code",
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const tokens = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    const profileResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    );
    const profile = (await profileResponse.json()) as {
      email?: string;
      name?: string;
    };
    if (!profile.email)
      throw new Error("Google profile did not include an email");
    const encryptedTokens = encryptJsonSecret({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : undefined,
      scope: tokens.scope,
    });
    const dns = await checkDnsHealth(profile.email);
    await prisma.emailAccount.upsert({
      where: {
        email_workspaceId: {
          email: profile.email.toLowerCase(),
          workspaceId: parsed.workspaceId,
        },
      },
      update: {
        provider: "GMAIL",
        mode: "PERSONAL_OUTREACH",
        displayName: profile.name,
        oauthTokens: encryptedTokens,
        status: "ACTIVE",
        spfOk: dns.spfOk,
        dkimOk: dns.dkimOk,
        dmarcOk: dns.dmarcOk,
        healthScore: dns.healthScore,
      },
      create: {
        workspaceId: parsed.workspaceId,
        email: profile.email.toLowerCase(),
        displayName: profile.name,
        provider: "GMAIL",
        mode: "PERSONAL_OUTREACH",
        status: "ACTIVE",
        oauthTokens: encryptedTokens,
        dailyLimit: 50,
        warmupEnabled: true,
        spfOk: dns.spfOk,
        dkimOk: dns.dkimOk,
        dmarcOk: dns.dmarcOk,
        healthScore: dns.healthScore,
      },
    });
    return res.redirect(`${appUrl()}/dashboard/inboxes?oauth=google-connected`);
  } catch (error) {
    console.error("[inboxes] google oauth callback failed:", error);
    return res.redirect(`${appUrl()}/dashboard/inboxes?oauth=google-failed`);
  }
});

inboxRouter.get("/oauth/outlook/start", requireAuth, async (req, res) => {
  if (!process.env.OUTLOOK_CLIENT_ID || !process.env.OUTLOOK_CLIENT_SECRET) {
    return sendError(
      res,
      500,
      "OUTLOOK_OAUTH_NOT_CONFIGURED",
      "Outlook OAuth credentials are not configured",
    );
  }
  const { userId, workspaceId } = (req as AuthedRequest).auth;
  const state = randomToken(24);
  await setToken(
    `inbox-oauth:${state}`,
    JSON.stringify({ provider: "OUTLOOK", userId, workspaceId }),
    10 * 60,
  );
  const tenant = process.env.OUTLOOK_TENANT_ID ?? "common";
  const params = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID,
    redirect_uri: oauthRedirectUri("outlook"),
    response_type: "code",
    response_mode: "query",
    state,
    scope: ["offline_access", "User.Read", "Mail.Send"].join(" "),
  });
  return res.redirect(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`,
  );
});

inboxRouter.get("/oauth/outlook/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  if (!code || !state)
    return res.redirect(`${appUrl()}/dashboard/inboxes?oauth=missing`);
  const stateValue = await getToken(`inbox-oauth:${state}`);
  await deleteToken(`inbox-oauth:${state}`);
  if (
    !stateValue ||
    !process.env.OUTLOOK_CLIENT_ID ||
    !process.env.OUTLOOK_CLIENT_SECRET
  ) {
    return res.redirect(`${appUrl()}/dashboard/inboxes?oauth=invalid`);
  }
  const parsed = JSON.parse(stateValue) as { workspaceId: string };
  const tenant = process.env.OUTLOOK_TENANT_ID ?? "common";
  try {
    const response = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.OUTLOOK_CLIENT_ID,
          client_secret: process.env.OUTLOOK_CLIENT_SECRET,
          redirect_uri: oauthRedirectUri("outlook"),
          grant_type: "authorization_code",
          scope: ["offline_access", "User.Read", "Mail.Send"].join(" "),
        }),
      },
    );
    if (!response.ok) throw new Error(await response.text());
    const tokens = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    const profileResponse = await fetch(
      "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    );
    const profile = (await profileResponse.json()) as {
      mail?: string;
      userPrincipalName?: string;
      displayName?: string;
    };
    const email = profile.mail ?? profile.userPrincipalName;
    if (!email) throw new Error("Outlook profile did not include an email");
    const encryptedTokens = encryptJsonSecret({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : undefined,
      scope: tokens.scope,
    });
    const dns = await checkDnsHealth(email);
    await prisma.emailAccount.upsert({
      where: {
        email_workspaceId: {
          email: email.toLowerCase(),
          workspaceId: parsed.workspaceId,
        },
      },
      update: {
        provider: "OUTLOOK",
        mode: "PERSONAL_OUTREACH",
        displayName: profile.displayName,
        oauthTokens: encryptedTokens,
        status: "ACTIVE",
        spfOk: dns.spfOk,
        dkimOk: dns.dkimOk,
        dmarcOk: dns.dmarcOk,
        healthScore: dns.healthScore,
      },
      create: {
        workspaceId: parsed.workspaceId,
        email: email.toLowerCase(),
        displayName: profile.displayName,
        provider: "OUTLOOK",
        mode: "PERSONAL_OUTREACH",
        status: "ACTIVE",
        oauthTokens: encryptedTokens,
        dailyLimit: 50,
        warmupEnabled: true,
        spfOk: dns.spfOk,
        dkimOk: dns.dkimOk,
        dmarcOk: dns.dmarcOk,
        healthScore: dns.healthScore,
      },
    });
    return res.redirect(
      `${appUrl()}/dashboard/inboxes?oauth=outlook-connected`,
    );
  } catch (error) {
    console.error("[inboxes] outlook oauth callback failed:", error);
    return res.redirect(`${appUrl()}/dashboard/inboxes?oauth=outlook-failed`);
  }
});

inboxRouter.post("/:id/oauth/callback", requireAuth, async (req, res, next) => {
  try {
    const input = oauthCallbackSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        input.error.issues[0]?.message ?? "Invalid input",
      );
    }

    if (!input.data.accessToken) {
      return sendError(
        res,
        501,
        "OAUTH_EXCHANGE_NOT_CONFIGURED",
        "Store OAuth tokens by posting accessToken/refreshToken; provider code exchange requires client credentials.",
      );
    }

    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.emailAccount.findFirst({
      where: accountWhere(workspaceId, req.params.id),
    });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "Inbox not found");
    if (!OAUTH_PROVIDERS.has(existing.provider))
      return sendError(
        res,
        400,
        "INVALID_PROVIDER",
        `${existing.provider} inboxes do not use OAuth`,
      );

    const account = await prisma.emailAccount.update({
      where: { id: existing.id },
      data: {
        oauthTokens: encryptJsonSecret({
          accessToken: input.data.accessToken,
          refreshToken: input.data.refreshToken,
          expiresAt: input.data.expiresAt,
          scope: input.data.scope,
        }),
        status: existing.warmupEnabled ? "WARMING" : "ACTIVE",
      },
    });

    emitWorkspaceEvent(workspaceId, "inbox:oauth-connected", {
      inboxId: account.id,
    });
    return sendData(
      res,
      sanitizeEmailAccount(account, await getTodaySent(account.id)),
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENCRYPTION_KEY")) {
      return sendError(res, 500, "ENCRYPTION_NOT_CONFIGURED", error.message);
    }
    return next(error);
  }
});

inboxRouter.post("/:id/test", requireAuth, async (req, res) => {
  try {
    const input = testSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        input.error.issues[0]?.message ?? "Invalid input",
      );
    }

    const { userId, workspaceId } = (req as AuthedRequest).auth;
    const account = await prisma.emailAccount.findFirst({
      where: accountWhere(workspaceId, req.params.id),
    });
    if (!account) return sendError(res, 404, "NOT_FOUND", "Inbox not found");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const to = input.data.to ?? user?.email;
    if (!to)
      return sendError(
        res,
        400,
        "TEST_RECIPIENT_REQUIRED",
        "A test recipient email is required",
      );

    const result = await sendTestEmail(account, to);
    const updated = await prisma.emailAccount.update({
      where: { id: account.id },
      data: {
        todaySent: { increment: 1 },
        status: account.status === "ERROR" ? "ACTIVE" : account.status,
      },
    });

    emitWorkspaceEvent(workspaceId, "inbox:test-sent", { inboxId: account.id });
    return sendData(res, {
      account: sanitizeEmailAccount(updated, await getTodaySent(account.id)),
      messageId: result.messageId,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENCRYPTION_KEY")) {
      return sendError(res, 500, "ENCRYPTION_NOT_CONFIGURED", error.message);
    }
    return sendError(
      res,
      502,
      "TEST_SEND_FAILED",
      error instanceof Error ? error.message : "Unable to send test email",
    );
  }
});

inboxRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const input = updateSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        input.error.issues[0]?.message ?? "Invalid input",
      );
    }

    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.emailAccount.findFirst({
      where: accountWhere(workspaceId, req.params.id),
    });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "Inbox not found");

    const data: Prisma.EmailAccountUpdateInput = {};
    if (input.data.displayName !== undefined)
      data.displayName = input.data.displayName;
    if (input.data.status !== undefined) data.status = input.data.status;
    if (input.data.mode !== undefined) data.mode = input.data.mode;
    if (input.data.sendingDomainId !== undefined) {
      if (input.data.sendingDomainId === null) {
        data.sendingDomain = { disconnect: true };
      } else {
        const sendingDomain = await findSendingDomain(
          workspaceId,
          input.data.sendingDomainId,
        );
        if (!sendingDomain)
          return sendError(
            res,
            404,
            "SENDING_DOMAIN_NOT_FOUND",
            "Sending domain not found",
          );
        data.sendingDomain = { connect: { id: sendingDomain.id } };
      }
    }
    if (input.data.smtpHost !== undefined) data.smtpHost = input.data.smtpHost;
    if (input.data.smtpPort !== undefined) data.smtpPort = input.data.smtpPort;
    if (input.data.smtpUser !== undefined) data.smtpUser = input.data.smtpUser;
    if (input.data.smtpPassword !== undefined) {
      data.encryptedPassword = encryptSecret(
        input.data.smtpPassword,
      ) as unknown as Prisma.InputJsonValue;
    }
    if (input.data.smtpSecure !== undefined)
      data.smtpSecure = input.data.smtpSecure;
    if (input.data.dailyLimit !== undefined)
      data.dailyLimit = input.data.dailyLimit;
    if (input.data.warmupEnabled !== undefined)
      data.warmupEnabled = input.data.warmupEnabled;
    if (input.data.warmupDay !== undefined)
      data.warmupDay = input.data.warmupDay;
    if (input.data.rotationWeight !== undefined)
      data.rotationWeight = input.data.rotationWeight;

    const account = await prisma.emailAccount.update({
      where: { id: existing.id },
      data,
    });
    emitWorkspaceEvent(workspaceId, "inbox:updated", { inboxId: account.id });
    return sendData(
      res,
      sanitizeEmailAccount(account, await getTodaySent(account.id)),
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENCRYPTION_KEY")) {
      return sendError(res, 500, "ENCRYPTION_NOT_CONFIGURED", error.message);
    }
    return next(error);
  }
});

inboxRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.emailAccount.findFirst({
      where: accountWhere(workspaceId, req.params.id),
    });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "Inbox not found");

    await prisma.emailAccount.delete({ where: { id: existing.id } });
    emitWorkspaceEvent(workspaceId, "inbox:deleted", { inboxId: existing.id });
    return sendData(res, { deleted: true });
  } catch (error) {
    return next(error);
  }
});

inboxRouter.get("/:id/dns-check", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.emailAccount.findFirst({
      where: accountWhere(workspaceId, req.params.id),
    });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "Inbox not found");

    const dns = await checkDnsHealth(existing.fromEmail ?? existing.email);
    const account = await prisma.emailAccount.update({
      where: { id: existing.id },
      data: {
        spfOk: dns.spfOk,
        dkimOk: dns.dkimOk,
        dmarcOk: dns.dmarcOk,
        healthScore: dns.healthScore,
      },
    });

    return sendData(res, {
      dns,
      account: sanitizeEmailAccount(account, await getTodaySent(account.id)),
    });
  } catch (error) {
    return next(error);
  }
});

inboxRouter.get("/:id/warmup-log", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.emailAccount.findFirst({
      where: accountWhere(workspaceId, req.params.id),
    });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "Inbox not found");

    const logs = await prisma.warmupLog.findMany({
      where: { accountId: existing.id },
      orderBy: { date: "desc" },
      take: 60,
    });

    return sendData(res, { logs });
  } catch (error) {
    return next(error);
  }
});
