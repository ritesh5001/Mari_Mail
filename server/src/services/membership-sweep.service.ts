import { prisma } from "@marimail/db";
import { renderEmailLayout, sendTransactionalEmail } from "@marimail/email";
import {
  GRACE_PERIOD_DAYS,
  PLANS,
  RENEWAL_REMINDER_DAYS,
  formatUsdCents,
} from "@marimail/utils/plans";
import { addDays, downgradeToFree } from "./membership.service.js";

/**
 * The daily membership sweep.
 *
 * Runs the transitions nothing else can trigger, because they are driven by the
 * passage of time rather than by a user action:
 *
 *   · remind before a period ends (T-7, T-1)
 *   · mark an elapsed period PAST_DUE — still working, inside the grace window
 *   · downgrade once the grace window closes
 *
 * Without this, `currentPeriodEnd` was decoration: a workspace that stopped
 * paying kept full access forever, because the only thing that ever changed a
 * plan was a successful payment.
 */

const APP_URL = () => process.env.APP_URL ?? "http://localhost:3000";

export type SweepResult = {
  remindersSent: number;
  markedPastDue: number;
  downgraded: number;
  errors: number;
};

function billingUrl() {
  return `${APP_URL()}/dashboard/billing`;
}

async function notifyOwner(
  workspace: { id: string; name: string; ownerId: string },
  email: { subject: string; heading: string; body: string[]; ctaLabel: string; preheader: string },
) {
  const owner = await prisma.user.findUnique({
    where: { id: workspace.ownerId },
    select: { email: true, name: true },
  });
  if (!owner?.email) return false;

  await sendTransactionalEmail({
    to: owner.email,
    subject: email.subject,
    html: renderEmailLayout({
      heading: email.heading,
      body: email.body,
      cta: { label: email.ctaLabel, url: billingUrl() },
      preheader: email.preheader,
      footnote: `You're receiving this because you own the ${workspace.name} workspace on MariMail.`,
    }),
  });
  return true;
}

/**
 * Renewal reminders at T-7 and T-1.
 *
 * `lastRenewalReminderAt` is compared against the START of the current reminder
 * window rather than simply "did we send today". A sweep that runs twice in a
 * day — a restart, a manual trigger — would otherwise email the customer twice.
 */
async function sendRenewalReminders(): Promise<{ sent: number; errors: number }> {
  const now = new Date();
  let sent = 0;
  let errors = 0;

  for (const daysOut of RENEWAL_REMINDER_DAYS) {
    const windowStart = addDays(now, daysOut - 1);
    const windowEnd = addDays(now, daysOut);

    const due = await prisma.workspace.findMany({
      where: {
        billingStatus: { in: ["ACTIVE", "TRIALING"] },
        currentPeriodEnd: { gte: windowStart, lt: windowEnd },
        // Not already reminded within this window.
        OR: [{ lastRenewalReminderAt: null }, { lastRenewalReminderAt: { lt: windowStart } }],
      },
      select: { id: true, name: true, ownerId: true, plan: true, currentPeriodEnd: true },
      take: 500,
    });

    for (const workspace of due) {
      const def = PLANS[workspace.plan];
      const price = def.priceCents === null ? "your plan" : formatUsdCents(def.priceCents);
      try {
        await notifyOwner(workspace, {
          subject:
            daysOut === 1
              ? `Your MariMail ${def.label} plan renews tomorrow`
              : `Your MariMail ${def.label} plan renews in ${daysOut} days`,
          heading: `${def.label} plan — renewal due`,
          preheader: `Renew to keep ${workspace.name} running without interruption.`,
          body: [
            `Your <strong>${def.label}</strong> plan for <strong>${workspace.name}</strong> ends on ${workspace.currentPeriodEnd?.toDateString() ?? "soon"}.`,
            `Renew for ${price} to keep your campaigns, vessel tracking and contact credits running without interruption.`,
            `If you don't renew, your workspace keeps working for a further ${GRACE_PERIOD_DAYS} days before it drops to the free limits. Nothing is deleted.`,
          ],
          ctaLabel: "Renew now",
        });
        await prisma.workspace.update({
          where: { id: workspace.id },
          data: { lastRenewalReminderAt: now },
        });
        sent += 1;
      } catch (error) {
        // One undeliverable address must not stop the rest of the sweep.
        errors += 1;
        console.error(
          `[membership] reminder failed for workspace ${workspace.id}: ${(error as Error).message}`,
        );
      }
    }
  }

  return { sent, errors };
}

/**
 * Moves elapsed periods to PAST_DUE.
 *
 * PAST_DUE still works. This is the "your card didn't go through" state, and
 * cutting a customer's live outreach the instant a renewal slips would cause
 * far more damage than the few days of unpaid usage it prevents.
 */
async function markPastDue(): Promise<{ count: number; errors: number }> {
  const now = new Date();
  let errors = 0;

  const lapsed = await prisma.workspace.findMany({
    where: {
      billingStatus: { in: ["ACTIVE", "TRIALING"] },
      currentPeriodEnd: { lt: now },
    },
    select: { id: true, name: true, ownerId: true, plan: true },
    take: 500,
  });

  for (const workspace of lapsed) {
    const def = PLANS[workspace.plan];
    try {
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { billingStatus: "PAST_DUE" },
      });
      await notifyOwner(workspace, {
        subject: `Action needed: your MariMail ${def.label} plan has expired`,
        heading: "Your plan has expired",
        preheader: `${workspace.name} keeps working for ${GRACE_PERIOD_DAYS} more days.`,
        body: [
          `The ${def.label} plan for <strong>${workspace.name}</strong> has expired.`,
          `Your workspace is still fully working for the next <strong>${GRACE_PERIOD_DAYS} days</strong>. After that it drops to the free limits — campaigns pause and vessel tracking narrows to one country.`,
          "Nothing is deleted, and renewing restores everything immediately.",
        ],
        ctaLabel: "Renew your plan",
      });
    } catch (error) {
      errors += 1;
      console.error(
        `[membership] past-due transition failed for workspace ${workspace.id}: ${(error as Error).message}`,
      );
    }
  }

  return { count: lapsed.length - errors, errors };
}

/** Downgrades workspaces whose grace period has now closed. */
async function downgradeExpired(): Promise<{ count: number; errors: number }> {
  const cutoff = addDays(new Date(), -GRACE_PERIOD_DAYS);
  let count = 0;
  let errors = 0;

  const expired = await prisma.workspace.findMany({
    where: {
      billingStatus: "PAST_DUE",
      currentPeriodEnd: { lt: cutoff },
      // `downgradedAt` makes this idempotent — without it every subsequent
      // sweep would re-downgrade and re-email the same workspace daily.
      downgradedAt: null,
    },
    select: { id: true, name: true, ownerId: true, plan: true },
    take: 500,
  });

  for (const workspace of expired) {
    try {
      await downgradeToFree(workspace.id, `grace period of ${GRACE_PERIOD_DAYS} days elapsed`);
      await notifyOwner(workspace, {
        subject: "Your MariMail workspace has moved to the free limits",
        heading: "Moved to free limits",
        preheader: "Your data is safe — renew any time to restore full access.",
        body: [
          `<strong>${workspace.name}</strong> has moved to the free limits because the plan wasn't renewed.`,
          "Your vessels, lists, contacts and campaign history are all still here — nothing has been deleted. Sending is paused and country tracking is limited to one country.",
          "Renewing restores everything exactly as it was.",
        ],
        ctaLabel: "Restore full access",
      });
      count += 1;
    } catch (error) {
      errors += 1;
      console.error(
        `[membership] downgrade failed for workspace ${workspace.id}: ${(error as Error).message}`,
      );
    }
  }

  return { count, errors };
}

export async function sweepMemberships(): Promise<SweepResult> {
  // Order matters: remind before marking past due (so a workspace expiring
  // today still gets its T-1 notice), and mark past due before downgrading
  // (so nothing skips the grace period).
  const reminders = await sendRenewalReminders();
  const pastDue = await markPastDue();
  const downgrades = await downgradeExpired();

  const result: SweepResult = {
    remindersSent: reminders.sent,
    markedPastDue: pastDue.count,
    downgraded: downgrades.count,
    errors: reminders.errors + pastDue.errors + downgrades.errors,
  };

  if (result.remindersSent || result.markedPastDue || result.downgraded || result.errors) {
    console.log(`[membership] sweep: ${JSON.stringify(result)}`);
  }
  return result;
}
