import { Router } from "express";
import { z } from "zod";
import { prisma, type BillingPlan, type Prisma } from "@marimail/db";
import { PLANS } from "@marimail/utils/plans";
import { invalidateAccountState, requireSuperAdmin, type AuthedRequest } from "../../auth/middleware.js";
import { sendData, sendError } from "../../lib/http.js";
import { applyPlanToWorkspace, grantCredits } from "../../services/billing.service.js";
import { rewardReferralForPurchase } from "../../services/referral.service.js";

/**
 * The people directory of the admin panel (super-admin only).
 *
 * One place to see everyone on the platform — who signed up, who finished
 * onboarding, who is paying and on what — and to act on them: grant a
 * subscription off-platform, top up credits, suspend an account.
 *
 * Every mutation writes an AdminAuditLog row. These endpoints are the only
 * application-level writers of `bannedAt`, so they also drop the middleware's
 * account cache to make a suspension take effect on the next request rather
 * than 30 seconds later.
 */
export const adminUsersRouter = Router();

const BILLING_PLANS = ["STARTER", "PRO", "BUSINESS", "ENTERPRISE"] as const;
const BILLING_STATUSES = ["ACTIVE", "PAST_DUE", "CANCELED", "TRIALING"] as const;

/** Tabs in the admin UI, expressed as workspace-level predicates. */
const TABS = ["all", "subscribed", "trialing", "onboarded", "unonboarded", "banned", "admins"] as const;
type Tab = (typeof TABS)[number];

const listSchema = z.object({
  query: z.string().trim().max(200).optional(),
  tab: z.enum(TABS).default("all"),
  plan: z.enum(BILLING_PLANS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * A user is "on" a workspace either by owning it or by membership. Tab filters
 * ask about the workspaces they belong to, hence the nested `some`.
 */
function tabFilter(tab: Tab): Prisma.UserWhereInput {
  switch (tab) {
    case "subscribed":
      return {
        memberships: {
          some: { workspace: { billingStatus: { in: ["ACTIVE", "PAST_DUE"] } } },
        },
      };
    case "trialing":
      return { memberships: { some: { workspace: { billingStatus: "TRIALING" } } } };
    case "onboarded":
      return { memberships: { some: { workspace: { onboardedAt: { not: null } } } } };
    case "unonboarded":
      return { memberships: { none: { workspace: { onboardedAt: { not: null } } } } };
    case "banned":
      return { bannedAt: { not: null } };
    case "admins":
      return { isSuperAdmin: true };
    case "all":
    default:
      return {};
  }
}

adminUsersRouter.get("/", requireSuperAdmin, async (req, res, next) => {
  try {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { query, tab, plan, page, pageSize } = parsed.data;

    // AND rather than object spread: the tab, the search and the plan filter can
    // each contribute a `memberships` clause, and spreading would silently drop
    // all but the last one.
    const where: Prisma.UserWhereInput = {
      AND: [
        tabFilter(tab),
        query
          ? {
              OR: [
                { email: { contains: query, mode: "insensitive" as const } },
                { name: { contains: query, mode: "insensitive" as const } },
                { memberships: { some: { workspace: { name: { contains: query, mode: "insensitive" as const } } } } },
              ],
            }
          : {},
        plan ? { memberships: { some: { workspace: { plan } } } } : {},
      ],
    };

    const [total, users, summary] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          emailVerified: true,
          isSuperAdmin: true,
          bannedAt: true,
          mfaEnabled: true,
          lastActiveAt: true,
          createdAt: true,
          defaultWorkspaceId: true,
          memberships: {
            select: {
              role: true,
              workspace: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  plan: true,
                  billingStatus: true,
                  creditBalance: true,
                  countryLimit: true,
                  currentPeriodEnd: true,
                  trialEndsAt: true,
                  onboardedAt: true,
                  ownerId: true,
                  paymentProvider: true,
                },
              },
            },
          },
        },
      }),
      loadSummary(),
    ]);

    // Revenue is per workspace, so roll it up for the workspaces on this page
    // only — a platform-wide join would be far more expensive than it is worth.
    const workspaceIds = [...new Set(users.flatMap((u) => u.memberships.map((m) => m.workspace.id)))];
    const paidByWorkspace = workspaceIds.length
      ? await prisma.payment.groupBy({
          by: ["workspaceId"],
          where: { workspaceId: { in: workspaceIds }, status: "PAID" },
          _sum: { amountCents: true },
          _max: { paidAt: true },
          _count: { _all: true },
        })
      : [];
    const paidMap = new Map(paidByWorkspace.map((row) => [row.workspaceId, row]));

    const rows = users.map((user) => {
      const workspaces = user.memberships.map((m) => ({
        ...m.workspace,
        role: m.role,
        isOwner: m.workspace.ownerId === user.id,
      }));
      const primary =
        workspaces.find((w) => w.id === user.defaultWorkspaceId) ??
        workspaces.find((w) => w.isOwner) ??
        workspaces[0] ??
        null;

      // Only count money from workspaces this user owns, so a shared workspace
      // isn't credited to every member as if they each paid for it.
      const owned = workspaces.filter((w) => w.isOwner);
      const totalPaidCents = owned.reduce((sum, w) => sum + (paidMap.get(w.id)?._sum.amountCents ?? 0), 0);
      const paymentCount = owned.reduce((sum, w) => sum + (paidMap.get(w.id)?._count._all ?? 0), 0);
      const lastPaidAt = owned
        .map((w) => paidMap.get(w.id)?._max.paidAt ?? null)
        .filter((d): d is Date => Boolean(d))
        .sort((a, b) => b.getTime() - a.getTime())[0];

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        emailVerified: user.emailVerified,
        isSuperAdmin: user.isSuperAdmin,
        bannedAt: user.bannedAt,
        mfaEnabled: user.mfaEnabled,
        lastActiveAt: user.lastActiveAt,
        createdAt: user.createdAt,
        workspaces,
        primaryWorkspace: primary,
        totalPaidCents,
        paymentCount,
        lastPaidAt: lastPaidAt ?? null,
      };
    });

    return sendData(res, { users: rows, total, page, pageSize, summary });
  } catch (error) {
    return next(error);
  }
});

/** Counters for the tab strip; cheap enough to recompute per request. */
async function loadSummary() {
  const [total, banned, admins, onboarded, subscribed, trialing] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { bannedAt: { not: null } } }),
    prisma.user.count({ where: { isSuperAdmin: true } }),
    prisma.user.count({ where: tabFilter("onboarded") }),
    prisma.user.count({ where: tabFilter("subscribed") }),
    prisma.user.count({ where: tabFilter("trialing") }),
  ]);
  return { total, banned, admins, onboarded, subscribed, trialing, unonboarded: total - onboarded };
}

// --- Detail ----------------------------------------------------------------

adminUsersRouter.get("/:id", requireSuperAdmin, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        emailVerified: true,
        isSuperAdmin: true,
        bannedAt: true,
        mfaEnabled: true,
        themePreference: true,
        lastActiveAt: true,
        createdAt: true,
        updatedAt: true,
        defaultWorkspaceId: true,
        memberships: {
          select: {
            role: true,
            createdAt: true,
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true,
                companyType: true,
                plan: true,
                billingStatus: true,
                creditBalance: true,
                vesselLimit: true,
                emailLimit: true,
                inboxLimit: true,
                teamLimit: true,
                countryLimit: true,
                allowedCountries: true,
                currentPeriodEnd: true,
                trialEndsAt: true,
                onboardedAt: true,
                downgradedAt: true,
                paymentProvider: true,
                ownerId: true,
                createdAt: true,
                _count: { select: { members: true, vessels: true, contacts: true, campaigns: true } },
              },
            },
          },
        },
      },
    });
    if (!user) return sendError(res, 404, "NOT_FOUND", "User not found");

    const workspaceIds = user.memberships.map((m) => m.workspace.id);
    const [payments, creditLedger, paymentLinks, auditLog] = await Promise.all([
      workspaceIds.length
        ? prisma.payment.findMany({
            where: { workspaceId: { in: workspaceIds } },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
              id: true,
              workspaceId: true,
              provider: true,
              status: true,
              purpose: true,
              amountCents: true,
              currency: true,
              grantPlan: true,
              grantCredits: true,
              periodDays: true,
              failureReason: true,
              paidAt: true,
              createdAt: true,
            },
          })
        : [],
      workspaceIds.length
        ? prisma.creditLedger.findMany({
            where: { workspaceId: { in: workspaceIds } },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
              id: true,
              workspaceId: true,
              delta: true,
              balance: true,
              reason: true,
              detail: true,
              createdAt: true,
              actor: { select: { id: true, name: true, email: true } },
            },
          })
        : [],
      workspaceIds.length
        ? prisma.paymentLink.findMany({
            where: { workspaceId: { in: workspaceIds } },
            orderBy: { createdAt: "desc" },
            take: 25,
          })
        : [],
      prisma.adminAuditLog.findMany({
        where: { targetType: "USER", targetId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          action: true,
          detail: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    const workspaces = user.memberships.map((m) => ({
      ...m.workspace,
      role: m.role,
      joinedAt: m.createdAt,
      isOwner: m.workspace.ownerId === user.id,
    }));

    return sendData(res, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        emailVerified: user.emailVerified,
        isSuperAdmin: user.isSuperAdmin,
        bannedAt: user.bannedAt,
        mfaEnabled: user.mfaEnabled,
        lastActiveAt: user.lastActiveAt,
        createdAt: user.createdAt,
        defaultWorkspaceId: user.defaultWorkspaceId,
      },
      workspaces,
      payments,
      creditLedger,
      paymentLinks,
      auditLog,
    });
  } catch (error) {
    return next(error);
  }
});

// --- Mutations -------------------------------------------------------------

/**
 * Resolves which workspace an action applies to. Credits and plans belong to a
 * workspace, not a user, so an explicit id wins; otherwise fall back to the
 * user's default workspace and then to one they own.
 */
async function resolveWorkspace(userId: string, workspaceId?: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspace: { select: { id: true, name: true, ownerId: true } } },
  });
  const owned = memberships.map((m) => m.workspace);
  if (workspaceId) return owned.find((w) => w.id === workspaceId) ?? null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { defaultWorkspaceId: true } });
  return (
    owned.find((w) => w.id === user?.defaultWorkspaceId) ?? owned.find((w) => w.ownerId === userId) ?? owned[0] ?? null
  );
}

const creditsSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  // Negative deducts. Bounded so a slipped keystroke can't mint millions.
  credits: z.number().int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0, "Enter a non-zero amount"),
  note: z.string().max(500).optional(),
});

adminUsersRouter.post("/:id/credits", requireSuperAdmin, async (req, res, next) => {
  try {
    const parsed = creditsSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { credits, note } = parsed.data;
    const actorId = (req as AuthedRequest).auth.userId;

    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true } });
    if (!user) return sendError(res, 404, "NOT_FOUND", "User not found");

    const workspace = await resolveWorkspace(user.id, parsed.data.workspaceId);
    if (!workspace) return sendError(res, 404, "NOT_FOUND", "No workspace found for this user");

    if (credits < 0) {
      const current = await prisma.workspace.findUnique({
        where: { id: workspace.id },
        select: { creditBalance: true },
      });
      if ((current?.creditBalance ?? 0) + credits < 0) {
        return sendError(
          res,
          400,
          "INSUFFICIENT_CREDITS",
          `Cannot deduct ${Math.abs(credits)} credits — the balance is ${current?.creditBalance ?? 0}.`,
        );
      }
    }

    const balance = await grantCredits(
      workspace.id,
      credits,
      credits > 0 ? "ADMIN_GRANT" : "ADJUSTMENT",
      note ?? (credits > 0 ? "Admin credit grant" : "Admin credit adjustment"),
      actorId,
    );

    await prisma.adminAuditLog.create({
      data: {
        actorId,
        action: "CREDITS_GRANTED",
        targetType: "USER",
        targetId: user.id,
        detail: { workspaceId: workspace.id, workspaceName: workspace.name, credits, balance, note: note ?? null },
      },
    });

    return sendData(res, { workspaceId: workspace.id, creditBalance: balance });
  } catch (error) {
    return next(error);
  }
});

const subscriptionSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  plan: z.enum(BILLING_PLANS),
  billingStatus: z.enum(BILLING_STATUSES).default("ACTIVE"),
  /** Days of access this grant buys, counted from now. */
  periodDays: z.number().int().min(1).max(3650).default(30),
  /** Whether to top the workspace up with the plan's monthly credit allowance. */
  replenishCredits: z.boolean().default(true),
  /** Record a MANUAL payment so the grant shows up in revenue and history. */
  recordPayment: z.boolean().default(true),
  /** What the customer actually paid off-platform, in cents. */
  amountCents: z.number().int().min(0).max(100_000_000).optional(),
  currency: z.string().length(3).optional(),
  note: z.string().max(500).optional(),
});

adminUsersRouter.post("/:id/subscription", requireSuperAdmin, async (req, res, next) => {
  try {
    const parsed = subscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { plan, billingStatus, periodDays, replenishCredits, recordPayment, currency, note } = parsed.data;
    const actorId = (req as AuthedRequest).auth.userId;

    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!user) return sendError(res, 404, "NOT_FOUND", "User not found");

    const workspace = await resolveWorkspace(user.id, parsed.data.workspaceId);
    if (!workspace) return sendError(res, 404, "NOT_FOUND", "No workspace found for this user");

    const currentPeriodEnd = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000);
    const catalog = PLANS[plan as BillingPlan];
    // Enterprise has no list price, so an admin grant of it defaults to 0 and
    // the real figure is whatever the admin types in.
    const amountCents = parsed.data.amountCents ?? catalog.priceCents ?? 0;

    const updated = await applyPlanToWorkspace(workspace.id, plan as BillingPlan, {
      billingStatus,
      currentPeriodEnd,
      replenishCredits,
      actorId,
    });

    // Country access follows the plan, matching what a paid checkout provisions.
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        countryLimit: catalog.countryLimit,
        downgradedAt: null,
        lastRenewalReminderAt: null,
        ...(recordPayment ? { paymentProvider: "MANUAL" as const } : {}),
      },
    });

    // A subscription an admin grants by hand is still a conversion, so it pays
    // the referrer on the same terms as a self-serve checkout — otherwise the
    // reward would depend on which door the customer happened to come through.
    try {
      await rewardReferralForPurchase(workspace.id, { plan: plan as BillingPlan });
    } catch (error) {
      console.error("[referral] reward failed for admin grant", workspace.id, error);
    }

    if (recordPayment) {
      await prisma.payment.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          provider: "MANUAL",
          status: "PAID",
          purpose: "PLAN",
          amountCents,
          currency: (currency ?? "USD").toUpperCase(),
          grantPlan: plan as BillingPlan,
          grantCredits: replenishCredits ? catalog.monthlyCredits : null,
          periodDays,
          paidAt: new Date(),
        },
      });
    }

    await prisma.adminAuditLog.create({
      data: {
        actorId,
        action: "PLAN_CHANGED",
        targetType: "USER",
        targetId: user.id,
        detail: {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          plan,
          billingStatus,
          periodDays,
          replenishCredits,
          recordPayment,
          amountCents,
          note: note ?? null,
        },
      },
    });

    return sendData(res, {
      workspace: {
        id: updated.id,
        plan: updated.plan,
        billingStatus,
        creditBalance: updated.creditBalance,
        currentPeriodEnd,
      },
    });
  } catch (error) {
    return next(error);
  }
});

const banSchema = z.object({ reason: z.string().max(500).optional() });

adminUsersRouter.post("/:id/ban", requireSuperAdmin, async (req, res, next) => {
  try {
    const parsed = banSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const actorId = (req as AuthedRequest).auth.userId;
    if (actorId === req.params.id) {
      return sendError(res, 400, "SELF_BAN", "You cannot suspend your own account.");
    }

    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, isSuperAdmin: true },
    });
    if (!target) return sendError(res, 404, "NOT_FOUND", "User not found");
    if (target.isSuperAdmin) {
      return sendError(res, 400, "ADMIN_PROTECTED", "Super admins cannot be suspended from here.");
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { bannedAt: new Date() },
      select: { id: true, bannedAt: true },
    });
    // Sessions are checked against a 30s cache; drop it so the ban bites now.
    invalidateAccountState(target.id);

    await prisma.adminAuditLog.create({
      data: {
        actorId,
        action: "USER_BANNED",
        targetType: "USER",
        targetId: target.id,
        detail: { reason: parsed.data.reason ?? null },
      },
    });
    return sendData(res, { user: updated });
  } catch (error) {
    return next(error);
  }
});

adminUsersRouter.post("/:id/unban", requireSuperAdmin, async (req, res, next) => {
  try {
    const actorId = (req as AuthedRequest).auth.userId;
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!target) return sendError(res, 404, "NOT_FOUND", "User not found");

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { bannedAt: null },
      select: { id: true, bannedAt: true },
    });
    invalidateAccountState(target.id);

    await prisma.adminAuditLog.create({
      data: { actorId, action: "USER_UNBANNED", targetType: "USER", targetId: target.id },
    });
    return sendData(res, { user: updated });
  } catch (error) {
    return next(error);
  }
});
