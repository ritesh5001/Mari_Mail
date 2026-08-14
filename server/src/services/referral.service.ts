import { prisma, type BillingPlan, type Prisma } from "@marimail/db";
import {
  PLANS,
  REFERRAL_REWARD_WINDOW_DAYS,
  referralRewardCredits,
} from "@marimail/utils/plans";

/**
 * The referral programme.
 *
 * One rule, stated once: a referrer is paid 10% of the referred user's plan
 * credits, once, when that user's FIRST subscription payment lands inside the
 * 14-day window opened at signup.
 *
 * Three properties are load-bearing and each is enforced at the database level
 * rather than by careful calling:
 *
 *  1. One referral per referred user — a unique index on `referredUserId`. A
 *     person cannot be referred twice, by two people, or re-referred on a
 *     renewal.
 *  2. Paid at most once — the payout claims the row with a conditional update
 *     (`status: PENDING` in the WHERE), so two webhooks racing the same payment
 *     produce one reward, not two.
 *  3. Nobody refers themselves — checked at attribution, where both identities
 *     are known.
 */

/** Ambiguous characters (0/O, 1/I/L) are excluded: codes get read aloud. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function randomCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function normalizeReferralCode(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * The user's code, minted on first request.
 *
 * Lazy rather than at signup so existing accounts get one the moment they open
 * the referrals page, with no backfill migration.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  // Retry on collision. With 31^8 codes a clash is vanishingly unlikely, but
  // "unlikely" and "handled" are different things when the column is unique.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode();
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return updated.referralCode as string;
    } catch (error) {
      const isUnique =
        typeof error === "object" &&
        error !== null &&
        (error as { code?: string }).code === "P2002";
      if (!isUnique) throw error;
    }
  }
  throw new Error("Could not allocate a referral code");
}

export type ReferralCodeOwner = {
  userId: string;
  workspaceId: string;
  name: string | null;
};

/** Resolves a code to the person (and workspace) that would be paid. */
export async function resolveReferralCode(code: string): Promise<ReferralCodeOwner | null> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;

  const owner = await prisma.user.findUnique({
    where: { referralCode: normalized },
    select: {
      id: true,
      name: true,
      defaultWorkspaceId: true,
      memberships: {
        select: { workspaceId: true, workspace: { select: { ownerId: true } } },
      },
    },
  });
  if (!owner) return null;

  // Where the credits land. Their default workspace, else one they own, else
  // any membership — a code with no workspace behind it cannot be paid, so it
  // is treated as unresolvable rather than half-valid.
  const workspaceId =
    owner.memberships.find((m) => m.workspaceId === owner.defaultWorkspaceId)?.workspaceId ??
    owner.memberships.find((m) => m.workspace.ownerId === owner.id)?.workspaceId ??
    owner.memberships[0]?.workspaceId;
  if (!workspaceId) return null;

  return { userId: owner.id, workspaceId, name: owner.name };
}

/**
 * Records that a new signup came from a code. Called inside the registration
 * transaction so a failed signup leaves no dangling referral.
 *
 * Returns null — never throws — when the code is unknown, self-referring, or
 * already used. A bad code must not cost someone their account: they signed up
 * to use the product, and the invite is a bonus on top.
 */
export async function attachReferralAtSignup(
  tx: Prisma.TransactionClient,
  input: {
    code: string;
    referredUserId: string;
    referredWorkspaceId: string;
    owner: ReferralCodeOwner;
  },
) {
  if (input.owner.userId === input.referredUserId) return null;
  if (input.owner.workspaceId === input.referredWorkspaceId) return null;

  const expiresAt = new Date(Date.now() + REFERRAL_REWARD_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  try {
    return await tx.referral.create({
      data: {
        code: normalizeReferralCode(input.code),
        referrerUserId: input.owner.userId,
        referrerWorkspaceId: input.owner.workspaceId,
        referredUserId: input.referredUserId,
        referredWorkspaceId: input.referredWorkspaceId,
        expiresAt,
      },
    });
  } catch {
    // Unique violation = already referred. Nothing to do and nothing to say.
    return null;
  }
}

export type ReferralRewardResult =
  | { status: "none" }
  | { status: "expired"; referralId: string }
  | { status: "rewarded"; referralId: string; credits: number; referrerWorkspaceId: string };

/**
 * Pays the referrer for a subscription, if one is owed.
 *
 * Called from every path that can start a paid membership — gateway webhook,
 * admin manual grant, admin payment link — so a customer provisioned by hand
 * earns the referrer exactly what a self-serve checkout would.
 *
 * Safe to call for any purchase: it is a no-op when the workspace wasn't
 * referred, when the window has closed (which it marks EXPIRED so the state is
 * visible rather than merely implied), or when the reward was already paid.
 */
export async function rewardReferralForPurchase(
  referredWorkspaceId: string,
  purchase: { plan: BillingPlan; paymentId?: string | null },
): Promise<ReferralRewardResult> {
  const referral = await prisma.referral.findUnique({
    where: { referredWorkspaceId },
    select: { id: true, status: true, expiresAt: true, referrerWorkspaceId: true },
  });
  if (!referral || referral.status !== "PENDING") return { status: "none" };

  if (referral.expiresAt.getTime() < Date.now()) {
    await prisma.referral.updateMany({
      where: { id: referral.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    return { status: "expired", referralId: referral.id };
  }

  const credits = referralRewardCredits(PLANS[purchase.plan].monthlyCredits);
  if (credits <= 0) return { status: "none" };

  // Claim the referral BEFORE granting, conditional on it still being PENDING.
  // Two webhooks for the same payment race here; exactly one wins the update
  // and only that one grants credits.
  const claimed = await prisma.referral.updateMany({
    where: { id: referral.id, status: "PENDING" },
    data: {
      status: "REWARDED",
      rewardCredits: credits,
      rewardedAt: new Date(),
      paymentId: purchase.paymentId ?? null,
    },
  });
  if (claimed.count === 0) return { status: "none" };

  const workspace = await prisma.workspace.update({
    where: { id: referral.referrerWorkspaceId },
    data: { creditBalance: { increment: credits } },
    select: { creditBalance: true },
  });
  await prisma.creditLedger.create({
    data: {
      workspaceId: referral.referrerWorkspaceId,
      delta: credits,
      balance: workspace.creditBalance,
      reason: "REFERRAL_REWARD",
      detail: `Referral reward — ${PLANS[purchase.plan].label} subscription`,
    },
  });

  return {
    status: "rewarded",
    referralId: referral.id,
    credits,
    referrerWorkspaceId: referral.referrerWorkspaceId,
  };
}

/**
 * Marks every referral whose window has closed without a purchase.
 *
 * The payout path already refuses an expired referral, so this is presentation
 * rather than enforcement: without it a referrals page would show "pending"
 * against invitations that can no longer pay, which reads as a promise the
 * product will not keep.
 */
export async function expireStaleReferrals(): Promise<number> {
  const result = await prisma.referral.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

/** Everything the referrals page shows for one user. */
export async function referralSummary(userId: string) {
  await expireStaleReferrals();
  const [code, referrals, earned] = await Promise.all([
    getOrCreateReferralCode(userId),
    prisma.referral.findMany({
      where: { referrerUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        status: true,
        expiresAt: true,
        rewardCredits: true,
        rewardedAt: true,
        createdAt: true,
        referred: { select: { name: true, email: true } },
        referredWorkspace: { select: { name: true, plan: true, billingStatus: true } },
      },
    }),
    prisma.referral.aggregate({
      where: { referrerUserId: userId, status: "REWARDED" },
      _sum: { rewardCredits: true },
      _count: { _all: true },
    }),
  ]);

  return {
    code,
    referrals,
    totals: {
      invited: referrals.length,
      converted: earned._count._all,
      creditsEarned: earned._sum.rewardCredits ?? 0,
      pending: referrals.filter((r) => r.status === "PENDING").length,
    },
    rewardRatePercent: 10,
    windowDays: REFERRAL_REWARD_WINDOW_DAYS,
  };
}
