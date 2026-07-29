import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { Prisma, prisma } from "@marimail/db";
import { sendTransactionalEmail } from "@marimail/email";
import { randomToken, sha256, slugify } from "@marimail/utils";
import { clearAuthCookies, refreshCookieName, setAuthCookies } from "../lib/cookies.js";
import { sendData, sendError } from "../lib/http.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import {
  issueTokenPair,
  revokeAllUserRefreshTokens,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../auth/jwt.js";
import {
  loginRateLimit,
  passwordResetRateLimit,
  refreshRateLimit,
  registerRateLimit,
  resetTokenRateLimit,
} from "../auth/rate-limit.js";
import {
  breachedPasswordCount,
  clearAuthFailures,
  lockoutRemaining,
  recordAuthEvent,
  registerAuthFailure,
  requestContext,
} from "../auth/auth-events.js";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpAuthUri,
  verifyTotp,
} from "../auth/totp.js";
import { encryptSecret, decryptSecret, parseEncryptedSecret } from "@marimail/utils";
import { planLimits } from "../services/billing.service.js";
import { deleteToken, getToken, setToken } from "../services/token-store.js";

export const authRouter = Router();

const SETTINGS_ID = "singleton";

// A real bcrypt hash (cost 12) of a value nobody can supply. Compared against
// when the submitted email has no account, so the response time of a failed
// login doesn't reveal whether the address is registered.
const DUMMY_PASSWORD_HASH =
  "$2a$12$C6UzMDM.H6dfI/f/IKcEe.9Z7cVfLZbLp9x1Kk0N2mQbT2Rk5m1Yu";

const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(10),
  workspaceName: z.string().trim().min(2).optional(),
  termsAccepted: z.preprocess((value) => value === true || value === "true" || value === "on", z.literal(true)),
  // Optional workspace bootstrap fields — folded into registration so a fresh
  // signup lands directly on /dashboard instead of a two-step wizard. Both
  // legacy clients (that omit these) and the new form (that sends them) are
  // supported: absent values fall back to schema defaults ("UTC", null).
  timezone: z.string().trim().min(2).optional(),
  targetPortCountry: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .optional(),
  // Plan chosen at signup — grants a 14-day free trial of that plan.
  plan: z.enum(["STARTER", "PRO", "FLEET"]).optional(),
  // Countries the user wants to track, capped by the plan's allowance. Sent as
  // a comma-separated string (HTML form) or an array (JSON client).
  countries: z
    .preprocess(
      (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v),
      z.array(z.string().trim().length(2).transform((c) => c.toUpperCase())).max(50),
    )
    .optional(),
});

// Country allowance per plan chosen at registration. FLEET here maps to the
// BUSINESS billing plan internally (the marketing "Fleet" tier).
const PLAN_COUNTRY_LIMIT: Record<"STARTER" | "PRO" | "FLEET", number> = {
  STARTER: 1,
  PRO: 2,
  FLEET: 4,
};

const REGISTER_PLAN_TO_BILLING = {
  STARTER: "STARTER",
  PRO: "PRO",
  FLEET: "BUSINESS",
} as const;

const TRIAL_DAYS = 14;
const TRIAL_CREDITS = 500;

const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
  // TOTP code or a recovery code, supplied on the second step when MFA is on.
  mfaCode: z.string().trim().max(32).optional(),
  remember: z.preprocess((value) => value === undefined ? true : value === true || value === "true" || value === "on", z.boolean()).default(true),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(10),
});

const preferencesSchema = z.object({
  hiddenNavItems: z.array(z.string().trim().min(1)).max(50),
});

const onboardingSchema = z.object({
  workspaceName: z.string().trim().min(2),
  // Company type / primary service are no longer collected during onboarding;
  // kept optional so older clients still validate and the columns retain their
  // schema defaults.
  companyType: z
    .enum([
      "MARINE_SERVICE_COMPANY",
      "SHIP_AGENT",
      "HOLD_CLEANING",
      "HULL_CLEANING",
      "BUNKER_TRADER",
      "CHANDLER",
      "OTHER",
    ])
    .optional(),
  primaryService: z.string().trim().min(2).optional(),
  timezone: z.string().trim().min(2),
  targetPortCountry: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .optional(),
});

async function uniqueWorkspaceSlug(name: string) {
  const base = slugify(name);
  let slug = base;
  let counter = 1;

  while (await prisma.workspace.findUnique({ where: { slug }, select: { id: true } })) {
    counter += 1;
    slug = `${base}-${counter}`;
  }

  return slug;
}

function appUrl(path: string) {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}${path}`;
}

function wantsHtmlRedirect(req: { headers: { accept?: string }; is(type: string): string | false | null }) {
  return Boolean(req.is("application/x-www-form-urlencoded") || req.headers.accept?.includes("text/html"));
}

function registerRetryUrl(body: Record<string, unknown>, message: string) {
  const params = new URLSearchParams({
    error: message,
    name: String(body.name ?? ""),
    email: String(body.email ?? ""),
    workspaceName: String(body.workspaceName ?? ""),
  });
  if (body.termsAccepted === "on" || body.termsAccepted === true || body.termsAccepted === "true") {
    params.set("termsAccepted", "on");
  }
  if (typeof body.timezone === "string" && body.timezone.length > 0) {
    params.set("timezone", body.timezone);
  }
  if (typeof body.targetPortCountry === "string" && body.targetPortCountry.length > 0) {
    params.set("targetPortCountry", body.targetPortCountry);
  }
  if (typeof body.plan === "string" && body.plan.length > 0) {
    params.set("plan", body.plan);
  }
  if (typeof body.countries === "string" && body.countries.length > 0) {
    params.set("countries", body.countries);
  }
  return appUrl(`/register?${params.toString()}`);
}

function loginRetryUrl(body: Record<string, unknown>, message: string) {
  const params = new URLSearchParams({
    error: message,
    email: String(body.email ?? ""),
  });
  if (body.remember === "on" || body.remember === true || body.remember === "true") {
    params.set("remember", "on");
  }
  return appUrl(`/login?${params.toString()}`);
}

async function getRegistrationEnabled() {
  const settings = await prisma.demoSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { registrationEnabled: true },
  });
  if (settings) return settings.registrationEnabled;

  const created = await prisma.demoSettings.create({
    data: { id: SETTINGS_ID },
    select: { registrationEnabled: true },
  });
  return created.registrationEnabled;
}

function serializeSession(user: {
  id: string;
  name: string | null;
  email: string;
  emailVerified: Date | null;
  defaultWorkspaceId: string | null;
  isSuperAdmin?: boolean;
  hiddenNavItems?: string[];
  memberships: Array<{
    role: "OWNER" | "ADMIN" | "MEMBER";
    workspace: {
      id: string;
      name: string;
      slug: string;
      timezone: string;
      targetPortCountry: string | null;
      allowedCountries?: string[];
      countryLimit?: number;
      onboardedAt: Date | null;
    };
  }>;
}) {
  const workspaces = user.memberships.map((membership) => ({
    id: membership.workspace.id,
    name: membership.workspace.name,
    slug: membership.workspace.slug,
    role: membership.role,
    timezone: membership.workspace.timezone,
    targetPortCountry: membership.workspace.targetPortCountry,
    allowedCountries: membership.workspace.allowedCountries ?? [],
    countryLimit: membership.workspace.countryLimit ?? 1,
    onboardedAt: membership.workspace.onboardedAt?.toISOString() ?? null,
  }));

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === user.defaultWorkspaceId) ?? workspaces[0] ?? null;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified?.toISOString() ?? null,
      defaultWorkspaceId: user.defaultWorkspaceId,
      isSuperAdmin: user.isSuperAdmin ?? false,
      hiddenNavItems: user.hiddenNavItems ?? [],
    },
    activeWorkspace,
    workspaces,
  };
}

function userSessionSelect(includeTargetPortCountry: boolean) {
  return {
    id: true,
    name: true,
    email: true,
    emailVerified: true,
    defaultWorkspaceId: true,
    isSuperAdmin: true,
    hiddenNavItems: true,
    memberships: {
      select: {
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            timezone: true,
            onboardedAt: true,
            allowedCountries: true,
            countryLimit: true,
            ...(includeTargetPortCountry ? { targetPortCountry: true as const } : {}),
          },
        },
      },
      orderBy: { createdAt: "asc" as const },
    },
  } satisfies Prisma.UserSelect;
}

/**
 * The `targetPortCountry` column was added in a recent migration. If the
 * production DB hasn't applied it yet, the SELECT throws P2022. Retry once
 * without that column so the login + session refresh paths still work, and
 * default the field to null in the serialised session.
 */
async function loadUserWithSession(where: Prisma.UserWhereUniqueInput) {
  try {
    return await prisma.user.findUnique({ where, select: userSessionSelect(true) });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2022" &&
      /targetPortCountry/i.test(error.message)
    ) {
      const user = await prisma.user.findUnique({ where, select: userSessionSelect(false) });
      if (!user) return null;
      return {
        ...user,
        memberships: user.memberships.map((membership) => ({
          role: membership.role,
          workspace: { ...membership.workspace, targetPortCountry: null as string | null },
        })),
      };
    }
    throw error;
  }
}

async function loadSession(userId: string) {
  const user = await loadUserWithSession({ id: userId });
  return user ? serializeSession(user) : null;
}

authRouter.post("/register", registerRateLimit, async (req, res, next) => {
  try {
    const registrationEnabled = await getRegistrationEnabled();
    if (!registrationEnabled) {
      const message = "Registration is currently paused by an administrator";
      if (wantsHtmlRedirect(req)) {
        return res.redirect(303, registerRetryUrl(req.body as Record<string, unknown>, message));
      }
      return sendError(res, 403, "REGISTRATION_DISABLED", message);
    }

    const input = registerSchema.safeParse(req.body);
    if (!input.success) {
      if (wantsHtmlRedirect(req)) {
        return res.redirect(303, registerRetryUrl(req.body as Record<string, unknown>, input.error.issues[0]?.message ?? "Invalid input"));
      }
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await prisma.user.findUnique({ where: { email: input.data.email }, select: { id: true } });
    if (existing) {
      if (wantsHtmlRedirect(req)) {
        return res.redirect(303, registerRetryUrl(req.body as Record<string, unknown>, "A user with this email already exists"));
      }
      return sendError(res, 409, "EMAIL_EXISTS", "A user with this email already exists");
    }

    // Reject passwords known to be in public breach corpora. k-anonymity: only
    // a 5-char SHA-1 prefix leaves this server, never the password.
    const breaches = await breachedPasswordCount(input.data.password);
    if (breaches > 0) {
      const message = `This password has appeared in ${breaches.toLocaleString("en")} known data breaches. Please choose a different one.`;
      if (wantsHtmlRedirect(req)) {
        return res.redirect(303, registerRetryUrl(req.body as Record<string, unknown>, message));
      }
      return sendError(res, 400, "PASSWORD_BREACHED", message);
    }

    const passwordHash = await bcrypt.hash(input.data.password, 12);
    const workspaceName = input.data.workspaceName ?? `${input.data.name}'s Workspace`;
    const slug = await uniqueWorkspaceSlug(workspaceName);

    // Resolve the chosen plan → billing plan, country allowance, and the
    // 14-day free trial (plan features + 500 credits, then we start charging).
    const chosenPlan = input.data.plan ?? "STARTER";
    const billingPlan = REGISTER_PLAN_TO_BILLING[chosenPlan];
    const countryLimit = PLAN_COUNTRY_LIMIT[chosenPlan];
    const limits = planLimits(billingPlan);
    // Only grant as many countries as the plan allows.
    const allowedCountries = (input.data.countries ?? []).slice(0, countryLimit);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: input.data.name,
          email: input.data.email,
          passwordHash,
          // NOT auto-verified any more. This used to be set unconditionally,
          // so nobody ever proved they owned the address — enabling signup as
          // someone else, and unlimited fake accounts each claiming a 14-day
          // trial + 500 credits.
          emailVerified: null,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: workspaceName,
          slug,
          ownerId: createdUser.id,
          // Seed the workspace with the values the register form collected;
          // omit fields fall back to the Prisma schema default ("UTC", null).
          ...(input.data.timezone ? { timezone: input.data.timezone } : {}),
          ...(input.data.targetPortCountry
            ? { targetPortCountry: input.data.targetPortCountry }
            : {}),
          // 14-day free trial of the chosen plan.
          plan: billingPlan,
          billingStatus: "TRIALING",
          trialEndsAt,
          vesselLimit: limits.vesselLimit,
          emailLimit: limits.emailLimit,
          inboxLimit: limits.inboxLimit,
          teamLimit: limits.teamLimit,
          // Free 500 credits for the trial (not the plan's monthly allotment —
          // that kicks in once billing starts after the trial).
          creditBalance: TRIAL_CREDITS,
          // Country access chosen at signup, capped by the plan.
          countryLimit,
          allowedCountries,
          // Skip the /onboarding wizard when the register form already
          // gathered the workspace basics. Login sees onboardedAt !== null
          // and routes straight to /dashboard.
          ...(input.data.targetPortCountry && input.data.timezone
            ? { onboardedAt: new Date() }
            : {}),
        },
      });

      // Record the trial credit grant in the ledger for auditability.
      await tx.creditLedger.create({
        data: {
          workspaceId: workspace.id,
          delta: TRIAL_CREDITS,
          balance: TRIAL_CREDITS,
          reason: "ADMIN_GRANT",
          detail: `14-day trial credits (${chosenPlan})`,
          actorId: createdUser.id,
        },
      });

      await tx.workspaceMember.create({
        data: {
          userId: createdUser.id,
          workspaceId: workspace.id,
          role: "OWNER",
        },
      });

      return tx.user.update({
        where: { id: createdUser.id },
        data: { defaultWorkspaceId: workspace.id },
      });
    });

    await sendVerificationEmail(user.id, user.email);
    await recordAuthEvent({ type: "LOGIN_SUCCESS", req, userId: user.id, email: user.email, detail: "account created" });

    if (wantsHtmlRedirect(req)) {
      return res.redirect(303, appUrl("/login?registered=1"));
    }

    return sendData(res, { id: user.id, email: user.email, verificationRequired: true }, 201);
  } catch (error) {
    return next(error);
  }
});

/**
 * Issue a fresh email-verification token and send the link. Any previously
 * issued token for the user is dropped so only the newest link works.
 */
async function sendVerificationEmail(userId: string, email: string) {
  const token = randomToken(32);
  const tokenHash = sha256(token);

  await prisma.verificationToken.deleteMany({ where: { userId } });
  await prisma.verificationToken.create({
    data: {
      identifier: email.toLowerCase(),
      token: tokenHash,
      userId,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const link = appUrl(`/verify-email/${token}`);
  try {
    await sendTransactionalEmail({
      to: email,
      subject: "Confirm your MariMail email address",
      html: `<p>Confirm your email address by opening <a href="${link}">this link</a>. It expires in 24 hours.</p>`,
      text: `Confirm your MariMail email address: ${link} (expires in 24 hours)`,
    });
  } catch (error) {
    // Don't fail signup because the mail provider hiccuped — the user can
    // request a new link from /resend-verification.
    console.error(`[auth] verification email failed for ${email}: ${(error as Error).message}`);
    if (process.env.NODE_ENV !== "production") console.warn(`[auth] verification link: ${link}`);
  }
}

/** Confirm ownership of the address. Token is single-use and hashed at rest. */
authRouter.post("/verify-email", resetTokenRateLimit, async (req, res, next) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    if (token.length < 32) {
      return sendError(res, 400, "INVALID_TOKEN", "Verification link is invalid or expired");
    }
    const tokenHash = sha256(token);
    const record = await prisma.verificationToken.findUnique({ where: { token: tokenHash } });
    if (!record || !record.userId || record.expires < new Date()) {
      return sendError(res, 400, "INVALID_TOKEN", "Verification link is invalid or expired");
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerified: new Date() } }),
      prisma.verificationToken.delete({ where: { token: tokenHash } }),
    ]);
    await recordAuthEvent({ type: "EMAIL_VERIFIED", req, userId: record.userId, email: record.identifier });

    return sendData(res, { verified: true });
  } catch (error) {
    return next(error);
  }
});

/** Request a new verification link. Always reports success (no enumeration). */
authRouter.post("/resend-verification", passwordResetRateLimit, async (req, res, next) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!email) return sendError(res, 400, "VALIDATION_ERROR", "Email is required");

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerified: true },
    });
    if (user && !user.emailVerified) {
      await sendVerificationEmail(user.id, user.email);
    }
    return sendData(res, { sent: true });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/login", loginRateLimit, async (req, res, next) => {
  try {
    const input = loginSchema.safeParse(req.body);
    if (!input.success) {
      if (wantsHtmlRedirect(req)) {
        return res.redirect(303, loginRetryUrl(req.body as Record<string, unknown>, input.error.issues[0]?.message ?? "Invalid input"));
      }
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    // Progressive lockout: escalating blocks on repeated failures for THIS
    // account, which is what stops a slow distributed spray that stays under
    // the per-IP rate limit.
    const lockedFor = await lockoutRemaining(input.data.email);
    if (lockedFor > 0) {
      await recordAuthEvent({
        type: "LOGIN_BLOCKED_LOCKOUT",
        req,
        email: input.data.email,
        detail: `locked for ${lockedFor}s`,
      });
      res.setHeader("Retry-After", String(lockedFor));
      return sendError(
        res,
        429,
        "ACCOUNT_LOCKED",
        `Too many failed sign-in attempts. Try again in ${Math.ceil(lockedFor / 60)} minutes.`,
      );
    }

    const credentials = await prisma.user.findUnique({
      where: { email: input.data.email },
      select: {
        id: true,
        passwordHash: true,
        bannedAt: true,
        emailVerified: true,
        mfaEnabled: true,
        mfaSecret: true,
        mfaRecoveryCodes: true,
      },
    });

    // Constant-time-ish comparison. Previously a missing user short-circuited
    // before bcrypt.compare, so "no such account" answered ~100ms faster than
    // "wrong password" — a reliable timing oracle for enumerating which emails
    // are registered. Always spend a comparison, against a dummy hash when the
    // account doesn't exist.
    const hashToCheck = credentials?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordOk = await bcrypt.compare(input.data.password, hashToCheck);

    if (!credentials?.passwordHash || !passwordOk) {
      await registerAuthFailure(input.data.email);
      await recordAuthEvent({
        type: "LOGIN_FAILED",
        req,
        userId: credentials?.id ?? null,
        email: input.data.email,
      });
      if (wantsHtmlRedirect(req)) {
        return res.redirect(303, loginRetryUrl(req.body as Record<string, unknown>, "Email or password is incorrect"));
      }
      return sendError(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    if (credentials.bannedAt) {
      return sendError(res, 403, "ACCOUNT_SUSPENDED", "This account has been suspended.");
    }

    // Second factor. The password is already proven correct at this point; a
    // valid TOTP code or a single-use recovery code is still required.
    if (credentials.mfaEnabled) {
      const submitted = typeof req.body?.mfaCode === "string" ? req.body.mfaCode.trim() : "";
      if (!submitted) {
        // Deliberately NOT an error: the client uses this to render the code
        // prompt. No session is issued yet.
        return sendData(res, { mfaRequired: true });
      }

      const envelope = parseEncryptedSecret(credentials.mfaSecret);
      const secret = envelope ? decryptSecret(envelope) : null;
      const totpOk = secret ? verifyTotp(secret, submitted) : false;

      let recoveryUsed = false;
      if (!totpOk) {
        // Fall back to recovery codes — single use, so consume on match.
        const hash = hashRecoveryCode(submitted);
        if (credentials.mfaRecoveryCodes.includes(hash)) {
          recoveryUsed = true;
          await prisma.user.update({
            where: { id: credentials.id },
            data: { mfaRecoveryCodes: credentials.mfaRecoveryCodes.filter((c) => c !== hash) },
          });
          await recordAuthEvent({
            type: "RECOVERY_CODE_USED",
            req,
            userId: credentials.id,
            email: input.data.email,
            detail: `${credentials.mfaRecoveryCodes.length - 1} codes remaining`,
          });
        }
      }

      if (!totpOk && !recoveryUsed) {
        await registerAuthFailure(input.data.email);
        await recordAuthEvent({
          type: "MFA_CHALLENGE_FAILED",
          req,
          userId: credentials.id,
          email: input.data.email,
        });
        return sendError(res, 401, "MFA_INVALID", "That code isn't valid. Try again.");
      }
    }

    const user = await loadUserWithSession({ id: credentials.id });
    if (!user) {
      return sendError(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    const workspaceId =
      user.defaultWorkspaceId ?? user.memberships[0]?.workspace.id;
    if (!workspaceId) {
      return sendError(res, 409, "NO_WORKSPACE", "No workspace is attached to this user");
    }

    const tokens = await issueTokenPair(user.id, workspaceId, requestContext(req));
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken, input.data.remember);
    await clearAuthFailures(input.data.email);
    await recordAuthEvent({ type: "LOGIN_SUCCESS", req, userId: user.id, email: user.email });

    if (wantsHtmlRedirect(req)) {
      const dest = user.memberships[0]?.workspace.onboardedAt ? "/dashboard" : "/onboarding";
      return res.redirect(303, appUrl(dest));
    }

    return sendData(res, serializeSession(user));
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/refresh", refreshRateLimit, async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[refreshCookieName];
    if (!refreshToken) {
      return sendError(res, 401, "NO_REFRESH_TOKEN", "Refresh token missing");
    }

    const rotated = await rotateRefreshToken(refreshToken);
    if (!rotated) {
      clearAuthCookies(res);
      return sendError(res, 401, "INVALID_REFRESH_TOKEN", "Refresh token invalid");
    }

    setAuthCookies(res, rotated.accessToken, rotated.refreshToken);
    const session = await loadSession(rotated.state.userId);
    return sendData(res, session);
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/forgot-password", passwordResetRateLimit, async (req, res, next) => {
  try {
    const input = forgotPasswordSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await prisma.user.findUnique({ where: { email: input.data.email } });
    if (user) {
      const token = randomToken();
      const tokenHash = sha256(token);
      await setToken(`password-reset:${tokenHash}`, user.id, 60 * 60);
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expires: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      const link = appUrl(`/reset-password/${token}`);
      try {
        await sendTransactionalEmail({
          to: user.email,
          subject: "Reset your MariMail password",
          html: `<p>Reset your password by opening <a href="${link}">this secure link</a>.</p>`,
          text: `Reset your MariMail password: ${link}`,
        });
      } catch (error) {
        // In development, surface a useful warning + fallback link so developers can complete flows locally.
        if (process.env.NODE_ENV !== "production") {
          console.warn(`Password reset email not sent for ${user.email}: ${(error as Error).message}`);
          console.warn(`Use this reset link manually: ${link}`);
          // Don't throw in development - allow flow to continue so tests/dev can proceed.
        } else {
          // In production, log the error but don't reveal details to the client — return delivered:true anyway.
          console.error(`Failed to send password reset email to ${user.email}: ${(error as Error).message}`);
        }
      }
    }

    return sendData(res, { delivered: true });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/reset-password", resetTokenRateLimit, async (req, res, next) => {
  try {
    const input = resetPasswordSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const tokenHash = sha256(input.data.token);
    const userId = await getToken(`password-reset:${tokenHash}`);
    if (!userId) {
      return sendError(res, 400, "INVALID_TOKEN", "Password reset token is invalid or expired");
    }

    const passwordHash = await bcrypt.hash(input.data.password, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.passwordResetToken.updateMany({
        where: { tokenHash, usedAt: null },
        data: { usedAt: new Date() },
      }),
      // Password reset is the account-recovery path: if someone else had the
      // account, changing the password MUST end their access. Previously every
      // existing refresh token stayed valid, so an attacker kept their session
      // even after the owner reset the password.
      prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await deleteToken(`password-reset:${tokenHash}`);
    await revokeAllUserRefreshTokens(userId);

    // Any other outstanding reset links are now stale too.
    await prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    return sendData(res, { reset: true });
  } catch (error) {
    return next(error);
  }
});

authRouter.get("/session", requireAuth, async (req, res, next) => {
  try {
    const session = await loadSession((req as AuthedRequest).auth.userId);
    if (!session) {
      return sendError(res, 404, "USER_NOT_FOUND", "User not found");
    }
    return sendData(res, session);
  } catch (error) {
    return next(error);
  }
});

authRouter.patch("/preferences", requireAuth, async (req, res, next) => {
  try {
    const input = preferencesSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { userId } = (req as AuthedRequest).auth;
    await prisma.user.update({
      where: { id: userId },
      data: { hiddenNavItems: input.data.hiddenNavItems },
    });

    const session = await loadSession(userId);
    if (!session) {
      return sendError(res, 404, "USER_NOT_FOUND", "User not found");
    }
    return sendData(res, session);
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/onboarding", requireAuth, async (req, res, next) => {
  try {
    const input = onboardingSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { userId, workspaceId } = (req as AuthedRequest).auth;
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!membership) {
      return sendError(res, 403, "WORKSPACE_FORBIDDEN", "Workspace access denied");
    }

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: input.data.workspaceName,
        // Only set when supplied — omitted values keep the column's existing
        // value / schema default (onboarding no longer collects these).
        ...(input.data.companyType ? { companyType: input.data.companyType } : {}),
        ...(input.data.primaryService ? { primaryService: input.data.primaryService } : {}),
        timezone: input.data.timezone,
        targetPortCountry: input.data.targetPortCountry,
        onboardedAt: new Date(),
      },
    });

    return sendData(res, { workspace });
  } catch (error) {
    return next(error);
  }
});

// --- Account security: password, sessions, MFA --------------------------------

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10),
});

/**
 * Change password while signed in. Previously impossible — the only path was
 * the forgot-password email loop, so there was no way to rotate a credential
 * quickly after a suspected compromise.
 *
 * Requires the current password (re-authentication) and ends every OTHER
 * session, keeping the caller signed in on this device.
 */
authRouter.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const input = changePasswordSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { userId } = (req as AuthedRequest).auth;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!user?.passwordHash) {
      return sendError(res, 400, "NO_PASSWORD_SET", "This account has no password set.");
    }

    const ok = await bcrypt.compare(input.data.currentPassword, user.passwordHash);
    if (!ok) {
      await recordAuthEvent({ type: "LOGIN_FAILED", req, userId, email: user.email, detail: "change-password reauth failed" });
      return sendError(res, 401, "INVALID_CREDENTIALS", "Current password is incorrect");
    }

    if (input.data.newPassword === input.data.currentPassword) {
      return sendError(res, 400, "SAME_PASSWORD", "New password must be different from the current one.");
    }

    const breaches = await breachedPasswordCount(input.data.newPassword);
    if (breaches > 0) {
      return sendError(
        res,
        400,
        "PASSWORD_BREACHED",
        `This password has appeared in ${breaches.toLocaleString("en")} known data breaches. Please choose a different one.`,
      );
    }

    const passwordHash = await bcrypt.hash(input.data.newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // Boot every other device, then re-issue for this one.
    await revokeAllUserRefreshTokens(userId);
    const workspaceId = (req as AuthedRequest).auth.workspaceId;
    const tokens = await issueTokenPair(userId, workspaceId, requestContext(req));
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    await recordAuthEvent({ type: "PASSWORD_CHANGED", req, userId, email: user.email });

    return sendData(res, { changed: true });
  } catch (error) {
    return next(error);
  }
});

/** The caller's active sessions, newest first, for a "your devices" screen. */
authRouter.get("/sessions", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthedRequest).auth;
    const currentRefresh = req.cookies?.[refreshCookieName];
    const currentHash = currentRefresh ? sha256(currentRefresh) : null;

    const sessions = await prisma.session.findMany({
      where: { userId, revokedAt: null, expires: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expires: true,
        refreshTokenHash: true,
      },
    });

    return sendData(
      res,
      sessions.map((session) => ({
        id: session.id,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
        expires: session.expires.toISOString(),
        // So the UI can label one "this device" and avoid revoking it by accident.
        current: Boolean(currentHash && session.refreshTokenHash === currentHash),
      })),
    );
  } catch (error) {
    return next(error);
  }
});

/** Revoke one of the caller's own sessions (scoped by userId — no IDOR). */
authRouter.delete("/sessions/:id", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthedRequest).auth;
    const session = await prisma.session.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true, refreshTokenHash: true },
    });
    if (!session) return sendError(res, 404, "SESSION_NOT_FOUND", "Session not found");

    if (session.refreshTokenHash) {
      await deleteToken(`refresh:${session.refreshTokenHash}`);
      await deleteToken(`refresh-used:${session.refreshTokenHash}`);
    }
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await recordAuthEvent({ type: "SESSION_REVOKED", req, userId, detail: session.id });

    return sendData(res, { revoked: true });
  } catch (error) {
    return next(error);
  }
});

/**
 * Begin MFA enrolment: generate a secret and return the otpauth:// URI for the
 * QR code. Nothing is enabled until /mfa/confirm proves the user can produce a
 * valid code — otherwise a failed setup would lock them out.
 */
authRouter.post("/mfa/setup", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthedRequest).auth;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, mfaEnabled: true },
    });
    if (!user) return sendError(res, 404, "USER_NOT_FOUND", "User not found");
    if (user.mfaEnabled) {
      return sendError(res, 409, "MFA_ALREADY_ENABLED", "Two-factor authentication is already on.");
    }

    const secret = generateTotpSecret();
    // Stored encrypted and NOT yet enabled.
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: encryptSecret(secret) as object },
    });

    return sendData(res, { secret, otpauthUri: totpAuthUri(secret, user.email) });
  } catch (error) {
    return next(error);
  }
});

/** Confirm enrolment with a live code, then enable MFA and issue recovery codes. */
authRouter.post("/mfa/confirm", requireAuth, async (req, res, next) => {
  try {
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    const { userId } = (req as AuthedRequest).auth;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, mfaSecret: true, mfaEnabled: true },
    });
    if (!user?.mfaSecret) {
      return sendError(res, 400, "MFA_NOT_STARTED", "Start setup before confirming.");
    }
    const envelope = parseEncryptedSecret(user.mfaSecret);
    const secret = envelope ? decryptSecret(envelope) : null;
    if (!secret || !verifyTotp(secret, code)) {
      await recordAuthEvent({ type: "MFA_CHALLENGE_FAILED", req, userId, email: user.email, detail: "enrolment" });
      return sendError(res, 400, "MFA_INVALID", "That code isn't valid. Check your authenticator and try again.");
    }

    const { plain, hashed } = generateRecoveryCodes();
    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaEnrolledAt: new Date(), mfaRecoveryCodes: hashed },
    });
    await recordAuthEvent({ type: "MFA_ENABLED", req, userId, email: user.email });

    // Only time the plaintext codes are ever available.
    return sendData(res, { enabled: true, recoveryCodes: plain });
  } catch (error) {
    return next(error);
  }
});

/** Turn MFA off. Requires the password — a hijacked session must not suffice. */
authRouter.post("/mfa/disable", requireAuth, async (req, res, next) => {
  try {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const { userId } = (req as AuthedRequest).auth;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, passwordHash: true, mfaEnabled: true },
    });
    if (!user?.mfaEnabled) {
      return sendError(res, 400, "MFA_NOT_ENABLED", "Two-factor authentication isn't on.");
    }
    if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return sendError(res, 401, "INVALID_CREDENTIALS", "Password is incorrect");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: Prisma.DbNull, mfaRecoveryCodes: [], mfaEnrolledAt: null },
    });
    await recordAuthEvent({ type: "MFA_DISABLED", req, userId, email: user.email });

    return sendData(res, { disabled: true });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[refreshCookieName];
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    clearAuthCookies(res);
    return sendData(res, { loggedOut: true });
  } catch (error) {
    return next(error);
  }
});
