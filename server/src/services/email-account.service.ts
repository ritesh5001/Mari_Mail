import { ConfidentialClientApplication } from "@azure/msal-node";
import { Prisma, prisma, type EmailAccount } from "@marimail/db";
import {
  decryptSecret,
  encryptSecret,
  parseEncryptedSecret,
} from "@marimail/utils";
import { google } from "googleapis";
import nodemailer from "nodemailer";
import { getToken, incrementToken } from "./token-store.js";
import { buildSesTransport, type SesCredentials } from "./transports/ses.js";
import {
  buildPostmarkHttpTransport,
  buildResendHttpTransport,
  buildSendgridHttpTransport,
  buildMailgunHttpTransport,
  type LikeTransport,
  type SendMessage,
} from "./transports/http-api.js";

export type ApiKeyCredentials = {
  apiKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  domain?: string;
  baseUrl?: string;
};

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
};

const CAMPAIGN_PROVIDERS = new Set<EmailAccount["provider"]>([
  "RESEND",
  "SENDGRID",
  "POSTMARK",
  "SES",
  "MAILGUN",
]);

export function defaultSendingMode(provider: EmailAccount["provider"]) {
  return CAMPAIGN_PROVIDERS.has(provider)
    ? "BULK_CAMPAIGN"
    : "PERSONAL_OUTREACH";
}

export type SanitizedEmailAccount = Omit<
  EmailAccount,
  "encryptedPassword" | "oauthTokens" | "apiKey"
> & {
  hasPassword: boolean;
  hasOAuthTokens: boolean;
  hasApiKey: boolean;
  todaySent: number;
};

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function inboxCounterKey(accountId: string, date = new Date()) {
  return `inbox:${accountId}:sent:${todayKey(date)}`;
}

export async function getTodaySent(accountId: string) {
  const value = await getToken(inboxCounterKey(accountId));
  return Number(value ?? 0);
}

export async function incrementTodaySent(accountId: string) {
  return incrementToken(inboxCounterKey(accountId), 36 * 60 * 60);
}

export function sanitizeEmailAccount(
  account: EmailAccount,
  todaySent: number,
): SanitizedEmailAccount {
  const { encryptedPassword, oauthTokens, apiKey, ...safeAccount } = account;
  return {
    ...safeAccount,
    todaySent,
    hasPassword: Boolean(encryptedPassword),
    hasOAuthTokens: Boolean(oauthTokens),
    hasApiKey: Boolean(apiKey),
  };
}

export function encryptJsonSecret(value: unknown) {
  return encryptSecret(
    JSON.stringify(value),
  ) as unknown as Prisma.InputJsonValue;
}

export function decryptJsonSecret<T>(value: unknown): T | null {
  const envelope = parseEncryptedSecret(value);
  if (!envelope) {
    return null;
  }
  return JSON.parse(decryptSecret(envelope)) as T;
}

function decryptAccountPassword(account: EmailAccount) {
  const envelope = parseEncryptedSecret(account.encryptedPassword);
  if (!envelope) {
    return null;
  }
  return decryptSecret(envelope);
}

export async function refreshGoogleTokens(
  tokens: OAuthTokens,
): Promise<OAuthTokens> {
  if (
    !tokens.refreshToken ||
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET
  ) {
    return tokens;
  }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  client.setCredentials({ refresh_token: tokens.refreshToken });
  const response = await client.refreshAccessToken();

  return {
    ...tokens,
    accessToken: response.credentials.access_token ?? tokens.accessToken,
    expiresAt: response.credentials.expiry_date
      ? new Date(response.credentials.expiry_date).toISOString()
      : tokens.expiresAt,
    scope: response.credentials.scope ?? tokens.scope,
  };
}

export async function refreshOutlookTokens(
  tokens: OAuthTokens,
): Promise<OAuthTokens> {
  if (
    !tokens.refreshToken ||
    !process.env.OUTLOOK_CLIENT_ID ||
    !process.env.OUTLOOK_CLIENT_SECRET ||
    !process.env.OUTLOOK_TENANT_ID
  ) {
    return tokens;
  }

  const client = new ConfidentialClientApplication({
    auth: {
      clientId: process.env.OUTLOOK_CLIENT_ID,
      clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
      authority: `https://login.microsoftonline.com/${process.env.OUTLOOK_TENANT_ID}`,
    },
  });
  const response = await client.acquireTokenByRefreshToken({
    refreshToken: tokens.refreshToken,
    scopes: [
      "https://graph.microsoft.com/Mail.Send",
      "offline_access",
      "https://graph.microsoft.com/User.Read",
    ],
  });

  return {
    ...tokens,
    accessToken: response?.accessToken ?? tokens.accessToken,
    expiresAt: response?.expiresOn?.toISOString() ?? tokens.expiresAt,
  };
}

function encodeBase64Url(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAddress(input: string) {
  const match = /^(?:(.*?)\s*<)?([^<>]+@[^<>]+?)>?$/.exec(input.trim());
  return {
    name: match?.[1]?.trim().replace(/^"|"$/g, ""),
    address: match?.[2]?.trim() ?? input.trim(),
  };
}

function headerLine(name: string, value: string | undefined) {
  return value ? `${name}: ${value.replace(/\r?\n/g, " ")}` : null;
}

function buildRawMime(message: SendMessage) {
  const boundary = `marimail_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const to = Array.isArray(message.to) ? message.to.join(", ") : message.to;
  const headers = [
    headerLine("From", message.from),
    headerLine("To", to),
    headerLine("Reply-To", message.replyTo),
    headerLine("Subject", message.subject),
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ...Object.entries(message.headers ?? {}).map(([name, value]) =>
      headerLine(name, value),
    ),
  ].filter(Boolean);
  const text = message.text ?? (message.html ? stripHtml(message.html) : "");
  return [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    message.html ?? text,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function buildGmailApiTransport(
  account: EmailAccount,
  tokens: OAuthTokens,
): LikeTransport {
  return {
    async sendMail(message) {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      const gmail = google.gmail({ version: "v1", auth });
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodeBase64Url(buildRawMime(message)) },
      });
      return { messageId: response.data.id ?? "gmail" };
    },
  };
}

function buildOutlookGraphTransport(tokens: OAuthTokens): LikeTransport {
  return {
    async sendMail(message) {
      const from = parseAddress(message.from);
      const toRecipients = (
        Array.isArray(message.to) ? message.to : [message.to]
      ).map((recipient) => ({
        emailAddress: { address: recipient },
      }));
      const response = await fetch(
        "https://graph.microsoft.com/v1.0/me/sendMail",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              subject: message.subject,
              body: {
                contentType: message.html ? "HTML" : "Text",
                content: message.html ?? message.text ?? "",
              },
              toRecipients,
              from: {
                emailAddress: from.name
                  ? { address: from.address, name: from.name }
                  : { address: from.address },
              },
              replyTo: message.replyTo
                ? [
                    {
                      emailAddress: {
                        address: parseAddress(message.replyTo).address,
                      },
                    },
                  ]
                : undefined,
              internetMessageHeaders: Object.entries(message.headers ?? {}).map(
                ([name, value]) => ({ name, value }),
              ),
            },
            saveToSentItems: true,
          }),
        },
      );
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const err = new Error(
          text || `${response.status} ${response.statusText}`,
        );
        (err as Error & { responseCode: number }).responseCode =
          response.status;
        if (response.status === 401 || response.status === 403)
          (err as Error & { code: string }).code = "EAUTH";
        throw err;
      }
      return { messageId: response.headers.get("request-id") ?? "outlook" };
    },
  };
}

async function persistRefreshedTokens(
  account: EmailAccount,
  previous: OAuthTokens,
  next: OAuthTokens,
) {
  if (account.id === "test-only") return;
  if (
    previous.accessToken === next.accessToken &&
    previous.expiresAt === next.expiresAt &&
    previous.scope === next.scope
  )
    return;
  await prisma.emailAccount
    .update({
      where: { id: account.id },
      data: { oauthTokens: encryptJsonSecret(next) },
    })
    .catch(() => undefined);
}

function decryptApiKey(account: EmailAccount): ApiKeyCredentials {
  const creds = decryptJsonSecret<ApiKeyCredentials>(account.apiKey);
  if (!creds) {
    throw new Error(
      `${account.provider} account is missing encrypted API credentials`,
    );
  }
  return creds;
}

// Tight nodemailer timeouts so a blocked-egress / unreachable provider fails
// fast (~12s total) instead of letting the request hang until the upstream
// proxy returns 502. Tune up if a high-latency provider needs more.
const SMTP_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 5_000,
  socketTimeout: 12_000,
};

export async function buildTransport(account: EmailAccount) {
  if (account.provider === "SMTP") {
    const password = decryptAccountPassword(account);
    if (
      !account.smtpHost ||
      !account.smtpPort ||
      !account.smtpUser ||
      !password
    ) {
      throw new Error(
        "SMTP account is missing host, port, username, or encrypted password",
      );
    }

    return nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpSecure,
      auth: {
        user: account.smtpUser,
        pass: password,
      },
      ...SMTP_TIMEOUTS,
    });
  }

  // Resend / SendGrid / Postmark use their HTTPS API instead of SMTP so the
  // wizard and campaign sends keep working even when the hosting platform
  // blocks outbound SMTP egress (common on serverless / free tiers). Same
  // authentication, different transport.
  if (account.provider === "RESEND") {
    const { apiKey } = decryptApiKey(account);
    if (!apiKey) throw new Error("Resend account is missing API key");
    return buildResendHttpTransport(
      apiKey,
    ) as unknown as nodemailer.Transporter;
  }

  if (account.provider === "SENDGRID") {
    const { apiKey } = decryptApiKey(account);
    if (!apiKey) throw new Error("SendGrid account is missing API key");
    return buildSendgridHttpTransport(
      apiKey,
    ) as unknown as nodemailer.Transporter;
  }

  if (account.provider === "POSTMARK") {
    const { apiKey } = decryptApiKey(account);
    if (!apiKey) throw new Error("Postmark account is missing server token");
    return buildPostmarkHttpTransport(
      apiKey,
    ) as unknown as nodemailer.Transporter;
  }

  if (account.provider === "MAILGUN") {
    const { apiKey, domain, baseUrl } = decryptApiKey(account);
    if (!apiKey || !domain)
      throw new Error("Mailgun account is missing API key or sending domain");
    return buildMailgunHttpTransport(
      apiKey,
      domain,
      baseUrl,
    ) as unknown as nodemailer.Transporter;
  }

  if (account.provider === "SES") {
    const creds = decryptApiKey(account);
    if (!creds.accessKeyId || !creds.secretAccessKey || !creds.region) {
      throw new Error(
        "SES account is missing access key, secret key, or region",
      );
    }
    return buildSesTransport(creds as SesCredentials);
  }

  const tokens = decryptJsonSecret<OAuthTokens>(account.oauthTokens);
  if (!tokens?.accessToken) {
    throw new Error(
      `${account.provider} account is missing encrypted OAuth tokens`,
    );
  }

  const refreshed =
    account.provider === "GMAIL"
      ? await refreshGoogleTokens(tokens)
      : await refreshOutlookTokens(tokens);
  await persistRefreshedTokens(account, tokens, refreshed);

  if (account.provider === "GMAIL") {
    return buildGmailApiTransport(
      account,
      refreshed,
    ) as unknown as nodemailer.Transporter;
  }

  if (account.provider === "OUTLOOK") {
    return buildOutlookGraphTransport(
      refreshed,
    ) as unknown as nodemailer.Transporter;
  }

  return nodemailer.createTransport({
    service: account.provider === "GMAIL" ? "gmail" : undefined,
    host: account.provider === "OUTLOOK" ? "smtp.office365.com" : undefined,
    port: account.provider === "OUTLOOK" ? 587 : undefined,
    secure: false,
    auth: {
      type: "OAuth2",
      user: account.email,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
    },
  });
}

const BARE_ADDRESS_RE = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

export function resolveFromAddress(account: EmailAccount) {
  const address = (account.fromEmail ?? account.email).trim();
  if (!BARE_ADDRESS_RE.test(address)) {
    // Better to throw than to hand Resend a nested bracket like
    // "MariMail <MariMail <no-reply@...>>" which produces an opaque
    // "Invalid `from` field" failure per job.
    throw new Error(
      `Refusing to send: EmailAccount ${account.id} has a malformed from address ${JSON.stringify(address)}. Reprovision the inbox (PAUSE + re-run ensurePlatformInbox) or clean the row.`,
    );
  }
  const name = account.fromName ?? account.displayName ?? null;
  return name ? `${name} <${address}>` : address;
}

export async function sendTestEmail(account: EmailAccount, to: string) {
  const transport = await buildTransport(account);
  const info = await transport.sendMail({
    from: resolveFromAddress(account),
    to,
    subject: "MariMail inbox connection test",
    text: "This confirms MariMail can send through this inbox.",
  });
  await incrementTodaySent(account.id);
  return { messageId: info.messageId };
}

export type CredentialTestInput = {
  provider: EmailAccount["provider"];
  email: string;
  displayName?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpSecure?: boolean;
  oauthTokens?: OAuthTokens;
  apiKey?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  mailgunDomain?: string;
  mailgunBaseUrl?: string;
  fromEmail?: string;
  fromName?: string;
};

/**
 * Build a transient EmailAccount-shaped object whose encrypted fields are
 * encrypted in-memory only. This lets `buildTransport` validate raw
 * credentials end-to-end (network handshake + auth + send) without ever
 * persisting them, so a user can verify the flow before clicking Save.
 */
export async function sendCredentialTest(
  input: CredentialTestInput,
  to: string,
) {
  const encryptedPassword =
    input.provider === "SMTP" && input.smtpPassword
      ? (encryptSecret(input.smtpPassword) as unknown as Prisma.InputJsonValue)
      : null;
  const oauthTokens =
    (input.provider === "GMAIL" || input.provider === "OUTLOOK") &&
    input.oauthTokens
      ? encryptJsonSecret(input.oauthTokens)
      : null;
  const apiKey =
    input.provider === "RESEND" ||
    input.provider === "SENDGRID" ||
    input.provider === "POSTMARK"
      ? encryptJsonSecret({ apiKey: input.apiKey })
      : input.provider === "MAILGUN"
        ? encryptJsonSecret({
            apiKey: input.apiKey,
            domain: input.mailgunDomain,
            baseUrl: input.mailgunBaseUrl,
          })
        : input.provider === "SES"
          ? encryptJsonSecret({
              accessKeyId: input.awsAccessKeyId,
              secretAccessKey: input.awsSecretAccessKey,
              region: input.awsRegion,
            })
          : null;

  const ephemeral = {
    id: "test-only",
    workspaceId: "test-only",
    email: input.email,
    displayName: input.displayName ?? null,
    provider: input.provider,
    status: "ACTIVE",
    encryptedPassword,
    oauthTokens,
    apiKey,
    smtpHost: input.smtpHost ?? null,
    smtpPort: input.smtpPort ?? null,
    smtpUser: input.smtpUser ?? null,
    smtpSecure: input.smtpSecure ?? true,
    fromEmail: input.fromEmail ?? null,
    fromName: input.fromName ?? null,
    senderVerified: false,
    mode: defaultSendingMode(input.provider),
    sendingDomainId: null,
    providerMeta: null,
    dailyLimit: 1,
    todaySent: 0,
    warmupEnabled: false,
    warmupDay: 1,
    spfOk: false,
    dkimOk: false,
    dmarcOk: false,
    healthScore: 0,
    rotationWeight: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as EmailAccount;

  const transport = await buildTransport(ephemeral);

  // Hard deadline so this endpoint always responds before the upstream proxy
  // gives up (~30s). Without this, a blocked SMTP egress turns into a 502 and
  // the wizard can't tell the user why.
  const sendPromise = transport.sendMail({
    from: resolveFromAddress(ephemeral),
    to,
    subject: "MariMail pre-save inbox test",
    text: "This is a pre-save test — your credentials authenticated successfully. If you received this, you can save the inbox.",
  });
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(
        "Provider did not respond within 22s (possible egress block or rate limit).",
      );
      (err as Error & { code: string }).code = "ETIMEDOUT_WRAPPED";
      reject(err);
    }, 22_000);
  });

  try {
    const info = await Promise.race([sendPromise, timeoutPromise]);
    return { messageId: info.messageId };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Turn nodemailer / SDK error codes into a short, user-facing diagnosis.
 * Used by the test-credentials endpoint so the wizard tells the user *why*
 * the test failed instead of a generic stack message.
 */
export function classifyTransportError(error: unknown): {
  reason: string;
  hint: string;
} {
  if (!(error instanceof Error)) {
    return {
      reason: "Unknown error",
      hint: "Try again; if it keeps failing, capture server logs.",
    };
  }
  const code = (error as Error & { code?: string }).code;
  const command = (error as Error & { command?: string }).command;
  const responseCode = (error as Error & { responseCode?: number })
    .responseCode;
  const msg = error.message;

  if (code === "EAUTH" || responseCode === 535 || responseCode === 401) {
    return {
      reason: "Authentication rejected",
      hint: "The API key / password is wrong or doesn't have Send permission. Double-check the credential.",
    };
  }
  if (code === "EENVELOPE" || responseCode === 553 || responseCode === 550) {
    return {
      reason: "Sender or recipient rejected",
      hint: "The From address must be on a domain verified with this provider. Verify the domain, then retry.",
    };
  }
  if (
    code === "ECONNECTION" ||
    code === "ESOCKET" ||
    code === "ETIMEDOUT" ||
    code === "ETIMEDOUT_WRAPPED"
  ) {
    return {
      reason: "Could not reach the provider",
      hint: "The server can't open the SMTP port (often blocked on serverless/free-tier hosts). For Resend/SendGrid try port 587 or use the provider's HTTP API host.",
    };
  }
  if (code === "EDNS") {
    return {
      reason: "DNS lookup failed",
      hint: "The provider hostname could not be resolved from the server.",
    };
  }
  if (command === "CONN") {
    return {
      reason: "TLS / connection error",
      hint: "Verify port + secure flag for this provider.",
    };
  }
  return {
    reason: msg.split("\n")[0] || "Send failed",
    hint: "Open the server logs for the full stack.",
  };
}
